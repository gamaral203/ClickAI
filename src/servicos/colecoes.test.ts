import { randomUUID } from "node:crypto";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto. O
// `after` da rota é guardado para o teste rodar a reindexação quando quiser.
const depois = vi.hoisted(() => ({ tarefas: [] as (() => Promise<unknown>)[] }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
  after: (tarefa: () => Promise<unknown>) => void depois.tarefas.push(tarefa),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.77" }),
}));

import { POST as rotaDaBusca } from "@/app/api/busca-facial/route";
import { criarEvento, registrarBuscaNosEventos, situacaoDaColecao } from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { reiniciarClienteR2 } from "@/lib/r2";

import {
  arquivarColecoesInativas,
  continuarReindexacoesPedidas,
  DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR,
  reindexarEventoArquivado,
} from "./colecoes";
import { rodarJobDeColecoes } from "./jobs";

// Coleções de eventos parados (docs/arquitetura.md, "Coleções arquivadas"): o job apaga a coleção
// do Rekognition e marca no banco; a busca num evento arquivado pede a reindexação e avisa.

const AMBIENTE = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
  REKOGNITION_REGIAO: "sa-east-1",
  REKOGNITION_ACCESS_KEY_ID: "AKIA_TESTE",
  REKOGNITION_SECRET_ACCESS_KEY: "segredo-teste",
};

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.now();
const [dono] = fotografos;

/** O que foi mandado ao Rekognition (só o tipo do comando e a coleção). */
const aws = vi.hoisted(() => ({
  chamadas: [] as { comando: string; colecao?: string; bytes?: Uint8Array }[],
  /** Resposta do DeleteCollection: nada (ok) ou o nome do erro da AWS. */
  erroAoApagar: null as string | null,
  /** Fotos devolvidas pelo SearchFacesByImage. */
  achadas: [] as string[],
}));

let original: Buffer;
let enviar: { mockRestore: () => void };

function erroDaAws(nome: string) {
  return Object.assign(new Error(nome), { name: nome });
}

beforeAll(async () => {
  original = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 90, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof GetObjectCommand) {
      return { Body: { transformToByteArray: async () => new Uint8Array(original) } };
    }
    throw new Error("Comando inesperado no S3 falso");
  }) as never);
});

