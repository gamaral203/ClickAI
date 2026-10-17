import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Protótipo do Google Drive (docs/arquitetura.md, "Armazenamento experimental"): no evento
// `hibrido`, com a trava ligada e a conta conectada, o original vai ao Drive na confirmação do
// envio e volta por streaming no download; o resto (upload do navegador, prévias) fica no R2.
//
// Como o Drive é simulado: a credencial é gravada de verdade (gravarCredencialDrive, cifrada) e o
// provedor real (src/lib/armazenamento) roda inteiro; só o cliente HTTP do Drive
// (`criarClienteDrive`) e a renovação do access token são trocados por um Drive em memória.
// Assim o teste passa pela escolha do destino, pelo cache de pastas, pela métrica e pelo
// registro do último erro, sem mandar nada ao Google.

// `connection()` só existe dentro de uma requisição do Next; `after()` fica guardado e o teste
// o executa (a métrica do download é gravada depois da resposta).
const depois = vi.hoisted(() => ({ tarefas: [] as (() => unknown)[] }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
  after: (tarefa: () => unknown) => void depois.tarefas.push(tarefa),
}));
async function rodarDepois() {
  while (depois.tarefas.length > 0) await depois.tarefas.shift()!();
}
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// A rota do plugin lê o IP (limite por IP) pelos cabeçalhos do Next.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.21" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
// As rotas leem a sessão; o teste escolhe quem está logado.
const sessao = vi.hoisted(() => ({ usuario: null as unknown }));
vi.mock("@/servicos/sessao", async (original) => ({
  ...(await original<typeof import("@/servicos/sessao")>()),
  usuarioAtual: async () => sessao.usuario,
}));

type ArquivoFalso = { nome: string; pastaId: string; conteudo: Buffer; tipo: string };
const drive = vi.hoisted(() => ({
  arquivos: new Map<string, ArquivoFalso>(),
  pastas: new Map<string, { nome: string; paiId: string | null }>(),
  /** Erros que os próximos envios ao Drive lançam, um por envio. */
  falhas: [] as Error[],
  /** Erros que os próximos downloads do Drive lançam, um por download. */
  falhasDownload: [] as Error[],
  proximo: 0,
}));
vi.mock("@/lib/google-drive", async (original) => {
  const real = await original<typeof import("@/lib/google-drive")>();
  const fluxo = (bytes: Buffer) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        // Em dois pedaços, como um download de verdade.
        const meio = Math.floor(bytes.length / 2);
        c.enqueue(new Uint8Array(bytes.subarray(0, meio)));
        c.enqueue(new Uint8Array(bytes.subarray(meio)));
        c.close();
      },
    });
  const cliente: import("@/lib/google-drive").ClienteDrive = {
    async garantirPasta(nome, paiId) {
      for (const [id, p] of drive.pastas) if (p.nome === nome && p.paiId === paiId) return id;
      const id = `pasta-${++drive.proximo}`;
      drive.pastas.set(id, { nome, paiId });
      return id;
    },
    async enviarArquivo({ nome, pastaId, conteudo, tipo }) {
      const falha = drive.falhas.shift();
      if (falha) throw falha;
      if (!drive.pastas.has(pastaId)) {
        throw new real.ErroDrive("nao_encontrado", "Pasta não encontrada", 404);
      }
      const id = `arquivo-drive-${++drive.proximo}`;
      drive.arquivos.set(id, { nome, pastaId, conteudo: Buffer.from(conteudo), tipo });
      return { id, tamanho: conteudo.length, md5: null };
    },
    async baixarArquivo(id, range) {
      const falha = drive.falhasDownload.shift();
      if (falha) throw falha;
      const arquivo = drive.arquivos.get(id);
      if (!arquivo) throw new real.ErroDrive("nao_encontrado", "Arquivo não encontrado", 404);
      const total = arquivo.conteudo.length;
      if (!range) return { corpo: fluxo(arquivo.conteudo), tamanho: total, status: 200 };
      if (range.inicio >= total)
        throw new real.ErroDrive("outro", "Google Drive respondeu 416", 416);
      const fim = Math.min(range.fim ?? total - 1, total - 1);
      const trecho = arquivo.conteudo.subarray(range.inicio, fim + 1);
      return {
        corpo: fluxo(trecho),
        tamanho: trecho.length,
        status: 206,
        contentRange: `bytes ${range.inicio}-${fim}/${total}`,
      };
    },
    async lerArquivo(id) {
      const arquivo = drive.arquivos.get(id);
      if (!arquivo) throw new real.ErroDrive("nao_encontrado", "Arquivo não encontrado", 404);
      return Buffer.from(arquivo.conteudo);
    },
    async metadados(id) {
      const arquivo = drive.arquivos.get(id);
      if (!arquivo) return null;
      const tamanho = arquivo.conteudo.length;
      return { id, nome: arquivo.nome, tamanho, md5: null, tipo: arquivo.tipo, lixeira: false };
    },
    async apagarArquivo(id) {
      drive.arquivos.delete(id);
    },
    async espacoUsado() {
      return { usadoBytes: 0, limiteBytes: null, usadoNoDriveBytes: 0, email: null };
    },
  };
  return {
    ...real,
    renovarAccessToken: async () => ({
      accessToken: "token-de-teste",
      expiraEm: new Date(Date.now() + 3600_000),
    }),
    criarClienteDrive: () => cliente,
  };
});

