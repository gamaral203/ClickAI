import { createHash } from "node:crypto";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
// `after()` roda o trabalho depois da resposta; aqui ele fica guardado e o teste o executa.
const depois = vi.hoisted(() => ({ tarefas: [] as (() => unknown)[] }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
  after: (tarefa: () => unknown) => void depois.tarefas.push(tarefa),
}));
/** Roda o que a rota deixou para depois da resposta. */
async function rodarDepois() {
  while (depois.tarefas.length > 0) await depois.tarefas.shift()!();
}
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// As Server Actions pedem o fotógrafo logado; aqui ele é escolhido pelo teste.
const sessao = vi.hoisted(() => ({ fotografoId: "" }));
vi.mock("@/servicos/sessao", () => ({
  exigirFotografo: async () => ({ conta: { id: sessao.fotografoId } }),
  usuarioAtual: async () => (sessao.fotografoId ? { id: "usuario", papel: "fotografo" } : null),
  contaDoPainel: async () => ({ id: sessao.fotografoId }),
}));

import { enviarFotosAcao, situacaoDoEnvioAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { POST as partesRota } from "@/app/api/envios/partes/route";
import { POST as processarRota } from "@/app/api/envios/processar/route";
import { adicionarItensSimulados, listarItensDoPainel, reservarFotoParaProcessar } from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { dataDeCaptura } from "@/lib/exif";
import { impressaoDoArquivo } from "@/lib/impressao-arquivo";
import { LIMITE_FOTO_BYTES } from "@/lib/limites-envio";
import { MENSAGEM_RAW, type FormatoAceito } from "@/lib/tipos-imagem";
import { ERRO_SEM_ARMAZENAMENTO, modoEnvio, reiniciarClienteR2 } from "@/lib/r2";
import { autorizarDownload } from "@/servicos/downloads";
import {
  assinarPartes,
  chavesDaFoto,
  concluirPartes,
  confirmarEnvio,
  ESPERA_FOTO_PRESA_MS,
  FOTOS_POR_LOTE,
  iniciarEnvio,
  revisarFotosPresas,
} from "@/servicos/envios";
import { confirmarPagamento, criarPedido } from "@/servicos/pedidos";

const [lia, pedro] = fotografos;
// Evento da Lia sem colaboradores: o Pedro não tem nada a ver com ele.
const evento = eventos.find((e) => e.slug === "meia-maratona-rio-2026")!;
// Evento da Lia em que o Pedro é colaborador.
const ibirapuera = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;

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
/** Uploads em partes abertos no S3 falso: chave e tipo de cada um. */
const multipart = new Map<string, { chave: string; tipo?: string }>();
/** Partes enviadas pelo "navegador" num upload em partes: `uploadId:numero` -> bytes. */
const partesEnviadas = new Map<string, Buffer>();
const nome = (bucket?: string, chave?: string) => `${bucket}/${chave}`;

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
      return {
        ContentLength: objeto.corpo.length,
        Body: { transformToByteArray: async () => new Uint8Array(objeto.corpo) },
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
    if (comando instanceof CreateMultipartUploadCommand) {
      const UploadId = `upload-${multipart.size + 1}-${Date.now()}`;
      multipart.set(UploadId, {
        chave: nome(comando.input.Bucket, comando.input.Key),
        tipo: comando.input.ContentType,
      });
      return { UploadId };
    }
    if (comando instanceof CompleteMultipartUploadCommand) {
      const aberto = multipart.get(comando.input.UploadId!);
      if (!aberto) {
        throw Object.assign(new Error("NoSuchUpload"), {
          name: "NoSuchUpload",
          $metadata: { httpStatusCode: 404 },
        });
      }
      // Junta as partes "enviadas" pelo teste, na ordem dos números.
      const corpo = Buffer.concat(
        comando.input.MultipartUpload!.Parts!.map((p) =>
          partesEnviadas.get(`${comando.input.UploadId}:${p.PartNumber}`)!,
        ),
      );
      objetos.set(aberto.chave, { corpo, tipo: aberto.tipo });
      multipart.delete(comando.input.UploadId!);
      return {};
    }
    if (comando instanceof AbortMultipartUploadCommand) {
      multipart.delete(comando.input.UploadId!);
      return {};
    }
    throw new Error("Comando inesperado no S3 falso");
  }) as never);
});

beforeEach(() => {
  for (const [chave, valor] of Object.entries(R2)) vi.stubEnv(chave, valor);
  reiniciarClienteR2();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------- Ajudantes

let semente = 0;
/** JPEG de verdade, diferente a cada chamada, com data de captura no EXIF. */
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
    .withExif({ IFD2: { DateTimeOriginal: "2026:05:10 07:32:15" } })
    .toBuffer();
}

/** A impressão que o navegador calcula (src/lib/impressao-arquivo.ts). */
const impressao = (b: Buffer) => impressaoDoArquivo(b.length, (a, c) => b.subarray(a, c));

/** Inicia o envio de um arquivo e devolve o item (com a URL ou as partes). */
async function iniciarUm(
  fotografoId: string,
  eventoId: string,
  corpo: Buffer,
  formato: FormatoAceito = "jpeg",
) {
  const resultado = await iniciarEnvio(fotografoId, eventoId, [
    {
      nome: `IMG_${semente}.${formato === "jpeg" ? "jpg" : formato}`,
      tamanhoBytes: corpo.length,
      hash: await impressao(corpo),
      formato,
    },
  ]);
  if ("erro" in resultado) throw new Error(resultado.erro);
  const [item] = resultado.itens;
  if ("repetida" in item) throw new Error("repetida");
  return item as { fotoId: string; url?: string; partes?: { uploadId: string; urls: string[] } };
}

/** O que o navegador faz com a URL assinada: grava o arquivo na chave temporária. */
function simularPut(
  fotografoId: string,
  eventoId: string,
  fotoId: string,
  corpo: Buffer,
  formato: FormatoAceito = "jpeg",
) {
  const chave = chavesDaFoto(fotografoId, eventoId, fotoId, formato).temporaria;
  objetos.set(nome(R2.R2_BUCKET_ORIGINAIS, chave), { corpo, tipo: "image/jpeg" });
}

async function linhaDaFoto(fotoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, fotoId));
  return linha;
}