beforeEach(() => {
  for (const [chave, valor] of Object.entries(AMBIENTE)) vi.stubEnv(chave, valor);
  reiniciarClienteR2();
  aws.chamadas = [];
  aws.erroAoApagar = null;
  aws.achadas = [];
  depois.tarefas = [];
  enviar = vi.spyOn(RekognitionClient.prototype, "send").mockImplementation((async (
    comando: unknown,
  ) => {
    const entrada = (
      comando as { input: { CollectionId?: string; Image?: { Bytes?: Uint8Array } } }
    ).input;
    const nome = (comando as object).constructor.name;
    aws.chamadas.push({
      comando: nome,
      colecao: entrada.CollectionId,
      bytes: entrada.Image?.Bytes ? Uint8Array.from(entrada.Image.Bytes) : undefined,
    });
    if (comando instanceof DeleteCollectionCommand) {
      if (aws.erroAoApagar) throw erroDaAws(aws.erroAoApagar);
      return { StatusCode: 200 };
    }
    if (comando instanceof CreateCollectionCommand) return {};
    if (comando instanceof IndexFacesCommand) {
      return { FaceRecords: [{ Face: { FaceId: randomUUID() } }] };
    }
    if (comando instanceof SearchFacesByImageCommand) {
      return {
        FaceMatches: aws.achadas.map((id) => ({
          Similarity: 99,
          Face: { FaceId: randomUUID(), ExternalImageId: id },
        })),
      };
    }
    throw new Error(`Comando inesperado: ${nome}`);
  }) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  enviar.mockRestore();
  vi.mocked(console.error).mockRestore();
});

/** Evento publicado com uma foto pronta (com rosto gravado), tudo `diasAtras` dias atrás. */
async function eventoParado(diasAtras: number, { comRosto = true, fotos = 1 } = {}) {
  const quando = new Date(AGORA - diasAtras * DIA);
  const evento = await criarEvento(dono.id, {
    categoriaId: categorias[0].id,
    inicioEm: quando.toISOString(),
    fimEm: null,
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
    titulo: `Evento parado ${diasAtras}`,
    slug: `parado-${randomUUID().slice(0, 8)}`,
  });
  const banco = await obterBanco();
  await banco.update(t.eventos).set({ status: "publicado" }).where(eq(t.eventos.id, evento.id));
  const fotoIds: string[] = [];
  for (let i = 0; i < fotos; i++) {
    const id = randomUUID();
    await banco.insert(t.fotos).values({
      id,
      eventoId: evento.id,
      enviadaPor: dono.id,
      chaveOriginal: `originais/${dono.id}/${evento.id}/${id}.jpg`,
      urlPrevia: `previas/${id}.jpg`,
      urlMiniatura: `miniaturas/${id}.jpg`,
      nomeArquivo: `F${i}.JPG`,
      largura: 320,
      altura: 240,
      ordem: i + 1,
      status: "pronta",
      criadoEm: quando,
      liberarEm: quando,
      rostosIndexadosEm: quando,
    });
    if (comRosto) {
      await banco.insert(t.rostos).values({ fotoId: id, rostoIdProvedor: randomUUID() });
    }
    fotoIds.push(id);
  }
  return { ...evento, fotoIds };
}

async function vendaPaga(fotoId: string, pagoEm: Date) {
  const banco = await obterBanco();
  const [pedido] = await banco
    .insert(t.pedidos)
    .values({
      emailComprador: "comprador@teste.com",
      nomeComprador: "Comprador",
      subtotalCentavos: 1500,
      descontoCentavos: 0,
      totalCentavos: 1500,
      metodo: "pix",
      status: "pago",
      pagoEm,
      expiraEm: pagoEm,
    })
    .returning();
  await banco.insert(t.itensPedido).values({
    pedidoId: pedido.id,
    fotoId,
    fotografoId: dono.id,
    precoCentavos: 1500,
    descontoCentavos: 0,
    valorFotografoCentavos: 1500,
    valorDonoEventoCentavos: 0,
  });
}

const colecaoDe = (eventoId: string) => `clicouai-${eventoId}`;
const apagadas = () =>
  aws.chamadas.filter((c) => c.comando === "DeleteCollectionCommand").map((c) => c.colecao);

async function rostosGravados(fotoIds: string[]) {
  const banco = await obterBanco();
  const rostos = await banco.select().from(t.rostos).where(inArray(t.rostos.fotoId, fotoIds));
  const fotos = await banco
    .select({ indexadaEm: t.fotos.rostosIndexadosEm })
    .from(t.fotos)
    .where(inArray(t.fotos.id, fotoIds));
  return { rostos: rostos.length, indexadas: fotos.filter((f) => f.indexadaEm).length };
}

describe("job das coleções: arquiva só evento parado", () => {
  it("apaga a coleção do parado e marca no banco; qualquer atividade recente segura o evento", async () => {
    const velho = DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 30;
    const parado = await eventoParado(velho, { fotos: 2 });
    const comBusca = await eventoParado(velho);
    await registrarBuscaNosEventos([comBusca.id], new Date(AGORA - 10 * DIA));
    const comVenda = await eventoParado(velho);
    await vendaPaga(comVenda.fotoIds[0], new Date(AGORA - 30 * DIA));
    const comEnvio = await eventoParado(velho);
    const banco = await obterBanco();
    await banco
      .update(t.fotos)
      .set({ criadoEm: new Date(AGORA - 5 * DIA) })
      .where(eq(t.fotos.id, comEnvio.fotoIds[0]));
    const recente = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR - 10);
    // Fim do evento recente (evento longo, de início antigo) também conta.
    const longo = await eventoParado(velho);
    await banco
      .update(t.eventos)
      .set({ fimEm: new Date(AGORA - 20 * DIA) })
      .where(eq(t.eventos.id, longo.id));
    // Sem rosto gravado: não há o que apagar (e arquivar faria a busca reindexar à toa).
    const semRosto = await eventoParado(velho, { comRosto: false });

    const r = await arquivarColecoesInativas(AGORA, { quantos: 1000 });
    expect(r.arquivadas).toBeGreaterThanOrEqual(1);
    expect(apagadas()).toContain(colecaoDe(parado.id));
    for (const ativo of [comBusca, comVenda, comEnvio, recente, longo, semRosto]) {
      expect(apagadas()).not.toContain(colecaoDe(ativo.id));
      expect((await situacaoDaColecao(ativo.id)).arquivadaEm).toBeNull();
    }
    // O parado: marcado, sem rostos no banco e com as fotos de novo "não indexadas".
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toBeInstanceOf(Date);
    expect(await rostosGravados(parado.fotoIds)).toEqual({ rostos: 0, indexadas: 0 });
    // Os outros continuam com os rostos.
    expect((await rostosGravados(comVenda.fotoIds)).rostos).toBe(1);
  });

  it("rodar de novo (ou duas vezes) não apaga nada a mais nem muda a data", async () => {
    const parado = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 1);
    await rodarJobDeColecoes(AGORA);
    const primeira = (await situacaoDaColecao(parado.id)).arquivadaEm;
    expect(primeira).toBeInstanceOf(Date);
    aws.chamadas = [];
    // Duas execuções ao mesmo tempo, depois: nada a apagar.
    await Promise.all([rodarJobDeColecoes(AGORA + DIA), rodarJobDeColecoes(AGORA + DIA)]);
    expect(apagadas()).not.toContain(colecaoDe(parado.id));
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toEqual(primeira);
  });

  it("coleção que já não existe conta como apagada", async () => {
    const parado = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 2);
    aws.erroAoApagar = "ResourceNotFoundException";
    await arquivarColecoesInativas(AGORA, { quantos: 1000 });
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toBeInstanceOf(Date);
  });

  it("sem a permissão DeleteCollection: para na primeira e não marca nada", async () => {
    const parado = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 3);
    aws.erroAoApagar = "AccessDeniedException";
    const r = await arquivarColecoesInativas(AGORA, { quantos: 1000 });
    expect(r).toMatchObject({ arquivadas: 0, falhas: 1, semPermissao: true });
    expect(apagadas()).toHaveLength(1);
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toBeNull();
    expect((await rostosGravados(parado.fotoIds)).rostos).toBe(1);
  });

  it("sem o Rekognition configurado, não faz nada (os rostos de exemplo ficam)", async () => {
    const parado = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 4);
    vi.unstubAllEnvs();
    expect(await arquivarColecoesInativas(AGORA, { quantos: 1000 })).toEqual({
      arquivadas: 0,
      falhas: 0,
    });
    expect(aws.chamadas).toHaveLength(0);
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toBeNull();
  });
});

