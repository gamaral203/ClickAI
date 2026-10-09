import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// As Server Actions pedem o fotógrafo logado; aqui ele é escolhido pelo teste.
const sessao = vi.hoisted(() => ({ fotografoId: "" }));
vi.mock("@/servicos/sessao", () => ({
  exigirFotografo: async () => ({ conta: { id: sessao.fotografoId } }),
}));

import { enviarFotosAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { adicionarItensSimulados, listarItensDoPainel } from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { dataDeCaptura } from "@/lib/exif";
import { ERRO_SEM_ARMAZENAMENTO, modoEnvio, reiniciarClienteR2 } from "@/lib/r2";
import { autorizarDownload } from "@/servicos/downloads";
import {
  chavesDaFoto,
  confirmarEnvio,
  FOTOS_PRESAS_POR_VEZ,
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
      return { Body: { transformToByteArray: async () => new Uint8Array(objeto.corpo) } };
    }
    if (comando instanceof CopyObjectCommand) {
      const origem = objetos.get(decodeURIComponent(comando.input.CopySource!));
      if (!origem) throw naoEncontrado();
      objetos.set(nome(comando.input.Bucket, comando.input.Key), { ...origem });
      return {};
    }
    if (comando instanceof DeleteObjectCommand) {
      objetos.delete(nome(comando.input.Bucket, comando.input.Key));
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

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Inicia o envio de um arquivo e devolve o item (com a URL). */
async function iniciarUm(fotografoId: string, eventoId: string, corpo: Buffer, tamanho?: number) {
  const resultado = await iniciarEnvio(fotografoId, eventoId, [
    { nome: `IMG_${semente}.jpg`, tamanhoBytes: tamanho ?? corpo.length, hash: sha256(corpo) },
  ]);
  if ("erro" in resultado) throw new Error(resultado.erro);
  const [item] = resultado.itens;
  if ("repetida" in item) throw new Error("repetida");
  return item;
}

/** O que o navegador faz com a URL assinada: grava o arquivo na chave temporária. */
function simularPut(fotografoId: string, eventoId: string, fotoId: string, corpo: Buffer) {
  const chave = chavesDaFoto(fotografoId, eventoId, fotoId).temporaria;
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

    const endereco = new URL(url);
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
    expect(linha.hashConteudo).toBe(sha256(corpo));
    expect(linha.chaveOriginal).toBe(`envios/${lia.id}/${evento.id}/${fotoId}.jpg`);
  });

  it("recusa lote inválido (não JPEG, maior que 30 MB, sem hash, mais de 25)", async () => {
    const hash = "a".repeat(64);
    const casos = [
      [{ nome: "foto.png", tamanhoBytes: 10, hash }],
      [{ nome: "foto.jpg", tamanhoBytes: 30 * 1024 * 1024 + 1, hash }],
      [{ nome: "foto.jpg", tamanhoBytes: 10 }],
      Array.from({ length: 26 }, (_, i) => ({ nome: `f${i}.jpg`, tamanhoBytes: 10, hash })),
    ];
    for (const lista of casos) {
      expect(await iniciarEnvio(lia.id, evento.id, lista)).toHaveProperty("erro");
    }
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
      { nome: "copia.jpg", tamanhoBytes: corpo.length, hash: sha256(corpo) },
    ]);
    expect(deNovo).toEqual({ itens: [{ repetida: true }] });
    // E confirmar outra vez não processa de novo.
    expect(await confirmarEnvio(lia.id, fotoId)).toEqual({ erro: "Foto não encontrada." });
  });

  it("arquivo que não é JPEG de verdade vira erro, mesmo com o hash certo", async () => {
    const png = await sharp({
      create: { width: 50, height: 50, channels: 3, background: "#2362FE" },
    })
      .png()
      .toBuffer();
    const { fotoId } = await iniciarUm(lia.id, evento.id, png);
    simularPut(lia.id, evento.id, fotoId, png);

    const resultado = await confirmarEnvio(lia.id, fotoId);
    expect(resultado).toHaveProperty("erro");
    expect((resultado as { erro: string }).erro).toMatch(/JPEG/);
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

  it("arquivo maior que 30 MB no armazenamento vira erro", async () => {
    const corpo = await jpeg();
    const { fotoId } = await iniciarUm(lia.id, evento.id, corpo);
    const grande = Buffer.concat([corpo, Buffer.alloc(30 * 1024 * 1024)]);
    simularPut(lia.id, evento.id, fotoId, grande);

    const resultado = await confirmarEnvio(lia.id, fotoId);
    expect(resultado).toEqual({ erro: "Maior que 30 MB." });
    expect((await linhaDaFoto(fotoId)).status).toBe("erro");
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
        { nome: "x.jpg", tamanhoBytes: corpo.length, hash: sha256(corpo) },
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
    await envelhecer(fotoId, 10);
    await revisarFotosPresas();
    expect((await linhaDaFoto(fotoId)).status).toBe("processando");
  });

  it("revisa no máximo FOTOS_PRESAS_POR_VEZ por execução", async () => {
    const ids: string[] = [];
    for (let i = 0; i < FOTOS_PRESAS_POR_VEZ + 2; i++) {
      const { fotoId } = await iniciarUm(lia.id, evento.id, await jpeg(64, 64));
      await envelhecer(fotoId, 60 + i);
      ids.push(fotoId);
    }
    const primeira = await revisarFotosPresas();
    expect(primeira.revisadas).toBe(FOTOS_PRESAS_POR_VEZ);
    const segunda = await revisarFotosPresas();
    expect(segunda.revisadas).toBe(2);
    for (const id of ids) expect((await linhaDaFoto(id)).status).toBe("erro");
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
