import { randomUUID } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  CreateCollectionCommand,
  IndexFacesCommand,
  ProvisionedThroughputExceededException,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import { and, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { GET as rotaDaFila } from "@/app/api/jobs/fotos-presas/route";
import { reservarVagaDoLimite } from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { impressaoDoArquivo } from "@/lib/impressao-arquivo";
import { MAXIMO_DE_TENTATIVAS_DE_ROSTOS } from "@/lib/limites-envio";
import { reiniciarClienteR2 } from "@/lib/r2";

import { chavesDaFoto, processarEmSegundoPlano, revisarFotosPresas } from "./envios";
import { rodarFilaDeRostos } from "./fila-de-fotos";

const [lia] = fotografos;
const evento = eventos.find((e) => e.slug === "meia-maratona-rio-2026")!;

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};
const REKOGNITION = {
  REKOGNITION_REGIAO: "sa-east-1",
  REKOGNITION_ACCESS_KEY_ID: "chave",
  REKOGNITION_SECRET_ACCESS_KEY: "segredo",
};

/** O mesmo arquivo em todas as fotos: o que se testa aqui é a fila, não a imagem. */
let arquivo: Buffer;
let impressao: string;
const objetos = new Set<string>();
let falharLeitura: (chave: string) => boolean = () => false;
let leiturasAoMesmoTempo = 0;
let picoDeLeituras = 0;

function naoEncontrado() {
  return Object.assign(new Error("NotFound"), {
    name: "NotFound",
    $metadata: { httpStatusCode: 404 },
  });
}

/** Chamadas ao IndexFaces, com a hora de cada uma; e o que a próxima chamada deve fazer. */
let chamadas: number[] = [];
let aoIndexar: (imagem: Uint8Array) => void = () => {};

beforeAll(async () => {
  arquivo = await sharp({
    create: { width: 96, height: 64, channels: 3, background: "#336699" },
  })
    .jpeg()
    .toBuffer();
  impressao = await impressaoDoArquivo(arquivo.length, (a, b) => arquivo.subarray(a, b));

  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof PutObjectCommand) return {};
    if (comando instanceof HeadObjectCommand) {
      if (!objetos.has(comando.input.Key!)) throw naoEncontrado();
      return { ContentLength: arquivo.length };
    }
    if (comando instanceof GetObjectCommand) {
      const chave = comando.input.Key!;
      if (falharLeitura(chave)) {
        throw Object.assign(new Error("fora do ar"), { $metadata: { httpStatusCode: 503 } });
      }
      if (!objetos.has(chave)) throw naoEncontrado();
      leiturasAoMesmoTempo++;
      picoDeLeituras = Math.max(picoDeLeituras, leiturasAoMesmoTempo);
      await new Promise((ok) => setTimeout(ok, 1));
      leiturasAoMesmoTempo--;
      return {
        ContentLength: arquivo.length,
        Body: { transformToByteArray: async () => new Uint8Array(arquivo) },
      };
    }
    if (comando instanceof CopyObjectCommand) {
      objetos.add(comando.input.Key!);
      return {};
    }
    if (comando instanceof DeleteObjectCommand) {
      objetos.delete(comando.input.Key!);
      return {};
    }
    throw new Error("Comando inesperado no R2 falso");
  }) as never);

  vi.spyOn(RekognitionClient.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof CreateCollectionCommand) return {};
    if (comando instanceof IndexFacesCommand) {
      chamadas.push(performance.now());
      aoIndexar(comando.input.Image!.Bytes!);
      return { FaceRecords: [] };
    }
    throw new Error("Comando inesperado no Rekognition falso");
  }) as never);

  for (const [chave, valor] of Object.entries({ ...R2, ...REKOGNITION })) vi.stubEnv(chave, valor);
  reiniciarClienteR2();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  reiniciarClienteR2();
});

beforeEach(async () => {
  chamadas = [];
  aoIndexar = () => {};
  falharLeitura = () => false;
  picoDeLeituras = 0;
  objetos.clear();
  const banco = await obterBanco();
  await banco.update(t.fotos).set({ rostosIndexadosEm: new Date() });
  await banco.update(t.fotos).set({ status: "erro" }).where(eq(t.fotos.status, "processando"));
  await banco.delete(t.limitesDeTaxa);
});