import { GET as rotaDeDownload, HEAD as headDoDownload } from "@/app/api/download/[itemId]/route";
import { POST as rotaDeProcessar } from "@/app/api/envios/processar/route";
import { POST as rotaDoPlugin } from "@/app/api/plugin/envios/confirmar/route";
import {
  GET as rotaDoDono,
  HEAD as headDoDono,
} from "@/app/api/painel/originais/[eventoId]/[fotoId]/route";
import {
  buscarUsuario,
  criarEvento,
  definirArmazenamentoDoEvento,
  excluirEventoSemPedidos,
  gravarConfiguracao,
  gravarCredencialDrive,
  type Usuario,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { reiniciarArmazenamento } from "@/lib/armazenamento";
import { ErroDrive } from "@/lib/google-drive";
import { impressaoDoArquivo } from "@/lib/impressao-arquivo";
import { reiniciarClienteR2 } from "@/lib/r2";

import { gerarChaveApi } from "./chaves-api";
import { autorizarDownload } from "./downloads";
import { miniaturaSemMarca } from "./miniatura-sem-marca";
import { PRAZO_DA_MEDICAO_MS, removerOriginaisDoDrive } from "./original-da-foto";
import {
  chavesDaFoto,
  confirmarEnvio,
  ENVIO_PODE_ESTAR_SUBINDO_MS,
  ESPERA_FOTO_PRESA_MS,
  iniciarEnvio,
  revisarFotosPresas,
} from "./envios";
import { liberarOriginais, loteDeOriginais, originalIndividual } from "./originais-do-dono";

const [lia, pedro] = fotografos;

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};

// ---------------------------------------------------------------- S3 falso, em memória

const objetos = new Map<string, { corpo: Buffer; tipo?: string }>();
const nome = (bucket?: string, chave?: string) => `${bucket}/${chave}`;
const noR2 = (chave: string) => objetos.has(nome(R2.R2_BUCKET_ORIGINAIS, chave));
const noPublico = (chave: string) => objetos.has(nome(R2.R2_BUCKET_PUBLICO, chave));

function naoEncontrado() {
  return Object.assign(new Error("NotFound"), {
    name: "NotFound",
    $metadata: { httpStatusCode: 404 },
  });
}

beforeAll(() => {
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof PutObjectCommand) {
      const { Bucket, Key, Body, ContentType } = comando.input;
      objetos.set(nome(Bucket, Key), { corpo: Buffer.from(Body as Buffer), tipo: ContentType });
      return {};
    }
    if (comando instanceof HeadObjectCommand) {
      const objeto = objetos.get(nome(comando.input.Bucket, comando.input.Key));
      if (!objeto) throw naoEncontrado();
      return { ContentLength: objeto.corpo.length };
    }
    if (comando instanceof GetObjectCommand) {
      const objeto = objetos.get(nome(comando.input.Bucket, comando.input.Key));
      if (!objeto) throw naoEncontrado();
      const faixa = /^bytes=(\d+)-(\d+)$/.exec(comando.input.Range ?? "");
      const corpo = faixa
        ? objeto.corpo.subarray(Number(faixa[1]), Number(faixa[2]) + 1)
        : objeto.corpo;
      return {
        ContentLength: corpo.length,
        Body: { transformToByteArray: async () => new Uint8Array(corpo) },
      };
    }
    if (comando instanceof CopyObjectCommand) {
      const origem = objetos.get(decodeURIComponent(comando.input.CopySource!));
      if (!origem) throw naoEncontrado();
      objetos.set(nome(comando.input.Bucket, comando.input.Key), {
        ...origem,
        tipo: comando.input.ContentType,
      });
      return {};
    }
    if (comando instanceof DeleteObjectCommand) {
      objetos.delete(nome(comando.input.Bucket, comando.input.Key));
      return {};
    }
    throw new Error("Comando inesperado no S3 falso");
  }) as never);
});

// ---------------------------------------------------------------- Ajudantes

const BASE_EVENTO = {
  categoriaId: categorias[0].id,
  inicioEm: "2026-11-01T08:00:00-03:00",
  fimEm: "2026-11-01T12:00:00-03:00",
  local: "Parque",
  cidade: "São Paulo",
  estado: "SP",
  precoFotoCentavos: 1500,
  precoVideoCentavos: 3000,
  visibilidade: "publico",
  listado: true,
  liberacao: "automatica",
  liberadoEm: null,
  filtroHorario: false,
  listarNaoIdentificadas: false,
  ordenacao: "envio",
} as const;

