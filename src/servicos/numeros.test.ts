import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DetectTextCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { and, eq, inArray } from "drizzle-orm";
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

import {
  corrigirNumeroAcao,
  lerNumerosDoEventoAcao,
} from "@/app/(fotografo)/painel/eventos/numeros-acoes";
import { fotosPorNumero, salvarNumerosLidos, situacaoDosNumeros } from "@/dados";
import { eventos, fotografos, fotos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import type { TextoDetectado } from "@/lib/numeros-de-peito";
import { reiniciarClienteR2 } from "@/lib/r2";
import {
  lerNumerosDaFoto,
  lerNumerosPendentes,
  respostaSimulada,
  TEXTO_SIMULADO,
} from "@/servicos/numeros";

const [lia, pedro] = fotografos;
const ibirapuera = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
const formatura = eventos.find((e) => e.slug === "formatura-medicina-ufmg-2026")!;
const fotosDe = (eventoId: string) => fotos.filter((f) => f.eventoId === eventoId);

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
  REKOGNITION_ACCESS_KEY_ID: "AKIA_TESTE",
  REKOGNITION_SECRET_ACCESS_KEY: "segredo-teste",
};

const palavra = (DetectedText: string, Confidence = 99, Height = 0.05): TextoDetectado => ({
  DetectedText,
  Type: "WORD",
  Confidence,
  Geometry: { BoundingBox: { Left: 0.2, Top: 0.3, Width: 0.1, Height } },
});

let jpeg: Buffer;
const imagem = async () => new Uint8Array(jpeg);

async function numerosDaFoto(fotoId: string) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ numero: t.numeros.numero, manual: t.numeros.manual, confianca: t.numeros.confianca })
    .from(t.numeros)
    .where(eq(t.numeros.fotoId, fotoId));
  return linhas.sort((a, b) => a.numero.localeCompare(b.numero));
}

async function lidaEm(fotoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ em: t.fotos.numerosLidosEm })
    .from(t.fotos)
    .where(eq(t.fotos.id, fotoId));
  return linha.em;
}

/** Volta as fotos do evento a "não lidas", sem números. */
async function zerarEvento(eventoId: string) {
  const banco = await obterBanco();
  const ids = banco.select({ id: t.fotos.id }).from(t.fotos).where(eq(t.fotos.eventoId, eventoId));
  await banco.delete(t.numeros).where(inArray(t.numeros.fotoId, ids));
  await banco.update(t.fotos).set({ numerosLidosEm: null }).where(eq(t.fotos.eventoId, eventoId));
}

beforeAll(async () => {
  jpeg = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 40, g: 80, b: 160 } },
  })
    .jpeg()
    .toBuffer();
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof GetObjectCommand) {
      return { Body: { transformToByteArray: async () => new Uint8Array(jpeg) } };
    }
    throw new Error("Comando inesperado no S3 falso");
  }) as never);
});

beforeEach(() => {
  sessao.fotografoId = lia.id;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  reiniciarClienteR2();
  TEXTO_SIMULADO.clear();
  vi.mocked(console.error).mockRestore();
  vi.mocked(RekognitionClient.prototype.send).mockRestore?.();
});

/** Rekognition falso: responde o DetectText com o que o teste mandar. */
function rekognitionFalso(responder: (bytes: Uint8Array) => TextoDetectado[] | Error) {
  for (const [chave, valor] of Object.entries(REKOGNITION)) vi.stubEnv(chave, valor);
  return vi.spyOn(RekognitionClient.prototype, "send").mockImplementation((async (
    comando: unknown,
  ) => {
    if (!(comando instanceof DetectTextCommand)) throw new Error("Comando inesperado");
    const resposta = responder(comando.input.Image!.Bytes!);
    if (resposta instanceof Error) throw resposta;
    return { TextDetections: resposta };
  }) as never);
}

function erroDaAws(name: string) {
  const erro = new Error(name);
  erro.name = name;
  return erro;
}

describe("gravação dos números lidos", () => {
  it("é idempotente: reler substitui os lidos e mantém os postos à mão", async () => {
    const foto = fotosDe(ibirapuera.id)[0];
    await zerarEvento(ibirapuera.id);
    const lido = (numero: string) => ({ numero, confianca: 97, caixa: null });
    await salvarNumerosLidos(foto.id, [lido("101"), lido("202")]);
    await salvarNumerosLidos(foto.id, [lido("101"), lido("202")]);
    expect((await numerosDaFoto(foto.id)).map((n) => n.numero)).toEqual(["101", "202"]);

    const r = await corrigirNumeroAcao(foto.id, "adicionar", "303");
    expect(r).toEqual({ ok: true, numeros: ["101", "202", "303"] });
    await salvarNumerosLidos(foto.id, [lido("404"), lido("303")]);
    expect(await numerosDaFoto(foto.id)).toEqual([
      { numero: "303", manual: true, confianca: null },
      { numero: "404", manual: false, confianca: 97 },
    ]);
    expect(await lidaEm(foto.id)).toBeInstanceOf(Date);
  });
});