// ---------------------------------------------------------------- Testes

describe("envio de fotos ao R2", () => {
  it("iniciarEnvio cria a foto em processando e devolve a URL assinada de PUT", async () => {
    const corpo = await jpeg();
    const { fotoId, url } = await iniciarUm(lia.id, evento.id, corpo);

    const endereco = new URL(url!);
    expect(endereco.hostname).toBe("fotos-originais.conta-teste.r2.cloudflarestorage.com");
    expect(endereco.pathname).toBe(`/envios/${lia.id}/${evento.id}/${fotoId}.jpg`);
    expect(endereco.searchParams.get("X-Amz-Expires")).toBe("900");
    // Tipo e tamanho fazem parte da assinatura: o R2 recusa outro arquivo.
    const assinados = endereco.searchParams.get("X-Amz-SignedHeaders")!.split(";");
    expect(assinados).toEqual(expect.arrayContaining(["content-length", "content-type", "host"]));
    // Sem checksum automático do SDK, que o navegador não saberia mandar.
    expect([...endereco.searchParams.keys()].some((k) => /checksum/i.test(k))).toBe(false);
    // A chave secreta nunca vai para o navegador.
    expect(url).not.toContain(R2.R2_SECRET_ACCESS_KEY);

    const linha = await linhaDaFoto(fotoId);
    expect(linha.status).toBe("processando");
    expect(linha.enviadaPor).toBe(lia.id);
    expect(linha.hashConteudo).toBe(await impressao(corpo));
    expect(linha.chaveOriginal).toBe(`envios/${lia.id}/${evento.id}/${fotoId}.jpg`);
  });

  it("recusa lote inválido (formato fora da lista, acima do teto, sem impressão, maior que o lote)", async () => {
    const hash = "a".repeat(64);
    const casos = [
      [{ nome: "foto.heic", tamanhoBytes: 10, hash, formato: "heic" }],
      [{ nome: "foto.gif", tamanhoBytes: 10, hash, formato: "gif" }],
      [{ nome: "foto.jpg", tamanhoBytes: 10, hash }],
      [{ nome: "foto.jpg", tamanhoBytes: LIMITE_FOTO_BYTES + 1, hash, formato: "jpeg" }],
      [{ nome: "foto.jpg", tamanhoBytes: 10, formato: "jpeg" }],
      Array.from({ length: FOTOS_POR_LOTE + 1 }, (_, i) => ({
        nome: `f${i}.jpg`,
        tamanhoBytes: 10,
        hash,
        formato: "jpeg",
      })),
    ];
    for (const lista of casos) {
      expect(await iniciarEnvio(lia.id, evento.id, lista)).toHaveProperty("erro");
    }
    // RAW pelo nome: a mensagem pede para exportar.
    expect(
      await iniciarEnvio(lia.id, evento.id, [
        { nome: "IMG_0001.CR3", tamanhoBytes: 10, hash, formato: "jpeg" },
      ]),
    ).toEqual({
      erro: "Arquivo RAW: exporte em JPEG (ou PNG/TIFF) no Lightroom/Capture One antes de enviar.",
    });
  });

  it("não há mais o limite de 30 MB: só o teto anti-abuso de 200 MB", async () => {
    expect(LIMITE_FOTO_BYTES).toBe(200 * 1024 * 1024);
    // 31 MB passa (antes era recusado); abaixo de 50 MB, num PUT só.
    const r31 = await iniciarEnvio(lia.id, evento.id, [
      { nome: "grande.jpg", tamanhoBytes: 31 * 1024 * 1024, hash: "d".repeat(64), formato: "jpeg" },
    ]);
    expect((r31 as { itens: { url?: string }[] }).itens[0].url).toBeTruthy();
    // 200 MB exatos passam, em 20 partes de 10 MB.
    const r200 = await iniciarEnvio(lia.id, evento.id, [
      {
        nome: "enorme.tif",
        tamanhoBytes: LIMITE_FOTO_BYTES,
        hash: "e".repeat(64),
        formato: "tiff",
      },
    ]);
    const item = (r200 as { itens: { partes?: { urls: string[] } }[] }).itens[0];
    expect(item.partes?.urls).toHaveLength(20);
    // 1 byte a mais, não.
    expect(
      await iniciarEnvio(lia.id, evento.id, [
        {
          nome: "x.jpg",
          tamanhoBytes: LIMITE_FOTO_BYTES + 1,
          hash: "f".repeat(64),
          formato: "jpeg",
        },
      ]),
    ).toHaveProperty("erro");
  });

  it("confirmarEnvio com JPEG válido gera prévia e miniatura, move o original e marca pronta", async () => {
    const corpo = await jpeg(900, 600);
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);

    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ eventoId: evento.id });

    const chaves = chavesDaFoto(lia.id, evento.id, fotoId);
    const previa = objetos.get(nome(R2.R2_BUCKET_PUBLICO, chaves.previa));
    const miniatura = objetos.get(nome(R2.R2_BUCKET_PUBLICO, chaves.miniatura));
    expect(previa?.tipo).toBe("image/webp");
    expect((await sharp(previa!.corpo).metadata()).format).toBe("webp");
    expect((await sharp(miniatura!.corpo).metadata()).width).toBeLessThanOrEqual(400);
    // Original no lugar definitivo, igual ao enviado; o temporário sumiu.
    expect(objetos.get(nome(R2.R2_BUCKET_ORIGINAIS, chaves.original))?.corpo.equals(corpo)).toBe(
      true,
    );
    expect(objetos.has(nome(R2.R2_BUCKET_ORIGINAIS, chaves.temporaria))).toBe(false);
    // O original não vai para o bucket público.
    expect(objetos.has(nome(R2.R2_BUCKET_PUBLICO, chaves.original))).toBe(false);

    const linha = await linhaDaFoto(fotoId);
    expect(linha.status).toBe("pronta");
    expect(linha.chaveOriginal).toBe(chaves.original);
    expect([linha.largura, linha.altura]).toEqual([900, 600]);
    expect(linha.capturadaEm?.toISOString()).toBe("2026-05-10T10:32:15.000Z");

    // Painel e galeria resolvem a URL pública a partir da chave.
    const itens = await listarItensDoPainel(evento.id, lia.id);
    const item = itens?.find((i) => i.id === fotoId);
    expect(item?.urlPrevia).toBe(`${R2.R2_URL_PUBLICA}/${chaves.previa}`);
    expect(item?.urlMiniatura).toBe(`${R2.R2_URL_PUBLICA}/${chaves.miniatura}`);

    // A mesma foto de novo é pulada.
    const deNovo = await iniciarEnvio(lia.id, evento.id, [
      {
        nome: "copia.jpg",
        tamanhoBytes: corpo.length,
        hash: await impressao(corpo),
        formato: "jpeg",
      },
    ]);
    expect(deNovo).toEqual({ itens: [{ repetida: true }] });
    // E confirmar outra vez não processa de novo.
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ emAndamento: true });
  });

  it("arquivo que não é do formato informado vira erro, mesmo com a impressão certa", async () => {
    const png = await sharp({
      create: { width: 50, height: 50, channels: 3, background: "#2362FE" },
    })
      .png()
      .toBuffer();
    const { fotoId } = await iniciarUm(lia.id, evento.id, png);
    simularPut(lia.id, evento.id, fotoId, png);

    const resultado = await confirmarEnvio(lia.id, fotoId);
    expect(resultado).toHaveProperty("erro");
    expect((resultado as { erro: string }).erro).toMatch(/diferente/);
    expect((await linhaDaFoto(fotoId)).status).toBe("erro");
    // O arquivo recusado é apagado.
    const chaves = chavesDaFoto(lia.id, evento.id, fotoId);
    expect(objetos.has(nome(R2.R2_BUCKET_ORIGINAIS, chaves.temporaria))).toBe(false);
    expect(objetos.has(nome(R2.R2_BUCKET_PUBLICO, chaves.previa))).toBe(false);
  });

  it("arquivo diferente do informado (hash divergente) vira erro e pode ser enviado de novo", async () => {
    const escolhido = await jpeg();
    const outro = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, escolhido);
    simularPut(lia.id, evento.id, fotoId, outro);

    const resultado = await confirmarEnvio(lia.id, fotoId);
    expect((resultado as { erro: string }).erro).toMatch(/diferente/);
    expect((await linhaDaFoto(fotoId)).status).toBe("erro");

    // Tentar de novo reaproveita a mesma foto, em vez de criar outro item.
    const novaTentativa = await iniciarUm(lia.id, evento.id, escolhido);
    expect(novaTentativa.fotoId).toBe(fotoId);
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");
    simularPut(lia.id, evento.id, fotoId, escolhido);
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ eventoId: evento.id });
  });

  it("arquivo acima do teto no armazenamento vira erro; de tamanho diferente do informado também", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    const grande = Buffer.concat([corpo, Buffer.alloc(LIMITE_FOTO_BYTES)]);
    simularPut(lia.id, evento.id, fotoId, grande);
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ erro: "Maior que 200 MB." });
    expect((await linhaDaFoto(fotoId)).status).toBe("erro");

    const outro = await jpeg();
    const segunda = await iniciarUm(lia.id, evento.id, outro);
    simularPut(lia.id, evento.id, segunda.fotoId, Buffer.concat([outro, Buffer.alloc(10)]));
    expect(await confirmarEnvio(lia.id, segunda.fotoId)).toEqual({
      erro: "O arquivo chegou diferente do escolhido. Envie de novo.",
    });
  });

  it("arquivo que não chegou ao armazenamento vira erro", async () => {
    const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg());
    expect((await confirmarEnvio(lia.id, fotoId)) as { erro: string }).toHaveProperty("erro");
    expect((await linhaDaFoto(fotoId)).status).toBe("erro");
  });

  it("outro fotógrafo não inicia nem confirma envio em evento alheio", async () => {
    const corpo = await jpeg();
    expect(
      await iniciarEnvio(pedro.id, evento.id, [
        {
          nome: "x.jpg",
          tamanhoBytes: corpo.length,
          hash: await impressao(corpo),
          formato: "jpeg",
        },
      ]),
    ).toEqual({ erro: "Evento não encontrado." });

    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    expect(await confirmarEnvio(pedro.id, fotoId)).toEqual({ erro: "Foto não encontrada." });
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");

    // Colaborador envia no evento em que foi adicionado, no próprio nome.
    const doPedro = await iniciarUm(pedro.id, ibirapuera.id, await jpeg());
    expect((await linhaDaFoto(doPedro.fotoId)).enviadaPor).toBe(pedro.id);
    // E a Lia, dona do evento, não confirma o envio que é dele.
    expect(await confirmarEnvio(lia.id, doPedro.fotoId)).toEqual({ erro: "Foto não encontrada." });
  });

  it("download de foto enviada redireciona para a URL assinada do original", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    await confirmarEnvio(lia.id, fotoId);

    const pedido = await criarPedido([fotoId], {
      clienteId: null,
      nome: "Cliente Teste",
      email: "cliente-envio@exemplo.com",
      whatsapp: null,
      aceitaWhatsapp: false,
      metodo: "pix",
    });
    expect(pedido.ok).toBe(true);
    if (!pedido.ok) return;
    const banco = await obterBanco();
    const [item] = await banco
      .select()
      .from(t.itensPedido)
      .where(and(eq(t.itensPedido.pedidoId, pedido.pedidoId), eq(t.itensPedido.fotoId, fotoId)));

    // Antes do pagamento, não baixa.
    expect(await autorizarDownload(item.id, { token: pedido.token }, null)).toBeNull();
    expect(await confirmarPagamento(pedido.pedidoId)).toBe(true);

    const original = await autorizarDownload(item.id, { token: pedido.token }, null);
    expect(original?.tipo).toBe("r2");
    const url = new URL(original!.url);
    expect(url.pathname).toBe(`/${chavesDaFoto(lia.id, evento.id, fotoId).original}`);
    expect(url.hostname).toBe("fotos-originais.conta-teste.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^attachment; filename=/);
    // Sem o token do pedido, nada.
    expect(await autorizarDownload(item.id, { token: "x".repeat(40) }, null)).toBeNull();
  });
});