let evento: { id: string };
let usuarioLia: Usuario;
let usuarioPedro: Usuario;

let semente = 0;
async function jpeg(largura = 640, altura = 480) {
  semente++;
  return sharp({
    create: {
      width: largura,
      height: altura,
      channels: 3,
      background: { r: (semente * 37) % 256, g: (semente * 91) % 256, b: 120 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

const impressao = (b: Buffer) => impressaoDoArquivo(b.length, (a, c) => b.subarray(a, c));

/** Registra a foto (iniciarEnvio) e faz o PUT do "navegador" na chave temporária do R2. */
async function enviarFoto(corpo: Buffer) {
  const resultado = await iniciarEnvio(lia.id, evento.id, [
    {
      nome: `IMG_${semente}.jpg`,
      tamanhoBytes: corpo.length,
      hash: await impressao(corpo),
      formato: "jpeg",
    },
  ]);
  if ("erro" in resultado) throw new Error(resultado.erro);
  const [item] = resultado.itens;
  if ("repetida" in item) throw new Error("repetida");
  const chaves = chavesDaFoto(lia.id, evento.id, item.fotoId, "jpeg");
  objetos.set(nome(R2.R2_BUCKET_ORIGINAIS, chaves.temporaria), { corpo, tipo: "image/jpeg" });
  return { fotoId: item.fotoId, chaves };
}

async function linhaDaFoto(fotoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, fotoId));
  return linha;
}

async function metricas(
  operacao: (typeof t.operacaoArmazenamento.enumValues)[number],
  fotoId: string,
) {
  const banco = await obterBanco();
  return banco
    .select()
    .from(t.metricasArmazenamento)
    .where(
      and(
        eq(t.metricasArmazenamento.operacao, operacao),
        eq(t.metricasArmazenamento.fotoId, fotoId),
      ),
    );
}

async function ligarExperimental(ativo: boolean) {
  await gravarConfiguracao("armazenamento_experimental", { ativo }, null);
}

/** Pedido com um item da foto, gravado direto no banco; devolve o item e o token do link. */
async function novoPedido(fotoId: string, status: "pago" | "pendente" = "pago") {
  const banco = await obterBanco();
  const token = randomUUID() + randomUUID();
  const [pedido] = await banco
    .insert(t.pedidos)
    .values({
      emailComprador: `${randomUUID()}@teste.com`,
      nomeComprador: "Comprador",
      tokenAcessoHash: createHash("sha256").update(token).digest("hex"),
      subtotalCentavos: 1500,
      descontoCentavos: 0,
      totalCentavos: 1500,
      metodo: "pix",
      status,
      expiraEm: new Date(Date.now() + 3_600_000),
    })
    .returning();
  const [item] = await banco
    .insert(t.itensPedido)
    .values({
      pedidoId: pedido.id,
      fotoId,
      fotografoId: lia.id,
      precoCentavos: 1500,
      descontoCentavos: 0,
      valorFotografoCentavos: 1500,
      valorDonoEventoCentavos: 0,
    })
    .returning();
  return { itemId: item.id, token };
}

function baixar(
  itemId: string,
  token: string,
  range?: string,
  opcoes: { metodo?: "GET" | "HEAD"; sinal?: AbortSignal } = {},
) {
  const url = new URL(`http://localhost/api/download/${itemId}`);
  url.searchParams.set("token", token);
  const headers: Record<string, string> = { "x-forwarded-for": "198.51.100.20" };
  if (range) headers.range = range;
  const metodo = opcoes.metodo ?? "GET";
  const rota = metodo === "HEAD" ? headDoDownload : rotaDeDownload;
  return rota(new NextRequest(url, { method: metodo, headers, signal: opcoes.sinal }), {
    params: Promise.resolve({ itemId }),
  } as RouteContext<"/api/download/[itemId]">);
}

function rotaDoDonoPara(endereco: string, metodo: "GET" | "HEAD" = "GET") {
  const url = new URL(endereco, "http://localhost");
  const [, , , , eventoId, fotoId] = url.pathname.split("/");
  const rota = metodo === "HEAD" ? headDoDono : rotaDoDono;
  return rota(new NextRequest(url, { method: metodo }), {
    params: Promise.resolve({ eventoId, fotoId }),
  } as RouteContext<"/api/painel/originais/[eventoId]/[fotoId]">);
}

/** Downloads registrados do item (a tabela `downloads`). */
async function downloadsDoItem(itemId: string) {
  const banco = await obterBanco();
  const linhas = await banco.select().from(t.downloads).where(eq(t.downloads.itemPedidoId, itemId));
  return linhas.length;
}

beforeAll(async () => {
  for (const [chave, valor] of Object.entries(R2)) process.env[chave] = valor;
  usuarioLia = (await buscarUsuario(lia.usuarioId))!;
  usuarioPedro = (await buscarUsuario(pedro.usuarioId))!;
  evento = await criarEvento(lia.id, {
    ...BASE_EVENTO,
    titulo: "Evento no Drive",
    slug: `drive-${randomUUID().slice(0, 8)}`,
  });
  await gravarCredencialDrive({
    refreshToken: "1//refresh-de-teste",
    contaEmail: "drive@exemplo.com",
    escopo: "https://www.googleapis.com/auth/drive.file",
    usuarioId: null,
  });
});

beforeEach(async () => {
  reiniciarClienteR2();
  reiniciarArmazenamento();
  drive.falhas.length = 0;
  drive.falhasDownload.length = 0;
  depois.tarefas.length = 0;
  sessao.usuario = null;
  await ligarExperimental(true);
  await definirArmazenamentoDoEvento(evento.id, "hibrido");
});

afterEach(() => {
  // Só o console: o S3 falso (spy no S3Client) vale para o arquivo todo.
  vi.mocked(console.error).mockRestore?.();
});

// ---------------------------------------------------------------- Confirmação do envio

describe("confirmação do envio em evento híbrido", () => {
  it("grava o original no Drive, apaga o temporário do R2 e deixa as prévias no R2", async () => {
    const corpo = await jpeg();
    const { fotoId, chaves } = await enviarFoto(corpo);

    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ eventoId: evento.id });

    const linha = await linhaDaFoto(fotoId);
    expect(linha).toMatchObject({
      status: "pronta",
      provedorOriginal: "drive",
      chaveOriginal: chaves.original,
      erroMensagem: null,
    });
    const arquivo = drive.arquivos.get(linha.driveArquivoId!);
    expect(arquivo?.conteudo.equals(corpo)).toBe(true);
    expect(arquivo?.nome).toBe(`${fotoId}.jpg`);
    expect(arquivo?.tipo).toBe("image/jpeg");
    // Pasta ClicouAI_Storage/{fotógrafo}/{evento}.
    const pastaEvento = drive.pastas.get(arquivo!.pastaId)!;
    expect(pastaEvento.nome).toBe(evento.id);
    expect(drive.pastas.get(pastaEvento.paiId!)?.nome).toBe(lia.id);

    // Nada do original fica no R2: nem o temporário, nem uma cópia em originais/.
    expect(noR2(chaves.temporaria)).toBe(false);
    expect(noR2(chaves.original)).toBe(false);
    // Prévia e miniatura continuam no bucket público.
    expect(noPublico(linha.urlPrevia)).toBe(true);
    expect(noPublico(linha.urlMiniatura)).toBe(true);

    const [metrica] = await metricas("upload_original", fotoId);
    expect(metrica).toMatchObject({ provedor: "drive", sucesso: true, bytes: corpo.length });
  });

  it("falha passageira do Drive deixa a foto em processando e o job tenta de novo", async () => {
    const corpo = await jpeg();
    const { fotoId, chaves } = await enviarFoto(corpo);
    const antes = (await linhaDaFoto(fotoId)).envioIniciadoEm!;
    drive.falhas.push(new ErroDrive("limite_de_taxa", "Google Drive pediu para esperar", 429));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ aguardando: true });

    let linha = await linhaDaFoto(fotoId);
    expect(linha.status).toBe("processando");
    expect(linha.erroMensagem).toMatch(/não respondeu/);
    expect(linha.erroMensagem).not.toMatch(/drive|google|token/i);
    expect(linha.driveArquivoId).toBeNull();
    // A reserva foi devolvida com o horário original (a foto volta para a fila do job).
    expect(linha.envioIniciadoEm!.getTime()).toBe(antes.getTime());
    // O temporário continua no R2 para a próxima tentativa.
    expect(noR2(chaves.temporaria)).toBe(true);
    const [falhou] = await metricas("upload_original", fotoId);
    expect(falhou).toMatchObject({ sucesso: false });

    // O job (passados os 5 minutos) reprocessa; agora o Drive responde.
    const banco = await obterBanco();
    await banco
      .update(t.fotos)
      .set({ envioIniciadoEm: new Date(Date.now() - ESPERA_FOTO_PRESA_MS - 60_000) })
      .where(eq(t.fotos.id, fotoId));
    const job = await revisarFotosPresas();
    expect(job.prontas).toBeGreaterThanOrEqual(1);
    linha = await linhaDaFoto(fotoId);
    expect(linha).toMatchObject({
      status: "pronta",
      provedorOriginal: "drive",
      erroMensagem: null,
    });
    expect(drive.arquivos.get(linha.driveArquivoId!)?.conteudo.equals(corpo)).toBe(true);
    expect(noR2(chaves.temporaria)).toBe(false);
  });

  it("falha passageira pelas rotas: responde que ainda está processando, não pronta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Painel (/api/envios/processar).
    const painel = await enviarFoto(await jpeg());
    drive.falhas.push(new ErroDrive("rede", "Falha de rede ao falar com o Google"));
    sessao.usuario = usuarioLia;
    const resposta = await rotaDeProcessar(
      new NextRequest("https://clicouai.test/api/envios/processar", {
        method: "POST",
        headers: {
          host: "clicouai.test",
          origin: "https://clicouai.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ fotoId: painel.fotoId }),
      }),
    );
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, emAndamento: true, aguardando: true });
    expect((await linhaDaFoto(painel.fotoId)).status).toBe("processando");

    // Plugin do Lightroom (/api/plugin/envios/confirmar).
    const plugin = await enviarFoto(await jpeg());
    drive.falhas.push(new ErroDrive("rede", "Falha de rede ao falar com o Google"));
    const chave = (await gerarChaveApi(lia.id, "Teste do Drive"))!.chave;
    const doPlugin = await rotaDoPlugin(
      new Request("http://localhost/api/plugin/envios/confirmar", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fotoId: plugin.fotoId }),
      }),
    );
    expect(doPlugin.status).toBe(200);
    expect(await doPlugin.json()).toMatchObject({ ok: true, emAndamento: true, aguardando: true });
    expect((await linhaDaFoto(plugin.fotoId)).status).toBe("processando");

    // Sem falha, a mesma rota responde como sempre (pronta, sem `aguardando`).
    const normal = await enviarFoto(await jpeg());
    const pronta = await rotaDeProcessar(
      new NextRequest("https://clicouai.test/api/envios/processar", {
        method: "POST",
        headers: {
          host: "clicouai.test",
          origin: "https://clicouai.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ fotoId: normal.fotoId }),
      }),
    );
    const corpo = await pronta.json();
    expect(corpo).toMatchObject({ ok: true, emAndamento: false });
    expect(corpo).not.toHaveProperty("aguardando");
    await rodarDepois();
  });

  it("falha no Drive e nova tentativa no R2 (trava desligada): pronta sem a mensagem antiga", async () => {
    const { fotoId } = await enviarFoto(await jpeg());
    drive.falhas.push(new ErroDrive("rede", "Falha de rede ao falar com o Google"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ aguardando: true });
    expect((await linhaDaFoto(fotoId)).erroMensagem).toBeTruthy();

    await ligarExperimental(false);
    const banco = await obterBanco();
    await banco
      .update(t.fotos)
      .set({ envioIniciadoEm: new Date(Date.now() - ESPERA_FOTO_PRESA_MS - 60_000) })
      .where(eq(t.fotos.id, fotoId));
    await revisarFotosPresas();
    expect(await linhaDaFoto(fotoId)).toMatchObject({
      status: "pronta",
      provedorOriginal: "r2",
      erroMensagem: null,
    });
  });

  it("falha passageira depois do prazo de 30 minutos vira erro", async () => {
    const { fotoId, chaves } = await enviarFoto(await jpeg());
    const banco = await obterBanco();
    await banco
      .update(t.fotos)
      .set({ envioIniciadoEm: new Date(Date.now() - ENVIO_PODE_ESTAR_SUBINDO_MS - 60_000) })
      .where(eq(t.fotos.id, fotoId));
    drive.falhas.push(new ErroDrive("rede", "Falha de rede ao falar com o Google"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await confirmarEnvio(lia.id, fotoId);
    expect(r).toHaveProperty("erro");
    expect((await linhaDaFoto(fotoId)).status).toBe("erro");
    expect(noR2(chaves.original)).toBe(false);
  });

  it("cota cheia no Drive vira erro na hora, sem esperar o job", async () => {
    const { fotoId } = await enviarFoto(await jpeg());
    drive.falhas.push(
      new ErroDrive("quota", "Cota do Google Drive esgotada", 403, "storageQuotaExceeded"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await confirmarEnvio(lia.id, fotoId);
    expect(r).toEqual({ erro: expect.stringMatching(/cheio/) });
    const linha = await linhaDaFoto(fotoId);
    expect(linha.status).toBe("erro");
    expect(linha.erroMensagem).toMatch(/cheio/);
  });

  it("com a trava experimental desligada, o evento híbrido grava no R2 como sempre", async () => {
    await ligarExperimental(false);
    const corpo = await jpeg();
    const { fotoId, chaves } = await enviarFoto(corpo);
    const noDriveAntes = drive.arquivos.size;

    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ eventoId: evento.id });
    const linha = await linhaDaFoto(fotoId);
    expect(linha).toMatchObject({ status: "pronta", provedorOriginal: "r2", driveArquivoId: null });
    expect(objetos.get(nome(R2.R2_BUCKET_ORIGINAIS, chaves.original))?.corpo.equals(corpo)).toBe(
      true,
    );
    expect(noR2(chaves.temporaria)).toBe(false);
    expect(drive.arquivos.size).toBe(noDriveAntes);
  });

  it("evento r2 (o padrão) não usa o Drive mesmo com a trava ligada", async () => {
    await definirArmazenamentoDoEvento(evento.id, "r2");
    const { fotoId, chaves } = await enviarFoto(await jpeg());
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ eventoId: evento.id });
    expect((await linhaDaFoto(fotoId)).provedorOriginal).toBe("r2");
    expect(noR2(chaves.original)).toBe(true);
  });

  it("vídeo em evento híbrido: o original vai ao Drive e a prévia MP4 fica no R2", async () => {
    const corpo = mp4DeTeste(2);
    const resultado = await iniciarEnvio(lia.id, evento.id, [
      {
        nome: `VID_${++semente}.mp4`,
        tamanhoBytes: corpo.length,
        hash: await impressao(corpo),
        formato: "mp4",
        duracaoS: 2,
      },
    ]);
    if ("erro" in resultado) throw new Error(resultado.erro);
    const [item] = resultado.itens;
    if ("repetida" in item) throw new Error("repetida");
    const chaves = chavesDaFoto(lia.id, evento.id, item.fotoId, "mp4");
    objetos.set(nome(R2.R2_BUCKET_ORIGINAIS, chaves.temporaria), { corpo, tipo: "video/mp4" });

    expect(await confirmarEnvio(lia.id, item.fotoId)).toEqual({ eventoId: evento.id });
    const linha = await linhaDaFoto(item.fotoId);
    expect(linha).toMatchObject({ status: "pronta", tipo: "video", provedorOriginal: "drive" });
    expect(drive.arquivos.get(linha.driveArquivoId!)?.conteudo.equals(corpo)).toBe(true);
    expect(drive.arquivos.get(linha.driveArquivoId!)?.tipo).toBe("video/mp4");
    expect(noR2(chaves.temporaria)).toBe(false);
    expect(noR2(chaves.original)).toBe(false);
    expect(noPublico(chaves.previaVideo)).toBe(true);
  }, 120_000);
});

