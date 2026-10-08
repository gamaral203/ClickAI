import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { RekognitionClient } from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
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
  indexarRostosDoEventoAcao,
  reiniciarRostosDoEventoAcao,
} from "@/app/(fotografo)/painel/eventos/rostos-acoes";
import { fotosParaIndexar, situacaoDosRostos } from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { reiniciarClienteR2 } from "@/lib/r2";

const [lia, pedro] = fotografos;
const evento = eventos.find((e) => e.slug === "meia-maratona-rio-2026")!;

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

let original: Buffer;

beforeAll(async () => {
  original = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 90, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  // Todo original lido do R2 é o mesmo JPEG: o que importa aqui é a resposta do Rekognition.
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
  sessao.fotografoId = lia.id;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(console.error).mockRestore();
});

/** Fotos do primeiro lote que a ação vai mandar ao Rekognition. */
async function pendentesNoPrimeiroLote() {
  const fotos = await fotosParaIndexar(evento.id, null, 8);
  return fotos.filter((f) => f.chaveOriginal).length;
}

describe("situação dos rostos do evento", () => {
  it("conta as fotos com rosto gravado (os dados de exemplo têm rostos)", async () => {
    const { prontas, comRosto } = await situacaoDosRostos(evento.id);
    expect(comRosto).toBeGreaterThan(0);
    expect(comRosto).toBeLessThanOrEqual(prontas);
  });
});

describe("cadastrar rostos que faltam", () => {
  // Como num evento enviado antes do reconhecimento estar ligado: nenhuma foto com rosto gravado.
  beforeAll(async () => {
    const banco = await obterBanco();
    const fotosDoEvento = banco
      .select({ id: t.fotos.id })
      .from(t.fotos)
      .where(eq(t.fotos.eventoId, evento.id));
    await banco.delete(t.rostos).where(inArray(t.rostos.fotoId, fotosDoEvento));
  });

  it("só o dono do evento", async () => {
    sessao.fotografoId = pedro.id;
    const r = await indexarRostosDoEventoAcao(evento.id, null);
    expect(r).toEqual({ ok: false, erro: "Evento não encontrado." });
  });

  it("credencial recusada: para e avisa o fotógrafo, sem contar como feita", async () => {
    expect(await pendentesNoPrimeiroLote()).toBeGreaterThan(0);
    const envio = vi
      .spyOn(RekognitionClient.prototype, "send")
      .mockRejectedValue(
        Object.assign(new Error("invalid token"), { name: "UnrecognizedClientException" }) as never,
      );
    const r = await indexarRostosDoEventoAcao(evento.id, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("confira as credenciais");
    // Parou na primeira foto (CreateCollection), sem insistir nas outras.
    expect(envio).toHaveBeenCalledTimes(1);
    envio.mockRestore();
  });

  it("falha passageira numa foto: conta como falha, não como feita", async () => {
    const pendentes = await pendentesNoPrimeiroLote();
    expect(pendentes).toBeGreaterThan(0);
    const envio = vi
      .spyOn(RekognitionClient.prototype, "send")
      .mockRejectedValue(
        Object.assign(new Error("slow down"), { name: "ThrottlingException" }) as never,
      );
    const r = await indexarRostosDoEventoAcao(evento.id, null);
    envio.mockRestore();
    expect(r).toMatchObject({ ok: true, indexadas: 0, falhas: pendentes });
  });

  it("foto sem nenhum rosto fica marcada e não volta ao reconhecimento", async () => {
    const antes = await situacaoDosRostos(evento.id);
    expect(antes.pendentes).toBeGreaterThan(0);
    const envio = vi
      .spyOn(RekognitionClient.prototype, "send")
      .mockResolvedValue({ FaceRecords: [] } as never);
    let depoisDe: string | null = null;
    let indexadas = 0;
    do {
      const r = await indexarRostosDoEventoAcao(evento.id, depoisDe);
      if (!r.ok) throw new Error(r.erro);
      expect(r.falhas).toBe(0);
      indexadas += r.indexadas;
      depoisDe = r.proximo;
    } while (depoisDe);
    expect(indexadas).toBe(antes.pendentes);
    expect((await situacaoDosRostos(evento.id)).pendentes).toBe(0);

    // Segunda vez: nada a mandar, nem as fotos sem rosto.
    envio.mockClear();
    const r = await indexarRostosDoEventoAcao(evento.id, null);
    expect(r).toEqual({ ok: true, indexadas: 0, falhas: 0, proximo: null });
    expect(envio).not.toHaveBeenCalled();
    envio.mockRestore();
  });

  it("refazer o cadastro de todas: só o dono", async () => {
    sessao.fotografoId = pedro.id;
    expect(await reiniciarRostosDoEventoAcao(evento.id)).toEqual({
      ok: false,
      erro: "Evento não encontrado.",
    });
    expect((await situacaoDosRostos(evento.id)).pendentes).toBe(0);
  });

  it("refazer o cadastro de todas: apaga os rostos e as marcas do evento", async () => {
    // Sem a permissão opcional DeleteFaces, segue mesmo assim.
    const envio = vi
      .spyOn(RekognitionClient.prototype, "send")
      .mockRejectedValue(
        Object.assign(new Error("no"), { name: "AccessDeniedException" }) as never,
      );
    const antes = await situacaoDosRostos(evento.id);
    expect(await reiniciarRostosDoEventoAcao(evento.id)).toEqual({ ok: true });
    envio.mockRestore();
    const depois = await situacaoDosRostos(evento.id);
    expect(depois.pendentes).toBe(antes.prontas);
    expect(depois.comRosto).toBe(0);
  });

  it("refazer com credencial recusada: não apaga nada", async () => {
    // Um lote cadastrado com um rosto por foto, para haver o que apagar.
    let n = 0;
    const envio = vi.spyOn(RekognitionClient.prototype, "send").mockImplementation((async () => ({
      FaceRecords: [
        { Face: { FaceId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` } },
      ],
    })) as never);
    await indexarRostosDoEventoAcao(evento.id, null);
    envio.mockRestore();
    const antes = await situacaoDosRostos(evento.id);
    expect(antes.comRosto).toBeGreaterThan(0);

    const recusa = vi
      .spyOn(RekognitionClient.prototype, "send")
      .mockRejectedValue(
        Object.assign(new Error("no"), { name: "UnrecognizedClientException" }) as never,
      );
    const r = await reiniciarRostosDoEventoAcao(evento.id);
    expect(recusa).toHaveBeenCalled();
    recusa.mockRestore();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("confira as credenciais");
    expect(await situacaoDosRostos(evento.id)).toEqual(antes);
  });
});