describe("leitura de uma foto", () => {
  it("com a opção do evento desligada, não lê nem grava", async () => {
    const foto = fotosDe(formatura.id)[0];
    const chamada = rekognitionFalso(() => [palavra("123")]);
    expect(await lerNumerosDaFoto(formatura.id, foto.id, imagem)).toBe("desligada");
    expect(chamada).not.toHaveBeenCalled();
    expect(await numerosDaFoto(foto.id)).toEqual([]);
    expect(await lidaEm(foto.id)).toBeNull();
  });

  it("com o Rekognition, manda a imagem ao DetectText e grava os números extraídos", async () => {
    const foto = fotosDe(ibirapuera.id)[1];
    await zerarEvento(ibirapuera.id);
    const chamada = rekognitionFalso(() => [
      palavra("0451"),
      palavra("12:30"),
      palavra("88", 60),
      palavra("999", 99, 0.005),
    ]);
    expect(await lerNumerosDaFoto(ibirapuera.id, foto.id, imagem)).toBe("lida");
    expect(chamada).toHaveBeenCalledTimes(1);
    const comando = chamada.mock.calls[0][0] as unknown as DetectTextCommand;
    expect(comando.input.Filters?.WordFilter?.MinBoundingBoxHeight).toBeGreaterThan(0);
    expect(await numerosDaFoto(foto.id)).toEqual([{ numero: "451", manual: false, confianca: 99 }]);
  });

  it("credencial errada não marca a foto; imagem inválida conta como lida", async () => {
    const [a, b] = fotosDe(ibirapuera.id).slice(2, 4);
    await zerarEvento(ibirapuera.id);
    rekognitionFalso(() => erroDaAws("AccessDeniedException"));
    expect(await lerNumerosDaFoto(ibirapuera.id, a.id, imagem)).toBe("falha_credencial");
    expect(await lidaEm(a.id)).toBeNull();
    vi.mocked(RekognitionClient.prototype.send).mockRestore();

    rekognitionFalso(() => erroDaAws("InvalidImageFormatException"));
    expect(await lerNumerosDaFoto(ibirapuera.id, b.id, imagem)).toBe("falha");
    expect(await lidaEm(b.id)).toBeInstanceOf(Date);
  });

  it("sem a AWS, o modo simulado é determinístico e nunca chama o Rekognition", async () => {
    const chamada = vi.spyOn(RekognitionClient.prototype, "send");
    const foto = fotosDe(ibirapuera.id)[4];
    await zerarEvento(ibirapuera.id);
    expect(respostaSimulada(foto.id)).toEqual(respostaSimulada(foto.id));
    TEXTO_SIMULADO.set(foto.id, [palavra("777"), palavra("KM")]);
    expect(await lerNumerosDaFoto(ibirapuera.id, foto.id, imagem)).toBe("lida");
    expect((await numerosDaFoto(foto.id)).map((n) => n.numero)).toEqual(["777"]);
    expect(chamada).not.toHaveBeenCalled();
  });

  it("na produção sem a AWS, a leitura fica desligada", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const foto = fotosDe(ibirapuera.id)[5];
    await zerarEvento(ibirapuera.id);
    expect(await lerNumerosDaFoto(ibirapuera.id, foto.id, imagem)).toBe("desligada");
    expect(await numerosDaFoto(foto.id)).toEqual([]);
  });
});

describe("leitura em lote das fotos do evento (painel)", () => {
  it("o dono lê todas as que faltam, em lotes, até acabar", async () => {
    await zerarEvento(ibirapuera.id);
    const antes = await situacaoDosNumeros(ibirapuera.id);
    expect(antes.pendentes).toBe(antes.prontas);
    expect(antes.prontas).toBeGreaterThan(12);

    let depoisDe: string | null = null;
    let lidas = 0;
    let chamadas = 0;
    do {
      const r = await lerNumerosDoEventoAcao(ibirapuera.id, depoisDe);
      if (!r.ok) throw new Error(r.erro);
      lidas += r.lidas;
      depoisDe = r.proximo;
      chamadas++;
    } while (depoisDe);
    expect(chamadas).toBeGreaterThan(1);
    expect(lidas).toBe(antes.prontas);
    const depois = await situacaoDosNumeros(ibirapuera.id);
    expect(depois.pendentes).toBe(0);
    // Uma em cada cinco fotos, em média, fica sem número no modo simulado.
    expect(depois.comNumero).toBeGreaterThan(0);
    expect(depois.comNumero).toBeLessThan(depois.prontas);
  });

  it("recusa evento de outro fotógrafo e evento com a opção desligada", async () => {
    sessao.fotografoId = pedro.id;
    expect(await lerNumerosDoEventoAcao(ibirapuera.id, null)).toEqual({
      ok: false,
      erro: "Evento não encontrado.",
    });
    const r = await lerNumerosDoEventoAcao(formatura.id, null);
    expect(r.ok).toBe(false);
    expect(await situacaoDosNumeros(formatura.id)).toMatchObject({ comNumero: 0 });
    expect(await lerNumerosDoEventoAcao("nao-e-id", null)).toMatchObject({ ok: false });
  });
});