/** Fotos em `processando` com o arquivo no R2 falso, com o envio começado há 10 minutos. */
async function fotosEnviadas(quantas: number) {
  const banco = await obterBanco();
  const inicio = new Date(Date.now() - 10 * 60_000);
  const linhas = Array.from({ length: quantas }, (_, i) => {
    const id = randomUUID();
    const chaves = chavesDaFoto(lia.id, evento.id, id, "jpeg");
    objetos.add(chaves.temporaria);
    return {
      id,
      eventoId: evento.id,
      enviadaPor: lia.id,
      chaveOriginal: chaves.temporaria,
      urlPrevia: chaves.previa,
      urlMiniatura: chaves.miniatura,
      nomeArquivo: `carga-${i}.jpg`,
      largura: 0,
      altura: 0,
      tamanhoBytes: arquivo.length,
      hashConteudo: impressao,
      ordem: 900000 + i,
      status: "processando" as const,
      envioIniciadoEm: inicio,
      liberacao: "automatica" as const,
      liberarEm: inicio,
    };
  });
  for (let i = 0; i < linhas.length; i += 500) {
    await banco.insert(t.fotos).values(linhas.slice(i, i + 500));
  }
  return linhas.map((l) => l.id);
}

/** Fotos prontas, ainda sem os rostos, com o original no R2 falso. */
async function fotosProntasSemRostos(quantas: number) {
  const ids = await fotosEnviadas(quantas);
  const banco = await obterBanco();
  for (const id of ids) {
    const chaves = chavesDaFoto(lia.id, evento.id, id, "jpeg");
    objetos.add(chaves.original);
    await banco
      .update(t.fotos)
      .set({ status: "pronta", chaveOriginal: chaves.original, rostosIndexadosEm: null })
      .where(eq(t.fotos.id, id));
  }
  return ids;
}

async function contagemPorStatus(ids: string[]) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ status: t.fotos.status, n: sql<number>`count(*)::int` })
    .from(t.fotos)
    .where(inArray(t.fotos.id, ids))
    .groupBy(t.fotos.status);
  return Object.fromEntries(linhas.map((l) => [l.status, l.n]));
}

describe("rota /api/jobs/fotos-presas", () => {
  const pedido = (cabecalhos: Record<string, string> = {}) =>
    new Request("https://exemplo.com/api/jobs/fotos-presas", {
      headers: cabecalhos,
    }) as unknown as NextRequest;

  it("sem o segredo responde 401 e não mexe em nada", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");
    const [id] = await fotosEnviadas(1);
    expect((await rotaDaFila(pedido())).status).toBe(401);
    expect(await contagemPorStatus([id])).toEqual({ processando: 1 });
    vi.stubEnv("CRON_SECRET", "");
  });

  it("com o segredo processa a fila; sem nada na fila, responde vazia", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");
    const autorizado = { authorization: "Bearer segredo-do-cron" };
    const vazia = await rotaDaFila(pedido(autorizado));
    expect(await vazia.json()).toEqual({ vazia: true });

    const [id] = await fotosEnviadas(1);
    const r = await rotaDaFila(pedido(autorizado));
    expect((await r.json()).fotos.prontas).toBe(1);
    expect(await contagemPorStatus([id])).toEqual({ pronta: 1 });
    vi.stubEnv("CRON_SECRET", "");
  });
});

