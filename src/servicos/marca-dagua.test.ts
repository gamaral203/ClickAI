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
import { CONFIG_MARCA_PADRAO } from "@/lib/protecao-previas";
import { gerarPrevia, gerarVersoes } from "@/servicos/imagens";

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

describe("marca distribuída nas prévias geradas", () => {
  /** Foto com EXIF de câmera e GPS, como sai de um celular. */
  function fotoComExif() {
    return sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 120, b: 70 } },
    })
      .withExif({
        IFD0: { Make: "Camera de Teste", Model: "X100", Artist: "Fulano" },
        IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 33/1 0/1" },
      })
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  it("cada foto tem o próprio desenho, e a mesma foto sai sempre igual", async () => {
    const original = await fotoLisa();
    const a1 = await gerarPrevia(original, "padrao", { semente: "foto-a" });
    const a2 = await gerarPrevia(original, "padrao", { semente: "foto-a" });
    const b = await gerarPrevia(original, "padrao", { semente: "foto-b" });
    expect(a1.buffer.equals(a2.buffer)).toBe(true);
    const [pa, pb] = await Promise.all(
      [a1, b].map((p) => sharp(p.buffer).greyscale().raw().toBuffer()),
    );
    let diferentes = 0;
    for (let i = 0; i < pa.length; i++) if (Math.abs(pa[i] - pb[i]) > 30) diferentes++;
    // Uma parte boa dos pixels marcados muda de lugar entre uma foto e outra.
    expect(diferentes / pa.length).toBeGreaterThan(0.03);
  });

  it("sem EXIF, GPS nem perfil na prévia, na do celular e na miniatura", async () => {
    const original = await fotoComExif();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const v = await gerarVersoes(original, "padrao", { semente: "exif" });
    for (const imagem of [v.previa, v.previaCelular, v.miniatura]) {
      const meta = await sharp(imagem.buffer).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(imagem.buffer.includes(Buffer.from("Camera de Teste"))).toBe(false);
    }
  });

  it("resolução máxima e qualidade seguem a configuração global", async () => {
    const original = await fotoComExif();
    const padrao = await gerarVersoes(original, "padrao", {
      semente: "q",
      config: CONFIG_MARCA_PADRAO,
    });
    expect(Math.max(padrao.previa.largura, padrao.previa.altura)).toBe(1600);
    expect(Math.max(padrao.previaCelular.largura, padrao.previaCelular.altura)).toBe(1000);
    expect(Math.max(padrao.miniatura.largura, padrao.miniatura.altura)).toBe(400);

    const menor = await gerarVersoes(original, "padrao", {
      semente: "q",
      config: { ...CONFIG_MARCA_PADRAO, larguraPrevia: 900, qualidade: 50 },
    });
    expect(Math.max(menor.previa.largura, menor.previa.altura)).toBe(900);
    // A do celular nunca maior que a prévia.
    expect(Math.max(menor.previaCelular.largura, menor.previaCelular.altura)).toBe(900);
    expect(menor.previa.buffer.length).toBeLessThan(padrao.previa.buffer.length);

    // Teto: nem configurada acima, a prévia passa de LARGURA_ROSTOS (1920).
    const teto = await gerarVersoes(original, "padrao", {
      semente: "q",
      config: { ...CONFIG_MARCA_PADRAO, larguraPrevia: 5000 },
    });
    expect(Math.max(teto.previa.largura, teto.previa.altura)).toBeLessThanOrEqual(1920);
  });
});