// ---------------------------------------------------------------- Download do comprador

describe("download de original guardado no Drive", () => {
  let fotoId: string;
  let corpo: Buffer;

  beforeAll(async () => {
    corpo = await jpeg(800, 600);
    ({ fotoId } = await enviarFoto(corpo));
    const r = await confirmarEnvio(lia.id, fotoId);
    if (!("eventoId" in r)) throw new Error("foto não ficou pronta");
  });

  it("autorizarDownload entrega por fluxo, sem nada do Drive para fora", async () => {
    const { itemId, token } = await novoPedido(fotoId);
    const original = await autorizarDownload(itemId, { token }, null);
    expect(original?.tipo).toBe("fluxo");
    expect(original?.url).toBe(`/api/download/${itemId}`);
    const linha = await linhaDaFoto(fotoId);
    expect(original?.url).not.toContain(linha.driveArquivoId!);
  });

  it("a rota responde 200 com os bytes e os cabeçalhos de anexo", async () => {
    const { itemId, token } = await novoPedido(fotoId);
    const resposta = await baixar(itemId, token);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("location")).toBeNull();
    expect(resposta.headers.get("content-type")).toBe("image/jpeg");
    expect(resposta.headers.get("content-disposition")).toMatch(/^attachment; filename=".+\.jpg"/);
    expect(resposta.headers.get("content-length")).toBe(String(corpo.length));
    expect(resposta.headers.get("accept-ranges")).toBe("bytes");
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const recebido = Buffer.from(await resposta.arrayBuffer());
    expect(recebido.equals(corpo)).toBe(true);
    // Nenhum cabeçalho leva o id do arquivo no Drive.
    const linha = await linhaDaFoto(fotoId);
    for (const [, valor] of resposta.headers) expect(valor).not.toContain(linha.driveArquivoId!);

    // A métrica é gravada depois da resposta, com a duração até o fim do fluxo.
    await rodarDepois();
    const lista = await metricas("download_original", fotoId);
    expect(lista.at(-1)).toMatchObject({ provedor: "drive", sucesso: true, bytes: corpo.length });
  });

  it("com Range, responde 206 só com o trecho", async () => {
    const { itemId, token } = await novoPedido(fotoId);
    const resposta = await baixar(itemId, token, "bytes=10-109");
    expect(resposta.status).toBe(206);
    expect(resposta.headers.get("content-range")).toBe(`bytes 10-109/${corpo.length}`);
    expect(resposta.headers.get("content-length")).toBe("100");
    const recebido = Buffer.from(await resposta.arrayBuffer());
    expect(recebido.equals(corpo.subarray(10, 110))).toBe(true);
    await rodarDepois();
  });

  it("trecho fora do arquivo responde 416 (e não vira último erro do Drive)", async () => {
    const banco = await obterBanco();
    await banco.update(t.credenciaisGoogleDrive).set({ ultimoErro: null, ultimoErroEm: null });
    const { itemId, token } = await novoPedido(fotoId);
    const resposta = await baixar(itemId, token, `bytes=${corpo.length + 10}-`);
    expect(resposta.status).toBe(416);
    expect(resposta.headers.get("content-range")).toBe(`bytes */${corpo.length}`);
    const [credencial] = await banco.select().from(t.credenciaisGoogleDrive);
    expect(credencial.ultimoErro).toBeNull();
  });

  it("HEAD responde só os cabeçalhos, sem abrir o fluxo, medir nem registrar download", async () => {
    const { itemId, token } = await novoPedido(fotoId);
    const resposta = await baixar(itemId, token, undefined, { metodo: "HEAD" });
    expect(resposta.status).toBe(200);
    expect(resposta.body).toBeNull();
    expect(resposta.headers.get("content-length")).toBe(String(corpo.length));
    expect(resposta.headers.get("accept-ranges")).toBe("bytes");
    expect(resposta.headers.get("content-type")).toBe("image/jpeg");
    expect(resposta.headers.get("content-disposition")).toMatch(/^attachment; filename=".+\.jpg"/);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    // Nenhuma medição pendurada no `after` e nenhum download contado.
    expect(depois.tarefas).toHaveLength(0);
    expect(await downloadsDoItem(itemId)).toBe(0);

    // Mesma autorização do GET: sem pedido pago, o mesmo 404 (sem corpo).
    const pendente = await novoPedido(fotoId, "pendente");
    const recusada = await baixar(pendente.itemId, pendente.token, undefined, { metodo: "HEAD" });
    expect(recusada.status).toBe(404);
    expect(recusada.body).toBeNull();
  });

  it("conta o download uma vez: 200 ou o primeiro trecho; outros trechos e 503 não contam", async () => {
    const { itemId, token } = await novoPedido(fotoId);
    await (await baixar(itemId, token)).arrayBuffer();
    expect(await downloadsDoItem(itemId)).toBe(1);

    // Download em partes: só o trecho do byte 0 conta.
    await (await baixar(itemId, token, "bytes=0-99")).arrayBuffer();
    expect(await downloadsDoItem(itemId)).toBe(2);
    await (await baixar(itemId, token, "bytes=100-199")).arrayBuffer();
    await (await baixar(itemId, token, `bytes=${corpo.length + 10}-`)).arrayBuffer();
    expect(await downloadsDoItem(itemId)).toBe(2);

    // O Drive não respondeu: 503, não conta.
    drive.falhasDownload.push(new ErroDrive("rede", "Falha de rede ao falar com o Google"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const falhou = await baixar(itemId, token);
    expect(falhou.status).toBe(503);
    expect(await downloadsDoItem(itemId)).toBe(2);
    await rodarDepois();
  });

  it("pedido abortado cancela o fluxo e fecha a medição na hora", async () => {
    const { itemId, token } = await novoPedido(fotoId);
    const controle = new AbortController();
    const resposta = await baixar(itemId, token, undefined, { sinal: controle.signal });
    expect(resposta.status).toBe(200);
    controle.abort();
    await rodarDepois();
    const lista = await metricas("download_original", fotoId);
    expect(lista.at(-1)).toMatchObject({
      sucesso: false,
      erro: expect.stringMatching(/interrompido/),
    });
  });

  it("fluxo que ninguém lê até o fim: a medição desiste no prazo, antes do teto da função", async () => {
    expect(PRAZO_DA_MEDICAO_MS).toBeLessThan(300_000);
    const { itemId, token } = await novoPedido(fotoId);
    const resposta = await baixar(itemId, token);
    expect(resposta.status).toBe(200);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let medicao: unknown;
    try {
      medicao = depois.tarefas.shift()!();
      await vi.advanceTimersByTimeAsync(PRAZO_DA_MEDICAO_MS);
    } finally {
      vi.useRealTimers();
    }
    await medicao;
    const lista = await metricas("download_original", fotoId);
    expect(lista.at(-1)).toMatchObject({ sucesso: false, erro: expect.stringMatching(/prazo/) });
    await resposta.body?.cancel();
  });

  it("sem pedido pago, 404 genérico (o Drive nem é chamado)", async () => {
    const { itemId, token } = await novoPedido(fotoId, "pendente");
    const resposta = await baixar(itemId, token);
    expect(resposta.status).toBe(404);
    expect(await resposta.text()).toBe("Download indisponível.");
    const outro = await novoPedido(fotoId);
    expect((await baixar(outro.itemId, token)).status).toBe(404);
  });
});

// ---------------------------------------------------------------- Caminhos do dono

describe("originais do autor guardados no Drive", () => {
  let fotoId: string;
  let corpo: Buffer;

  beforeAll(async () => {
    corpo = await jpeg(700, 500);
    ({ fotoId } = await enviarFoto(corpo));
    const r = await confirmarEnvio(lia.id, fotoId);
    if (!("eventoId" in r)) throw new Error("foto não ficou pronta");
  });

  it("o lote entrega um endereço do próprio site que faz o streaming, só para o autor", async () => {
    const liberado = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!liberado.ok) throw new Error(liberado.erro);
    const lote = await loteDeOriginais(
      usuarioLia,
      { eventoId: evento.id, modo: "minhas", liberacao: liberado.liberacao, ids: [fotoId] },
      "203.0.113.9",
    );
    if (!lote.ok) throw new Error(lote.erro);
    const [item] = lote.itens;
    expect(item.url).toMatch(new RegExp(`^/api/painel/originais/${evento.id}/${fotoId}\\?fluxo=`));
    const linha = await linhaDaFoto(fotoId);
    expect(JSON.stringify(lote)).not.toContain(linha.driveArquivoId!);

    sessao.usuario = usuarioLia;
    const resposta = await rotaDoDonoPara(item.url);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await resposta.arrayBuffer()).equals(corpo)).toBe(true);
    await rodarDepois();
    const lista = await metricas("leitura_original", fotoId);
    expect(lista.at(-1)).toMatchObject({ provedor: "drive", sucesso: true });

    // HEAD: só os cabeçalhos, com o tamanho, sem abrir o fluxo.
    const head = await rotaDoDonoPara(item.url, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("content-length")).toBe(String(corpo.length));
    expect(head.headers.get("accept-ranges")).toBe("bytes");
    expect(head.headers.get("cache-control")).toBe("no-store");
    expect(depois.tarefas).toHaveLength(0);

    // Outra pessoa logada com o mesmo endereço, ou ninguém logado: recusado.
    sessao.usuario = usuarioPedro;
    expect((await rotaDoDonoPara(item.url)).status).toBe(403);
    expect((await rotaDoDonoPara(item.url, "HEAD")).status).toBe(403);
    sessao.usuario = null;
    expect((await rotaDoDonoPara(item.url)).status).toBe(403);
    // Token de uma foto não serve para outra.
    sessao.usuario = usuarioLia;
    const trocado = item.url.replace(fotoId, randomUUID());
    expect((await rotaDoDonoPara(trocado)).status).toBe(403);
  });

  it("a foto individual responde com o mesmo endereço de streaming", async () => {
    const liberado = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!liberado.ok) throw new Error(liberado.erro);
    const r = await originalIndividual(
      usuarioLia,
      { fotoId, liberacao: liberado.liberacao },
      "203.0.113.9",
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.exemplo).toBe(false);
    expect(r.url).toMatch(new RegExp(`^/api/painel/originais/${evento.id}/${fotoId}\\?fluxo=`));
    sessao.usuario = usuarioLia;
    const resposta = await rotaDoDonoPara(r.url);
    expect(resposta.status).toBe(200);
    expect(Buffer.from(await resposta.arrayBuffer()).equals(corpo)).toBe(true);
    await rodarDepois();
  });
});