describe("sem limite de quantidade de fotos", () => {
  it("aceita 600 fotos num evento, em lotes automáticos de FOTOS_POR_LOTE", async () => {
    expect(FOTOS_POR_LOTE).toBe(50);
    const hashes = Array.from({ length: 600 }, (_, i) =>
      createHash("sha256").update(`sem-limite-${i}`).digest("hex"),
    );
    const ids: string[] = [];
    for (let i = 0; i < hashes.length; i += FOTOS_POR_LOTE) {
      const r = await iniciarEnvio(
        lia.id,
        evento.id,
        hashes.slice(i, i + FOTOS_POR_LOTE).map((hash, j) => ({
          nome: `LOTE_${i + j}.jpg`,
          tamanhoBytes: 1000,
          hash,
          formato: "jpeg",
        })),
      );
      if ("erro" in r) throw new Error(r.erro);
      for (const item of r.itens) if ("fotoId" in item) ids.push(item.fotoId);
    }
    // Todas registradas, cada uma com o próprio id, sem recusa por quantidade (eram 500).
    expect(new Set(ids).size).toBe(600);
    const banco = await obterBanco();
    const linhas = await banco
      .select({ id: t.fotos.id })
      .from(t.fotos)
      .where(and(eq(t.fotos.eventoId, evento.id), eq(t.fotos.status, "processando")));
    expect(linhas.length).toBeGreaterThanOrEqual(600);
    // Limpa: as 600 não ficam presas para os testes do job.
    await banco.update(t.fotos).set({ status: "erro" }).where(inArray(t.fotos.id, ids));
  });

  it("envio simulado também não limita a quantidade, só o tamanho do lote", async () => {
    for (const chave of Object.keys(R2)) vi.stubEnv(chave, "");
    sessao.fotografoId = lia.id;
    const lote = (de: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        nome: `SIM_${de + i}.jpg`,
        tamanhoBytes: 1000,
        hash: createHash("sha256")
          .update(`simulado-${de + i}`)
          .digest("hex"),
      }));
    expect(await enviarFotosAcao(evento.id, lote(0, FOTOS_POR_LOTE))).toEqual({
      enviados: FOTOS_POR_LOTE,
      repetidas: 0,
    });
    expect(await enviarFotosAcao(evento.id, lote(100, FOTOS_POR_LOTE + 1))).toHaveProperty("erro");
  });
});