describe("duas origens no envio", () => {
  const assinar = async () => {
    const { urlDeEnvio } = await import("@/lib/r2");
    return new URL(await urlDeEnvio("envios/a.jpg", 10, "image/jpeg"));
  };

  it("desligada por padrão: uma origem só, sempre assinada", async () => {
    reiniciarClienteR2();
    const hosts = new Set([(await assinar()).host, (await assinar()).host]);
    expect(hosts.size).toBe(1);
    expect((await assinar()).searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("ligada, alterna entre as duas origens do mesmo bucket, assinadas", async () => {
    vi.stubEnv("NEXT_PUBLIC_R2_DUAS_ORIGENS", "1");
    reiniciarClienteR2();
    const [a, b] = [await assinar(), await assinar()];
    expect(new Set([a.host, b.host])).toEqual(
      new Set([
        "fotos-originais.conta-teste.r2.cloudflarestorage.com",
        "conta-teste.r2.cloudflarestorage.com",
      ]),
    );
    expect(a.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(b.searchParams.get("X-Amz-Signature")).toBeTruthy();
    vi.stubEnv("NEXT_PUBLIC_R2_DUAS_ORIGENS", "");
    reiniciarClienteR2();
  });
});

describe("temporário só sai depois da foto pronta", () => {
  it("falha ao apagar o temporário não muda nada: a foto fica pronta, com o original guardado", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const [id] = await fotosEnviadas(1);
    const chaves = chavesDaFoto(lia.id, evento.id, id, "jpeg");
    const original = vi.mocked(S3Client.prototype.send).getMockImplementation()!;
    vi.mocked(S3Client.prototype.send).mockImplementation((async (...a: unknown[]) => {
      if (a[0] instanceof DeleteObjectCommand) throw new Error("fora do ar");
      return (original as (...x: unknown[]) => unknown)(...a);
    }) as never);
    await revisarFotosPresas();
    vi.mocked(S3Client.prototype.send).mockImplementation(original);
    expect(await contagemPorStatus([id])).toEqual({ pronta: 1 });
    expect(objetos.has(chaves.original)).toBe(true);
    expect(objetos.has(chaves.temporaria)).toBe(true);
  });
});

describe("limite de chamadas da conta inteira", () => {
  it("cada chamada recebe uma vaga própria, mesmo todas ao mesmo tempo", async () => {
    const esperas = await Promise.all(
      Array.from({ length: 20 }, () => reservarVagaDoLimite("teste", 250, 60_000)),
    );
    // Toda chamada recebeu vaga, e a última fica ~19 vagas à frente da primeira, mesmo em paralelo.
    expect(esperas.every((e) => e !== null)).toBe(true);
    expect(Math.max(...(esperas as number[]))).toBeGreaterThan(19 * 250 - 1500);
  });

  it("com a fila maior que a espera aceita, recusa em vez de esperar", async () => {
    expect(await reservarVagaDoLimite("teste2", 1000, 1500)).toBe(0);
    expect(await reservarVagaDoLimite("teste2", 1000, 1500)).not.toBeNull();
    expect(await reservarVagaDoLimite("teste2", 1000, 1500)).toBeNull();
  });
});

describe("fila dos rostos", () => {
  it("a foto pronta sem rostos é cadastrada, nunca acima de 5 chamadas por segundo", async () => {
    const ids = await fotosProntasSemRostos(14);
    // Duas execuções ao mesmo tempo, como duas instâncias da função.
    const [a, b] = await Promise.all([rodarFilaDeRostos(), rodarFilaDeRostos()]);
    expect(a.indexadas + b.indexadas).toBe(14);
    expect(chamadas).toHaveLength(14);
    const ordem = [...chamadas].sort((x, y) => x - y);
    for (let i = 5; i < ordem.length; i++) {
      // Seis chamadas seguidas nunca cabem em um segundo: a cota de 5 por segundo não estoura.
      expect(ordem[i] - ordem[i - 5]).toBeGreaterThan(1000);
    }
    const banco = await obterBanco();
    const linhas = await banco
      .select({ em: t.fotos.rostosIndexadosEm })
      .from(t.fotos)
      .where(inArray(t.fotos.id, ids));
    expect(linhas.every((l) => l.em)).toBe(true);
  }, 30_000);

  it("cota estourada: espera, repete e não gasta tentativa da foto", async () => {
    const [id] = await fotosProntasSemRostos(1);
    let vezes = 0;
    aoIndexar = () => {
      if (++vezes <= 2) {
        throw new ProvisionedThroughputExceededException({ $metadata: {}, message: "cota" });
      }
    };
    const r = await rodarFilaDeRostos();
    expect(r.indexadas).toBe(1);
    expect(vezes).toBe(3);
    const banco = await obterBanco();
    const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, id));
    expect(linha.rostosIndexadosEm).not.toBeNull();
  }, 30_000);

  it("cota sempre cheia: adia sem culpar a foto, que continua pronta", async () => {
    const [id] = await fotosProntasSemRostos(1);
    aoIndexar = () => {
      throw new ProvisionedThroughputExceededException({ $metadata: {}, message: "cota" });
    };
    const r = await rodarFilaDeRostos();
    expect(r).toMatchObject({ indexadas: 0, adiadas: 1 });
    const banco = await obterBanco();
    const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, id));
    expect(linha.status).toBe("pronta");
    expect(linha.rostosTentativas).toBe(0);
    expect(linha.rostosIndexadosEm).toBeNull();
    await banco.update(t.fotos).set({ rostosIndexadosEm: new Date() }).where(eq(t.fotos.id, id));
  }, 60_000);

  it("foto que sempre falha sai da fila no teto de tentativas, sem loop", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const [id] = await fotosProntasSemRostos(1);
    aoIndexar = () => {
      throw Object.assign(new Error("imagem ruim"), { name: "InvalidImageFormatException" });
    };
    const banco = await obterBanco();
    for (let i = 0; i < MAXIMO_DE_TENTATIVAS_DE_ROSTOS + 2; i++) {
      await rodarFilaDeRostos();
      await banco
        .update(t.fotos)
        .set({ rostosTentarEm: new Date(Date.now() - 1000) })
        .where(eq(t.fotos.id, id));
    }
    expect(chamadas).toHaveLength(MAXIMO_DE_TENTATIVAS_DE_ROSTOS);
    const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, id));
    expect(linha.status).toBe("pronta");
    vi.mocked(console.error).mockRestore();
  }, 30_000);

  it("não pega envio antigo, foto excluída nem evento com a coleção arquivada", async () => {
    const banco = await obterBanco();
    const [antiga, excluida, arquivada] = await fotosProntasSemRostos(3);
    await banco
      .update(t.fotos)
      .set({ criadoEm: new Date("2020-01-01") })
      .where(eq(t.fotos.id, antiga));
    await banco.update(t.fotos).set({ excluidaEm: new Date() }).where(eq(t.fotos.id, excluida));
    await banco
      .update(t.eventos)
      .set({ rostosArquivadosEm: new Date() })
      .where(eq(t.eventos.id, evento.id));
    expect((await rodarFilaDeRostos()).indexadas).toBe(0);
    expect(chamadas).toHaveLength(0);
    await banco
      .update(t.eventos)
      .set({ rostosArquivadosEm: null })
      .where(eq(t.eventos.id, evento.id));
    await banco
      .update(t.fotos)
      .set({ rostosIndexadosEm: new Date() })
      .where(eq(t.fotos.id, arquivada));
  });
});