// ---------------------------------------------------------------- Outras leituras e exclusão

describe("leitura e exclusão pelo provedor da foto", () => {
  it("a miniatura sem marca do autor lê o original do Drive", async () => {
    const { fotoId } = await enviarFoto(await jpeg(900, 600));
    const r = await confirmarEnvio(lia.id, fotoId);
    if (!("eventoId" in r)) throw new Error("foto não ficou pronta");
    const miniatura = await miniaturaSemMarca(usuarioLia, fotoId);
    expect(miniatura.ok).toBe(true);
    if (miniatura.ok) expect((await sharp(miniatura.imagem).metadata()).format).toBe("webp");
    const lista = await metricas("leitura_original", fotoId);
    expect(lista.at(-1)).toMatchObject({ provedor: "drive", sucesso: true });
  });

  it("excluir o evento sem pedidos apaga os originais do Drive", async () => {
    const outro = await criarEvento(lia.id, {
      ...BASE_EVENTO,
      titulo: "Evento para excluir",
      slug: `drive-excluir-${randomUUID().slice(0, 8)}`,
    });
    await definirArmazenamentoDoEvento(outro.id, "hibrido");
    const anterior = evento;
    evento = outro;
    try {
      const { fotoId } = await enviarFoto(await jpeg());
      const r = await confirmarEnvio(lia.id, fotoId);
      if (!("eventoId" in r)) throw new Error("foto não ficou pronta");
      const arquivoId = (await linhaDaFoto(fotoId)).driveArquivoId!;
      expect(drive.arquivos.has(arquivoId)).toBe(true);

      const resultado = await excluirEventoSemPedidos(outro.id, lia.id);
      if (!resultado.ok) throw new Error(resultado.motivo);
      expect(resultado.originaisNoDrive.map((o) => o.driveArquivoId)).toEqual([arquivoId]);
      expect(resultado.chavesOriginais).toEqual([]);
      await removerOriginaisDoDrive(resultado.originaisNoDrive);
      expect(drive.arquivos.has(arquivoId)).toBe(false);
    } finally {
      evento = anterior;
    }
  });
});

// ---------------------------------------------------------------- Vídeo de teste

function mp4DeTeste(segundos: number, largura = 320, altura = 240) {
  const pasta = mkdtempSync(path.join(tmpdir(), "video-drive-"));
  const arquivo = path.join(pasta, "v.mp4");
  const r = spawnSync(ffmpegPath!, [
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=${largura}x${altura}:rate=10:duration=${segundos}`,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-y",
    arquivo,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const corpo = readFileSync(arquivo);
  rmSync(pasta, { recursive: true, force: true });
  return corpo;
}