describe("rota de processamento (/api/envios/processar)", () => {
  function pedido(corpo: unknown, cabecalhos: Record<string, string> = {}) {
    return new Request("https://clicouai.test/api/envios/processar", {
      method: "POST",
      headers: {
        host: "clicouai.test",
        origin: "https://clicouai.test",
        "content-type": "application/json",
        ...cabecalhos,
      },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }) as never;
  }

  it("processa a foto do fotógrafo logado e responde 200", async () => {
    sessao.fotografoId = lia.id;
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);

    const resposta = await processarRota(pedido({ fotoId }));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect((await linhaDaFoto(fotoId)).status).toBe("pronta");
    await rodarDepois();
    // De novo: já processada, não processa outra vez e responde que está pronta (sem erro).
    const idas = vi.mocked(S3Client.prototype.send).mock.calls.length;
    const repetida = await processarRota(pedido({ fotoId }));
    expect(repetida.status).toBe(200);
    expect(await repetida.json()).toMatchObject({ ok: true, emAndamento: true });
    expect(vi.mocked(S3Client.prototype.send).mock.calls.length).toBe(idas);
  });

  it("entrega em segundo plano: responde 202 na hora e processa depois da resposta", async () => {
    sessao.fotografoId = lia.id;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const corpo = await jpeg();
      const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
      simularPut(lia.id, evento.id, fotoId, corpo);
      ids.push(fotoId);
    }
    // A do Pedro vai junto na entrega, mas não é processada: só as da conta logada.
    const corpoDoPedro = await jpeg();
    const doPedro = await iniciarUm(pedro.id, ibirapuera.id, corpoDoPedro);
    simularPut(pedro.id, ibirapuera.id, doPedro.fotoId, corpoDoPedro);

    const resposta = await processarRota(pedido({ fotoIds: [...ids, doPedro.fotoId] }));
    expect(resposta.status).toBe(202);
    for (const id of ids) expect((await linhaDaFoto(id)).status).toBe("processando");
    await rodarDepois();
    for (const id of ids)
      expect(await linhaDaFoto(id)).toMatchObject({ erroMensagem: null, status: "pronta" });
    expect((await linhaDaFoto(doPedro.fotoId)).status).toBe("processando");
    // Mais de 100 ids, ou ids inválidos: recusa.
    const muitos = Array.from({ length: 101 }, () => crypto.randomUUID());
    expect((await processarRota(pedido({ fotoIds: muitos }))).status).toBe(400);
    expect((await processarRota(pedido({ fotoIds: ["1"] }))).status).toBe(400);
    // Termina a do Pedro para ela não ficar na fila dos próximos testes.
    await confirmarEnvio(pedro.id, doPedro.fotoId);
  });

  it("recusa outra origem, sem sessão, corpo inválido e foto de outro fotógrafo", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);

    sessao.fotografoId = lia.id;
    const deFora = pedido({ fotoId }, { origin: "https://outro.site" });
    expect((await processarRota(deFora)).status).toBe(403);
    expect((await processarRota(pedido("nada"))).status).toBe(400);
    expect((await processarRota(pedido({ fotoId: "123" }))).status).toBe(400);

    sessao.fotografoId = "";
    expect((await processarRota(pedido({ fotoId }))).status).toBe(401);

    sessao.fotografoId = pedro.id;
    expect((await processarRota(pedido({ fotoId }))).status).toBe(422);
    // Nada mudou na foto da Lia.
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");
    sessao.fotografoId = lia.id;
    expect((await processarRota(pedido({ fotoId }))).status).toBe(200);
  });
});