// Teste de carga sem R2 real: CARGA_FOTOS muda o tamanho (o lote medido em produção tem 2.560).
const QUANTAS = Number(process.env.CARGA_FOTOS) || 600;

describe(`carga: lote de ${QUANTAS} fotos`, () => {
  it("nenhuma fica presa depois dos pacotes cortados, com falhas passageiras no caminho", async () => {
    vi.stubEnv("REKOGNITION_REGIAO", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ids = await fotosEnviadas(QUANTAS);
    // O navegador entrega de 100 em 100, tudo junto; cada pacote é cortado bem antes do fim.
    const pacotes: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) pacotes.push(ids.slice(i, i + 100));
    // 5% das leituras falham de forma passageira.
    let n = 0;
    falharLeitura = () => ++n % 20 === 0;
    const antes = performance.now();
    const cortados = await Promise.all(pacotes.map((p) => processarEmSegundoPlano(lia.id, p, 150)));
    const puladas = cortados.reduce((s, c) => s + c.puladas, 0);
    const prontasNoPacote = cortados.reduce((s, c) => s + c.prontas, 0);
    expect(puladas).toBeGreaterThan(0);

    // Sem navegador nenhum: só as execuções da fila, até esvaziar.
    const banco = await obterBanco();
    let execucoes = 0;
    while (execucoes < 200) {
      execucoes++;
      await revisarFotosPresas(Date.now(), { prazoMs: 20_000 });
      const { processando = 0 } = await contagemPorStatus(ids);
      if (processando === 0) break;
      // A falha passageira espera a vez: aqui o tempo é adiantado, em vez de esperar 2 minutos.
      await banco
        .update(t.fotos)
        .set({ envioIniciadoEm: new Date(Date.now() - 10 * 60_000) })
        .where(and(inArray(t.fotos.id, ids), eq(t.fotos.status, "processando")));
    }
    const final = await contagemPorStatus(ids);
    console.info(
      `[carga] ${QUANTAS} fotos: ${prontasNoPacote} nos pacotes, ${puladas} puladas, ` +
        `${execucoes} execuções da fila, ${Math.round(performance.now() - antes)} ms, ` +
        `pico de leituras ${picoDeLeituras}, final ${JSON.stringify(final)}`,
    );
    expect(final).toEqual({ pronta: QUANTAS });
    expect(picoDeLeituras).toBeLessThanOrEqual(12);
    vi.mocked(console.error).mockRestore();
    vi.stubEnv("REKOGNITION_REGIAO", REKOGNITION.REKOGNITION_REGIAO);
  }, 600_000);
});
