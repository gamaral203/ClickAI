import { RekognitionClient } from "@aws-sdk/client-rekognition";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buscarFotosPorSelfie, indexarRostos, provedorFacial } from "@/lib/reconhecimento";

const SELFIE = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const semExemplos = async () => [];

/** Simula a Vercel: AWS_* preenchidas pela plataforma, com valores que não valem na nossa conta. */
function ambienteDaVercel() {
  vi.stubEnv("AWS_REGION", "sa-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "ASIA_DA_PLATAFORMA");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "segredo-da-plataforma");
  vi.stubEnv("AWS_SESSION_TOKEN", "token-da-plataforma");
}

function semRekognition() {
  vi.stubEnv("REKOGNITION_REGIAO", "");
  vi.stubEnv("REKOGNITION_ACCESS_KEY_ID", "");
  vi.stubEnv("REKOGNITION_SECRET_ACCESS_KEY", "");
}

function comRekognition() {
  vi.stubEnv("REKOGNITION_REGIAO", "sa-east-1");
  vi.stubEnv("REKOGNITION_ACCESS_KEY_ID", "AKIA_NOSSA");
  vi.stubEnv("REKOGNITION_SECRET_ACCESS_KEY", "segredo-nosso");
}

describe("configuração do Rekognition", () => {
  beforeEach(() => ambienteDaVercel());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("as AWS_* da Vercel sozinhas não ligam o Rekognition", () => {
    semRekognition();
    expect(provedorFacial()).toBe("exemplo");
  });

  it("na produção, só com as AWS_*, a busca avisa que está desligada", async () => {
    semRekognition();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(buscarFotosPorSelfie("evento", SELFIE, semExemplos)).rejects.toThrow(
      "Busca por selfie não configurada",
    );
  });

  it("com REKOGNITION_*, assina com as nossas chaves, não com as da plataforma", async () => {
    comRekognition();
    expect(provedorFacial()).toBe("rekognition");
    let usadas: unknown = null;
    vi.spyOn(RekognitionClient.prototype, "send").mockImplementation(async function (
      this: RekognitionClient,
    ) {
      usadas = await this.config.credentials();
      return { FaceMatches: [] };
    } as never);
    await buscarFotosPorSelfie("evento", SELFIE, semExemplos);
    expect(usadas).toMatchObject({ accessKeyId: "AKIA_NOSSA", secretAccessKey: "segredo-nosso" });
    expect(usadas).not.toHaveProperty("sessionToken", "token-da-plataforma");
  });

  it("erro de credencial na busca vai para o log só com o nome, e a busca falha", async () => {
    comRekognition();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const recusa = Object.assign(new Error("The security token included is invalid"), {
      name: "UnrecognizedClientException",
    });
    vi.spyOn(RekognitionClient.prototype, "send").mockRejectedValue(recusa as never);
    await expect(buscarFotosPorSelfie("evento", SELFIE, semExemplos)).rejects.toThrow(
      "Falha na busca facial",
    );
    expect(log).toHaveBeenCalledTimes(1);
    const mensagem = String(log.mock.calls[0][0]);
    expect(mensagem).toContain("UnrecognizedClientException");
    expect(mensagem).toContain("REKOGNITION_ACCESS_KEY_ID");
  });

  it("sem rostos na foto, indexarRostos devolve lista vazia", async () => {
    comRekognition();
    vi.spyOn(RekognitionClient.prototype, "send").mockResolvedValue({ FaceRecords: [] } as never);
    await expect(indexarRostos("evento", "foto", SELFIE)).resolves.toEqual([]);
  });
});