describe("prévias geradas no servidor", () => {
  it("giram pelo EXIF, saem em sRGB e sem metadados", async () => {
    // Foto deitada no arquivo (900x600) com Orientation 6: aparece em pé (600x900).
    const corpo = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .jpeg()
      .withIccProfile("p3")
      .withExif({ IFD0: { Make: "Camera Teste" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ eventoId: evento.id });

    const linha = await linhaDaFoto(fotoId);
    expect([linha.largura, linha.altura]).toEqual([600, 900]);
    const chaves = chavesDaFoto(lia.id, evento.id, fotoId);
    for (const chave of [chaves.previa, chaves.miniatura]) {
      const info = await sharp(objetos.get(nome(R2.R2_BUCKET_PUBLICO, chave))!.corpo).metadata();
      expect(info.height).toBeGreaterThan(info.width);
      expect(info.exif).toBeUndefined();
      expect(info.icc).toBeUndefined();
      expect(info.space).toBe("srgb");
    }
  });

  it("a marca d'água está nos pixels da prévia", async () => {
    // Foto lisa: sem marca, todos os pixels seriam iguais.
    const corpo = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    await confirmarEnvio(lia.id, fotoId);
    const chave = chavesDaFoto(lia.id, evento.id, fotoId).previa;
    const previa = objetos.get(nome(R2.R2_BUCKET_PUBLICO, chave))!;
    const { channels } = await sharp(previa.corpo).stats();
    expect(channels[0].max - channels[0].min).toBeGreaterThan(40);
  });
});

describe("job que revisa fotos presas em processando", () => {
  /** Faz o envio da foto parecer ter começado `minutos` atrás. */
  async function envelhecer(fotoId: string, minutos: number) {
    const banco = await obterBanco();
    await banco
      .update(t.fotos)
      .set({ envioIniciadoEm: new Date(Date.now() - minutos * 60_000) })
      .where(eq(t.fotos.id, fotoId));
  }

  it("processa a foto presa cujo arquivo chegou ao R2", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    await envelhecer(fotoId, 40);

    const resultado = await revisarFotosPresas();
    expect(resultado.prontas).toBeGreaterThanOrEqual(1);
    const linha = await linhaDaFoto(fotoId);
    expect(linha.status).toBe("pronta");
    expect(linha.erroMensagem).toBeNull();
  });

  it("marca erro com mensagem quando o arquivo não está no R2", async () => {
    const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg());
    await envelhecer(fotoId, 40);

    await revisarFotosPresas();
    const linha = await linhaDaFoto(fotoId);
    expect(linha.status).toBe("erro");
    expect(linha.erroMensagem).toMatch(/não chegou/);
    // O painel mostra a mensagem.
    const item = (await listarItensDoPainel(evento.id, lia.id))?.find((i) => i.id === fotoId);
    expect(item?.erroMensagem).toMatch(/não chegou/);
  });

  it("não toca no envio recente (a URL assinada ainda pode estar em uso)", async () => {
    const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg());
    await envelhecer(fotoId, ESPERA_FOTO_PRESA_MS / 60_000 - 2);
    await revisarFotosPresas();
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");
  });

  it("pega a foto parada há poucos minutos (não espera mais meia hora)", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    await envelhecer(fotoId, ESPERA_FOTO_PRESA_MS / 60_000 + 1);
    await revisarFotosPresas();
    expect((await linhaDaFoto(fotoId)).status).toBe("pronta");
  });

  it("sem arquivo e com o envio recente, a foto volta para a fila sem virar erro", async () => {
    const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg());
    await envelhecer(fotoId, 10);
    const antes = (await linhaDaFoto(fotoId)).envioIniciadoEm;
    await revisarFotosPresas();
    const linha = await linhaDaFoto(fotoId);
    expect(linha.status).toBe("processando");
    // O horário do envio volta ao original: a foto vira erro quando passar de meia hora.
    expect(linha.envioIniciadoEm?.getTime()).toBe(antes?.getTime());
    await envelhecer(fotoId, 40);
    await revisarFotosPresas();
    expect((await linhaDaFoto(fotoId)).status).toBe("erro");
  });

  it("não pega a foto que outra chamada está processando (reserva)", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    await envelhecer(fotoId, 40);
    const agora = Date.now();
    const reservar = () =>
      reservarFotoParaProcessar(fotoId, lia.id, new Date(agora), new Date(agora + 60_000));
    expect(await reservar()).toBe(true);
    // Uma segunda reserva perde, e o job nem lista a foto reservada.
    expect(await reservar()).toBe(false);
    await revisarFotosPresas();
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ emAndamento: true });
    // Reserva vencida (a função morreu no meio): o job processa.
    await envelhecer(fotoId, 40);
    await revisarFotosPresas();
    expect((await linhaDaFoto(fotoId)).status).toBe("pronta");
  });

  it("duas chamadas ao mesmo tempo: só uma processa", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    simularPut(lia.id, evento.id, fotoId, corpo);
    const copias = () =>
      vi.mocked(S3Client.prototype.send).mock.calls.filter(([c]) => c instanceof CopyObjectCommand)
        .length;
    const antes = copias();
    const resultados = await Promise.all([
      confirmarEnvio(lia.id, fotoId),
      confirmarEnvio(lia.id, fotoId),
      confirmarEnvio(lia.id, fotoId),
    ]);
    expect(resultados.filter((r) => "eventoId" in r)).toHaveLength(1);
    expect(resultados.filter((r) => "emAndamento" in r)).toHaveLength(2);
    expect(copias() - antes).toBe(1);
    expect((await linhaDaFoto(fotoId)).status).toBe("pronta");
  });

  it("revisa no máximo o limite por execução", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg(64, 64));
      await envelhecer(fotoId, 60 + i);
      ids.push(fotoId);
    }
    const primeira = await revisarFotosPresas(Date.now(), { limite: 3 });
    expect(primeira.revisadas).toBe(3);
    const segunda = await revisarFotosPresas(Date.now(), { limite: 3 });
    expect(segunda.revisadas).toBe(2);
    for (const id of ids) expect((await linhaDaFoto(id)).status).toBe("erro");
  });

  it("para de começar fotos novas quando o prazo do job acaba", async () => {
    const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg(64, 64));
    await envelhecer(fotoId, 60);
    const r = await revisarFotosPresas(Date.now(), { prazoMs: -1 });
    expect(r.revisadas).toBe(0);
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");
    await revisarFotosPresas();
  });

  it("sem o R2 configurado, não faz nada", async () => {
    const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg());
    await envelhecer(fotoId, 40);
    for (const chave of Object.keys(R2)) vi.stubEnv(chave, "");
    expect(await revisarFotosPresas()).toEqual({ revisadas: 0, prontas: 0, comErro: 0 });
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");
    // Limpa para os próximos testes: a foto não fica na fila.
    for (const [chave, valor] of Object.entries(R2)) vi.stubEnv(chave, valor);
    await revisarFotosPresas();
  });
});

