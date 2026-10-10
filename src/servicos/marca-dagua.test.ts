import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import { modeloMarcaDoEvento, salvarModeloMarca } from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { MODELOS_MARCA } from "@/lib/marca-dagua";
import { gerarPrevia } from "@/servicos/imagens";

/** Foto lisa: sem marca, todos os pixels seriam iguais. */
function fotoLisa() {
  return sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 30, b: 30 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("modelos de marca d'água", () => {
  it("todo modelo grava a marca nos pixels, e cada um sai diferente", async () => {
    const original = await fotoLisa();
    const medias = new Set<number>();
    for (const modelo of MODELOS_MARCA) {
      const previa = await gerarPrevia(original, modelo);
      const { channels } = await sharp(previa.buffer).stats();
      expect(channels[0].max - channels[0].min, modelo).toBeGreaterThan(40);
      medias.add(Math.round(channels[0].mean * 100));
    }
    expect(medias.size).toBe(MODELOS_MARCA.length);
  });

  it("o mais protegido cobre mais a foto que o discreto", async () => {
    const original = await fotoLisa();
    const media = async (modelo: (typeof MODELOS_MARCA)[number]) =>
      (await sharp((await gerarPrevia(original, modelo)).buffer).stats()).channels[0].mean;
    expect(await media("maxima")).toBeGreaterThan(await media("discreta"));
  });

  it("o evento usa o modelo escolhido pelo dono", async () => {
    const [lia] = fotografos;
    const evento = eventos.find((e) => e.fotografoId === lia.id)!;
    expect(await modeloMarcaDoEvento(evento.id)).toBe("padrao");
    await salvarModeloMarca(lia.id, "densa");
    expect(await modeloMarcaDoEvento(evento.id)).toBe("densa");
    await salvarModeloMarca(lia.id, "padrao");
  });
});