/** Um JPEG mínimo para a rota (só a assinatura importa), com um marcador para achar. */
const MARCADOR = "SELFIE-DE-TESTE-NAO-GRAVAR";
const SELFIE = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe0,
  ...new TextEncoder().encode(MARCADOR),
  0xff,
]);

function buscaPorSelfie(slug: string) {
  const corpo = new FormData();
  corpo.set("slug", slug);
  corpo.set("consentimento", "sim");
  corpo.set("selfie", new Blob([SELFIE as BlobPart], { type: "image/jpeg" }), "selfie.jpg");
  return rotaDaBusca(
    new NextRequest("http://localhost:3000/api/busca-facial", { method: "POST", body: corpo }),
  );
}

describe("busca num evento arquivado", () => {
  it("avisa que está preparando, sem mandar a selfie, e reindexa depois da resposta", async () => {
    const parado = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 5, { fotos: 3 });
    await arquivarColecoesInativas(AGORA, { quantos: 1000 });
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toBeInstanceOf(Date);
    aws.chamadas = [];

    const resposta = await buscaPorSelfie(parado.slug);
    expect(resposta.status).toBe(202);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(await resposta.json()).toMatchObject({ preparando: true });
    // A selfie não foi a lugar nenhum: nada de SearchFacesByImage.
    expect(aws.chamadas).toHaveLength(0);
    expect((await situacaoDaColecao(parado.id)).reindexacaoPedidaEm).toBeInstanceOf(Date);

    // Depois da resposta: as fotos voltam ao Rekognition (que recria a coleção) e o evento volta
    // ao normal.
    expect(depois.tarefas).toHaveLength(1);
    await depois.tarefas[0]();
    const indexacoes = aws.chamadas.filter((c) => c.comando === "IndexFacesCommand");
    expect(indexacoes).toHaveLength(3);
    expect(indexacoes.every((c) => c.colecao === colecaoDe(parado.id))).toBe(true);
    // A selfie nunca foi junto: os bytes indexados são as fotos do evento.
    for (const c of indexacoes) {
      expect(Buffer.from(c.bytes!).toString("latin1")).not.toContain(MARCADOR);
    }
    expect(await situacaoDaColecao(parado.id)).toEqual({
      arquivadaEm: null,
      reindexacaoPedidaEm: null,
    });
    expect(await rostosGravados(parado.fotoIds)).toEqual({ rostos: 3, indexadas: 3 });

    // A busca seguinte vai ao provedor normalmente.
    aws.chamadas = [];
    aws.achadas = [parado.fotoIds[0]];
    const normal = await buscaPorSelfie(parado.slug);
    expect(normal.status).toBe(200);
    expect(((await normal.json()) as { fotos: { id: string }[] }).fotos.map((f) => f.id)).toEqual([
      parado.fotoIds[0],
    ]);
    expect(aws.chamadas.map((c) => c.comando)).toEqual(["SearchFacesByImageCommand"]);
  });

  it("nada da selfie fica no banco nem no log", async () => {
    const parado = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 6);
    await arquivarColecoesInativas(AGORA, { quantos: 1000 });
    const logs: string[] = [];
    vi.mocked(console.error).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    expect((await buscaPorSelfie(parado.slug)).status).toBe(202);
    await depois.tarefas[0]();
    const banco = await obterBanco();
    const evento = await banco.execute(
      sql`select row_to_json(e)::text as linha from eventos e where e.id = ${parado.id}`,
    );
    expect(JSON.stringify(evento)).not.toContain(MARCADOR);
    expect(logs.join("\n")).not.toContain(MARCADOR);
  });

  it("uma reindexação por vez por evento; sem terminar no prazo, a próxima continua", async () => {
    const parado = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 7, { fotos: 30 });
    await arquivarColecoesInativas(AGORA, { quantos: 1000 });
    const banco = await obterBanco();
    await banco
      .update(t.eventos)
      .set({ reindexacaoPedidaEm: new Date() })
      .where(eq(t.eventos.id, parado.id));

    // Duas ao mesmo tempo: uma trabalha, a outra encontra a reserva.
    const [a, b] = await Promise.all([
      reindexarEventoArquivado(parado.id, 0),
      reindexarEventoArquivado(parado.id, 0),
    ]);
    expect([a.situacao, b.situacao].sort()).toEqual(["ocupada", "parcial"]);
    // Prazo zero: parou depois do primeiro lote, soltou a reserva, e o evento segue arquivado.
    const feitas = (await rostosGravados(parado.fotoIds)).indexadas;
    expect(feitas).toBeGreaterThan(0);
    expect(feitas).toBeLessThan(30);
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toBeInstanceOf(Date);

    // O job de revisão continua o que foi pedido, sem refazer as já feitas.
    aws.chamadas = [];
    const r = await continuarReindexacoesPedidas(60_000);
    expect(r).toMatchObject({ concluidas: 1 });
    expect(aws.chamadas.filter((c) => c.comando === "IndexFacesCommand")).toHaveLength(30 - feitas);
    expect((await situacaoDaColecao(parado.id)).arquivadaEm).toBeNull();
  });

  it("o job só reindexa evento que alguém procurou", async () => {
    const esquecido = await eventoParado(DIAS_SEM_ATIVIDADE_PARA_ARQUIVAR + 8);
    await arquivarColecoesInativas(AGORA, { quantos: 1000 });
    aws.chamadas = [];
    await continuarReindexacoesPedidas(60_000);
    expect(aws.chamadas.filter((c) => c.colecao === colecaoDe(esquecido.id))).toHaveLength(0);
    expect((await situacaoDaColecao(esquecido.id)).arquivadaEm).toBeInstanceOf(Date);
  });
});