describe("sem o R2 configurado", () => {
  beforeEach(() => {
    for (const chave of Object.keys(R2)) vi.stubEnv(chave, "");
  });

  it("na produção não cria itens de exemplo e avisa que o armazenamento não está configurado", async () => {
    sessao.fotografoId = lia.id;
    const antes = (await listarItensDoPainel(evento.id, lia.id))!.length;

    vi.stubEnv("VERCEL_ENV", "production");
    expect(modoEnvio()).toBe("indisponivel");
    const lista = [{ nome: "IMG_1.jpg", tamanhoBytes: 1000, hash: "b".repeat(64) }];
    expect(await enviarFotosAcao(evento.id, lista)).toEqual({ erro: ERRO_SEM_ARMAZENAMENTO });
    expect(await iniciarEnvio(lia.id, evento.id, lista)).toEqual({ erro: ERRO_SEM_ARMAZENAMENTO });
    await expect(adicionarItensSimulados(evento.id, lia.id, lista)).rejects.toThrow();
    vi.stubEnv("VERCEL_ENV", "");

    expect((await listarItensDoPainel(evento.id, lia.id))!.length).toBe(antes);
  });

  it("fora da produção mantém o envio simulado para desenvolvimento", async () => {
    sessao.fotografoId = lia.id;
    expect(modoEnvio()).toBe("simulado");
    const resultado = await enviarFotosAcao(evento.id, [
      { nome: "IMG_2.jpg", tamanhoBytes: 1000, hash: "c".repeat(64) },
    ]);
    expect(resultado).toEqual({ enviados: 1, repetidas: 0 });
    // E o envio real recusa, sem R2.
    expect(await iniciarEnvio(lia.id, evento.id, [])).toEqual({ erro: ERRO_SEM_ARMAZENAMENTO });
  });
});

describe("data de captura do EXIF", () => {
  it("lê DateTimeOriginal e ignora EXIF ausente ou quebrado", async () => {
    const { exif } = await sharp(await jpeg()).metadata();
    expect(dataDeCaptura(exif)?.toISOString()).toBe("2026-05-10T10:32:15.000Z");
    expect(dataDeCaptura(undefined)).toBeNull();
    expect(dataDeCaptura(Buffer.from("Exif\0\0lixo"))).toBeNull();
  });
});

// ---------------------------------------------------------------- Formatos e arquivos grandes

/** Envia (no S3 falso) e processa uma foto; devolve o id e as chaves. */
async function enviarEProcessar(corpo: Buffer, formato: FormatoAceito) {
  const { fotoId } = await iniciarUm(lia.id, evento.id, corpo, formato);
  simularPut(lia.id, evento.id, fotoId, corpo, formato);
  const resultado = await confirmarEnvio(lia.id, fotoId);
  return { fotoId, resultado, chaves: chavesDaFoto(lia.id, evento.id, fotoId, formato) };
}