describe("job de revisão", () => {
  it("lê as pendentes dos eventos com a opção ligada; nada sem a AWS", async () => {
    await zerarEvento(ibirapuera.id);
    expect(await lerNumerosPendentes(5_000)).toEqual({ lidas: 0, falhas: 0 });

    for (const [chave, valor] of Object.entries(R2)) vi.stubEnv(chave, valor);
    reiniciarClienteR2();
    const chamada = rekognitionFalso(() => [palavra("1500")]);
    const r = await lerNumerosPendentes(60_000);
    expect(r.lidas).toBeGreaterThan(0);
    expect(r.falhas).toBe(0);
    // Evento sem a opção não entra.
    expect(await situacaoDosNumeros(formatura.id)).toMatchObject({ comNumero: 0 });
    // Foto recente (pode estar na leitura do próprio envio) espera a próxima execução.
    const banco = await obterBanco();
    const recente = fotosDe(ibirapuera.id)[0];
    await banco
      .update(t.fotos)
      .set({ numerosLidosEm: null, criadoEm: new Date() })
      .where(eq(t.fotos.id, recente.id));
    chamada.mockClear();
    await lerNumerosPendentes(60_000);
    expect(await lidaEm(recente.id)).toBeNull();
  });
});

describe("busca por número", () => {
  it("normaliza o número como na gravação (zeros à esquerda)", async () => {
    const foto = fotosDe(ibirapuera.id).find((f) => f.status === "pronta")!;
    await salvarNumerosLidos(foto.id, [{ numero: "42", confianca: 99, caixa: null }]);
    const achadas = (await fotosPorNumero(ibirapuera.id, "42")).map((f) => f.id);
    expect(achadas).toContain(foto.id);
    expect((await fotosPorNumero(ibirapuera.id, "0042")).map((f) => f.id)).toEqual(achadas);
    expect(await fotosPorNumero(ibirapuera.id, "4x2")).toEqual([]);
    // Número de outro evento não aparece.
    expect(await fotosPorNumero(formatura.id, "42")).toEqual([]);
  });
});

describe("correção manual", () => {
  it("o dono põe e tira números; outro fotógrafo não mexe", async () => {
    const foto = fotosDe(ibirapuera.id).find((f) => f.enviadaPor === lia.id)!;
    await zerarEvento(ibirapuera.id);
    expect(await corrigirNumeroAcao(foto.id, "adicionar", "0815")).toEqual({
      ok: true,
      numeros: ["815"],
    });
    expect(await corrigirNumeroAcao(foto.id, "adicionar", "abc")).toEqual({
      ok: false,
      erro: "Use só números, até 6 dígitos.",
    });
    expect(await corrigirNumeroAcao(foto.id, "remover", "815")).toEqual({ ok: true, numeros: [] });
    expect(await corrigirNumeroAcao(foto.id, "apagar", "1")).toEqual({
      ok: false,
      erro: "Pedido inválido.",
    });

    // Pedro é colaborador do evento, mas a foto é da Lia.
    sessao.fotografoId = pedro.id;
    expect(await corrigirNumeroAcao(foto.id, "adicionar", "1")).toEqual({
      ok: false,
      erro: "Foto não encontrada.",
    });
    // Fotógrafo sem relação com o evento.
    sessao.fotografoId = fotografos[2].id;
    expect(await corrigirNumeroAcao(foto.id, "adicionar", "1")).toEqual({
      ok: false,
      erro: "Foto não encontrada.",
    });
    expect(await numerosDaFoto(foto.id)).toEqual([]);
  });

  it("o colaborador corrige as fotos que ele enviou", async () => {
    const foto = fotosDe(ibirapuera.id).find((f) => f.enviadaPor === pedro.id)!;
    sessao.fotografoId = pedro.id;
    expect(await corrigirNumeroAcao(foto.id, "adicionar", "321")).toEqual({
      ok: true,
      numeros: ["321"],
    });
    const banco = await obterBanco();
    const [linha] = await banco
      .select({ manual: t.numeros.manual })
      .from(t.numeros)
      .where(and(eq(t.numeros.fotoId, foto.id), eq(t.numeros.numero, "321")));
    expect(linha.manual).toBe(true);
  });
});