/** Pixel (r, g, b) da prévia no ponto (x, y). */
async function pixel(imagem: Buffer, x: number, y: number) {
  const { data, info } = await sharp(imagem).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("formatos aceitos (JPEG, PNG, WebP, TIFF, AVIF)", () => {
  it("PNG com transparência: prévia achatada sobre branco e original entregue em PNG", async () => {
    // Metade esquerda transparente (com a cor escondida em vermelho), metade direita azul.
    const largura = 800;
    const altura = 600;
    const pixels = Buffer.alloc(largura * altura * 4);
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const i = (y * largura + x) * 4;
        if (x < largura / 2) pixels.set([255, 0, 0, 0], i);
        else pixels.set([35, 98, 254, 255], i);
      }
    }
    const png = await sharp(pixels, { raw: { width: largura, height: altura, channels: 4 } })
      .png()
      .toBuffer();
    const { fotoId, resultado, chaves } = await enviarEProcessar(png, "png");
    expect(resultado).toEqual({ eventoId: evento.id });
    expect(chaves.original.endsWith(".png")).toBe(true);

    const previa = objetos.get(nome(R2.R2_BUCKET_PUBLICO, chaves.previa))!.corpo;
    const info = await sharp(previa).metadata();
    expect(info.hasAlpha).toBe(false);
    // Longe da marca d'água não dá para garantir; o canto transparente tem de estar claro, não
    // preto nem vermelho (a cor escondida).
    const [r, g, b] = await pixel(previa, 2, 2);
    expect(Math.min(r, g, b)).toBeGreaterThan(150);
    expect(r - b).toBeLessThan(60);

    // O original fica em PNG, com o tipo certo, e é entregue assim no download.
    const original = objetos.get(nome(R2.R2_BUCKET_ORIGINAIS, chaves.original))!;
    expect(original.tipo).toBe("image/png");
    expect(original.corpo.equals(png)).toBe(true);

    const pedido = await criarPedido([fotoId], {
      clienteId: null,
      nome: "Cliente PNG",
      email: "cliente-png@exemplo.com",
      whatsapp: null,
      aceitaWhatsapp: false,
      metodo: "pix",
    });
    if (!pedido.ok) throw new Error("pedido");
    await confirmarPagamento(pedido.pedidoId);
    const banco = await obterBanco();
    const [item] = await banco
      .select()
      .from(t.itensPedido)
      .where(eq(t.itensPedido.pedidoId, pedido.pedidoId));
    const download = await autorizarDownload(item.id, { token: pedido.token }, null);
    const url = new URL(download!.url);
    expect(url.searchParams.get("response-content-type")).toBe("image/png");
    expect(url.searchParams.get("response-content-disposition")).toMatch(/\.png"/);
    expect(download!.nomeArquivo.endsWith(".png")).toBe(true);
  });

  it("TIFF de 16 bits: prévia e miniatura em sRGB de 8 bits, original em TIFF", async () => {
    const tiff = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 40, g: 160, b: 90 } },
    })
      .toColourspace("rgb16")
      .tiff({ compression: "lzw" })
      .toBuffer();
    expect((await sharp(tiff).metadata()).depth).toBe("ushort");
    const { resultado, chaves, fotoId } = await enviarEProcessar(tiff, "tiff");
    expect(resultado).toEqual({ eventoId: evento.id });
    for (const chave of [chaves.previa, chaves.miniatura]) {
      const info = await sharp(objetos.get(nome(R2.R2_BUCKET_PUBLICO, chave))!.corpo).metadata();
      expect(info.format).toBe("webp");
      expect(info.space).toBe("srgb");
      expect(info.depth).toBe("uchar");
    }
    // A cor não foi destruída na conversão de 16 para 8 bits.
    const previa = objetos.get(nome(R2.R2_BUCKET_PUBLICO, chaves.previa))!.corpo;
    const { channels } = await sharp(previa).stats();
    expect(channels[1].mean).toBeGreaterThan(channels[0].mean);
    expect(objetos.get(nome(R2.R2_BUCKET_ORIGINAIS, chaves.original))?.tipo).toBe("image/tiff");
    expect([(await linhaDaFoto(fotoId)).largura, (await linhaDaFoto(fotoId)).altura]).toEqual([
      1200, 800,
    ]);
  });

  it("WebP e AVIF também são processados e guardados no formato enviado", async () => {
    const base = sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 120, b: 30 } },
    });
    const webp = await base.clone().webp().toBuffer();
    const avif = await base.clone().avif().toBuffer();
    for (const [corpo, formato, tipo] of [
      [webp, "webp", "image/webp"],
      [avif, "avif", "image/avif"],
    ] as const) {
      const { resultado, chaves } = await enviarEProcessar(corpo, formato);
      expect(resultado).toEqual({ eventoId: evento.id });
      expect(objetos.get(nome(R2.R2_BUCKET_ORIGINAIS, chaves.original))?.tipo).toBe(tipo);
      expect(objetos.has(nome(R2.R2_BUCKET_PUBLICO, chaves.previa))).toBe(true);
    }
  });

  it("RAW e HEIC que chegam ao servidor são recusados com mensagem clara", async () => {
    // Cabeçalho de CR2 (TIFF com "CR" no byte 8), declarado como TIFF.
    const cr2 = Buffer.concat([
      Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x10, 0, 0, 0, 0x43, 0x52, 0x02, 0x00]),
      Buffer.alloc(2000),
    ]);
    const raw = await enviarEProcessar(cr2, "tiff");
    expect(raw.resultado).toEqual({ erro: MENSAGEM_RAW });
    // HEIC (caixa ftyp com a marca heic), declarado como AVIF.
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypheic\0\0\0\0mif1heic", "latin1"),
      Buffer.alloc(2000),
    ]);
    const r = await enviarEProcessar(heic, "avif");
    expect((r.resultado as { erro: string }).erro).toMatch(/HEIC/);
    expect(objetos.has(nome(R2.R2_BUCKET_ORIGINAIS, r.chaves.temporaria))).toBe(false);
  });

  it("imagem grande (100 MP) gera as prévias sem estourar; acima de 160 MP é recusada", async () => {
    const grande = await sharp({
      create: { width: 12_240, height: 8_160, channels: 3, background: { r: 90, g: 90, b: 200 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    const inicio = performance.now();
    const { resultado, chaves, fotoId } = await enviarEProcessar(grande, "jpeg");
    expect(resultado).toEqual({ eventoId: evento.id });
    expect(performance.now() - inicio).toBeLessThan(20_000);
    const info = await sharp(
      objetos.get(nome(R2.R2_BUCKET_PUBLICO, chaves.previa))!.corpo,
    ).metadata();
    expect(Math.max(info.width, info.height)).toBe(1600);
    expect((await linhaDaFoto(fotoId)).largura).toBe(12_240);

    // 13.000 x 13.000 = 169 MP: acima do LIMITE_PIXELS (bomba de descompressão em poucos KB).
    const bomba = await sharp({
      create: { width: 13_000, height: 13_000, channels: 3, background: "#000000" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const recusa = await enviarEProcessar(bomba, "png");
    expect((recusa.resultado as { erro: string }).erro).toMatch(/megapixels/);
  }, 60_000);
});

describe("envio em partes (multipart) dos arquivos grandes", () => {
  it("assina uma URL por parte, reassina as que faltam, exige todas e processa o resultado", async () => {
    // TIFF sem compressão de ~58 MB: acima de MULTIPART_A_PARTIR_DE (50 MB), 6 partes de 10 MB.
    const tiff = await sharp({
      create: { width: 4400, height: 4400, channels: 3, background: { r: 10, g: 120, b: 220 } },
    })
      .tiff({ compression: "none" })
      .toBuffer();
    expect(tiff.length).toBeGreaterThan(50 * 1024 * 1024);
    const item = await iniciarUm(lia.id, evento.id, tiff, "tiff");
    expect(item.url).toBeUndefined();
    const { uploadId, urls } = item.partes!;
    expect(urls).toHaveLength(6);
    const primeira = new URL(urls[0]);
    expect(primeira.pathname).toBe(
      `/${chavesDaFoto(lia.id, evento.id, item.fotoId, "tiff").temporaria}`,
    );
    expect(primeira.searchParams.get("partNumber")).toBe("1");
    expect(primeira.searchParams.get("uploadId")).toBe(uploadId);
    expect(primeira.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(primeira.searchParams.get("X-Amz-SignedHeaders")!.split(";")).toContain(
      "content-length",
    );
    // O tipo do original fica no upload em partes (a parte em si vai sem tipo).
    expect([...multipart.values()].at(-1)?.tipo).toBe("image/tiff");

    // URL vencida: reassina só as partes pedidas, do mesmo upload.
    const novas = await assinarPartes(lia.id, item.fotoId, { uploadId, numeros: [2, 6] });
    expect("urls" in novas && novas.urls.map((u) => u.numero)).toEqual([2, 6]);
    // Parte além do tamanho registrado, foto de outro fotógrafo ou corpo inválido: recusa.
    expect(await assinarPartes(lia.id, item.fotoId, { uploadId, numeros: [7] })).toHaveProperty(
      "erro",
    );
    expect(await assinarPartes(pedro.id, item.fotoId, { uploadId, numeros: [1] })).toEqual({
      erro: "Foto não encontrada.",
    });
    expect(await assinarPartes(lia.id, item.fotoId, { uploadId: "a b", numeros: [1] })).toEqual({
      erro: "Pedido inválido.",
    });

    // O "navegador" manda as partes de 10 MB (a última menor).
    const PARTE = 10 * 1024 * 1024;
    for (let n = 1; n <= 6; n++) {
      partesEnviadas.set(`${uploadId}:${n}`, tiff.subarray((n - 1) * PARTE, n * PARTE));
    }
    const etags = Array.from({ length: 6 }, (_, n) => ({ numero: n + 1, etag: `"etag${n + 1}"` }));
    // Faltando uma parte, não fecha.
    expect(
      await concluirPartes(lia.id, item.fotoId, { uploadId, partes: etags.slice(0, 5) }),
    ).toMatchObject({ reiniciar: true });
    expect(await concluirPartes(lia.id, item.fotoId, { uploadId, partes: etags })).toEqual({
      ok: true,
    });
    // Upload que não existe mais: pede para recomeçar.
    expect(await concluirPartes(lia.id, item.fotoId, { uploadId, partes: etags })).toMatchObject({
      reiniciar: true,
    });

    expect(await confirmarEnvio(lia.id, item.fotoId)).toEqual({ eventoId: evento.id });
    const chaves = chavesDaFoto(lia.id, evento.id, item.fotoId, "tiff");
    const original = objetos.get(nome(R2.R2_BUCKET_ORIGINAIS, chaves.original))!;
    expect(original.corpo.equals(tiff)).toBe(true);
    expect(original.tipo).toBe("image/tiff");
  }, 60_000);
});

describe("rota do envio em partes (/api/envios/partes)", () => {
  function pedido(corpo: unknown, cabecalhos: Record<string, string> = {}) {
    return new Request("https://clicouai.test/api/envios/partes", {
      method: "POST",
      headers: {
        host: "clicouai.test",
        origin: "https://clicouai.test",
        "content-type": "application/json",
        ...cabecalhos,
      },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }) as never;
  }

  it("assina partes só para o dono, da mesma origem, com corpo pequeno e válido", async () => {
    const r = await iniciarEnvio(lia.id, evento.id, [
      { nome: "rota.tif", tamanhoBytes: 60 * 1024 * 1024, hash: "9".repeat(64), formato: "tiff" },
    ]);
    const item = (r as { itens: { fotoId: string; partes: { uploadId: string } }[] }).itens[0];
    const assinar = { acao: "assinar", fotoId: item.fotoId, uploadId: item.partes.uploadId };

    sessao.fotografoId = lia.id;
    const ok = await partesRota(pedido({ ...assinar, numeros: [1, 2] }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(((await ok.json()) as { urls: unknown[] }).urls).toHaveLength(2);

    expect(
      (await partesRota(pedido({ ...assinar, numeros: [1] }, { origin: "https://outro.site" })))
        .status,
    ).toBe(403);
    expect((await partesRota(pedido("x".repeat(9000)))).status).toBe(400);
    expect((await partesRota(pedido({ ...assinar, acao: "apagar" }))).status).toBe(400);
    sessao.fotografoId = pedro.id;
    expect((await partesRota(pedido({ ...assinar, numeros: [1] }))).status).toBe(422);
    sessao.fotografoId = "";
    expect((await partesRota(pedido({ ...assinar, numeros: [1] }))).status).toBe(401);

    // Fechar sem todas as partes: 409 (o navegador recomeça o upload).
    sessao.fotografoId = lia.id;
    const concluir = await partesRota(
      pedido({
        acao: "concluir",
        fotoId: item.fotoId,
        uploadId: item.partes.uploadId,
        partes: [{ numero: 1, etag: '"abc"' }],
      }),
    );
    expect(concluir.status).toBe(409);
  });
});

describe("situação das fotos entregues ao servidor (situacaoDoEnvioAcao)", () => {
  it("devolve só as fotos de quem enviou, com a mensagem do erro, e recusa pedido inválido", async () => {
    const [pronta, comErro] = (await adicionarItensSimulados(evento.id, lia.id, [
      { nome: "IMG_SITUACAO_1.jpg", tamanhoBytes: 1000 },
      { nome: "IMG_SITUACAO_2.jpg", tamanhoBytes: 1000 },
    ]))!;
    const banco = await obterBanco();
    await banco
      .update(t.fotos)
      .set({ status: "erro", erroMensagem: "O arquivo não chegou." })
      .where(eq(t.fotos.id, comErro.id));

    sessao.fotografoId = lia.id;
    const resposta = await situacaoDoEnvioAcao([pronta.id, comErro.id]);
    expect(
      "fotos" in resposta && [...resposta.fotos].sort((a, b) => (a.id < b.id ? -1 : 1)),
    ).toEqual(
      [
        { id: pronta.id, status: "pronta", erro: null },
        { id: comErro.id, status: "erro", erro: "O arquivo não chegou." },
      ].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );

    // Outro fotógrafo não vê a situação das fotos da Lia.
    sessao.fotografoId = pedro.id;
    expect(await situacaoDoEnvioAcao([pronta.id])).toEqual({ fotos: [] });

    expect(await situacaoDoEnvioAcao([])).toEqual({ erro: "Pedido inválido." });
    expect(await situacaoDoEnvioAcao(["nao-e-um-id"])).toEqual({ erro: "Pedido inválido." });
    expect(await situacaoDoEnvioAcao(Array.from({ length: 501 }, () => pronta.id))).toEqual({
      erro: "Pedido inválido.",
    });
  });
});
