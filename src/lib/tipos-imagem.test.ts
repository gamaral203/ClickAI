import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { detectarFormato, ehNomeDeRaw, formatoDaChave, nomeComExtensao } from "@/lib/tipos-imagem";

const base = () => sharp({ create: { width: 32, height: 24, channels: 3, background: "#2362FE" } });

/** Cabeçalho TIFF little endian com uma IFD de uma entrada (tag, tipo LONG, valor). */
function tiffComTag(tag: number, valor: number) {
  const b = Buffer.alloc(64);
  b.write("II", 0, "latin1");
  b.writeUInt16LE(42, 2);
  b.writeUInt32LE(8, 4);
  b.writeUInt16LE(1, 8);
  b.writeUInt16LE(tag, 10);
  b.writeUInt16LE(4, 12);
  b.writeUInt32LE(1, 14);
  b.writeUInt32LE(valor, 18);
  return b;
}

/** Caixa ftyp de um ISO BMFF com a marca principal e as compatíveis. */
function ftyp(principal: string, ...compativeis: string[]) {
  const corpo = Buffer.from(principal + "\0\0\0\0" + compativeis.join(""), "latin1");
  const cabeca = Buffer.alloc(8);
  cabeca.writeUInt32BE(8 + corpo.length, 0);
  cabeca.write("ftyp", 4, "latin1");
  return Buffer.concat([cabeca, corpo, Buffer.alloc(32)]);
}

describe("tipo real pelos magic numbers", () => {
  it("reconhece JPEG, PNG, WebP, TIFF e AVIF gerados de verdade", async () => {
    expect(detectarFormato(await base().jpeg().toBuffer())).toBe("jpeg");
    expect(detectarFormato(await base().png().toBuffer())).toBe("png");
    expect(detectarFormato(await base().webp().toBuffer())).toBe("webp");
    expect(detectarFormato(await base().tiff().toBuffer())).toBe("tiff");
    expect(detectarFormato(await base().tiff({ compression: "lzw" }).toBuffer())).toBe("tiff");
    expect(detectarFormato(await base().avif().toBuffer())).toBe("avif");
  });

  it("vale o conteúdo, não a extensão: PNG renomeado para .jpg é PNG", async () => {
    expect(detectarFormato(await base().png().toBuffer(), "IMG_1.jpg")).toBe("png");
    expect(detectarFormato(await base().jpeg().toBuffer(), "foto.png")).toBe("jpeg");
  });

  it("reconhece HEIC/HEIF pelas marcas da caixa ftyp", () => {
    expect(detectarFormato(ftyp("heic", "mif1", "heic"))).toBe("heic");
    expect(detectarFormato(ftyp("mif1", "mif1", "heic"))).toBe("heic");
    expect(detectarFormato(ftyp("heix"))).toBe("heic");
    expect(detectarFormato(ftyp("mif1", "mif1", "avif"))).toBe("avif");
    expect(detectarFormato(ftyp("avif", "mif1", "miaf"))).toBe("avif");
  });

  it("recusa RAW: pelo cabeçalho (CR2, CR3, RAF, ORF, RW2, DNG, NEF) e pela extensão", () => {
    const cr2 = Buffer.concat([tiffComTag(0x0100, 10)]);
    cr2.write("CR", 8, "latin1");
    expect(detectarFormato(cr2)).toBe("raw");
    expect(detectarFormato(ftyp("crx ", "crx ", "isom"))).toBe("raw");
    expect(detectarFormato(Buffer.from("FUJIFILMCCD-RAW 0201FF383501", "latin1"))).toBe("raw");
    expect(detectarFormato(Buffer.from("IIRO\x08\0\0\0", "latin1"))).toBe("raw");
    expect(detectarFormato(Buffer.from("IIU\0\x08\0\0\0", "latin1"))).toBe("raw");
    // DNG: tag DNGVersion na primeira IFD.
    expect(detectarFormato(tiffComTag(0xc612, 0x01040000))).toBe("raw");
    // NEF/ARW: a primeira IFD é a miniatura (NewSubfileType = 1).
    expect(detectarFormato(tiffComTag(0x00fe, 1))).toBe("raw");
    // TIFF comum (NewSubfileType = 0) continua TIFF.
    expect(detectarFormato(tiffComTag(0x00fe, 0))).toBe("tiff");
    // Pela extensão, mesmo que o conteúdo pareça TIFF ou JPEG (alguns RAW são TIFF por dentro).
    expect(detectarFormato(tiffComTag(0x0100, 10), "DSC_0001.NEF")).toBe("raw");
    expect(detectarFormato(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "IMG_1.CR3")).toBe("raw");
    for (const nome of ["a.arw", "b.dng", "c.RAF", "d.orf", "e.rw2", "f.cr2"]) {
      expect(ehNomeDeRaw(nome)).toBe(true);
    }
    expect(ehNomeDeRaw("foto.jpg")).toBe(false);
  });

  it("devolve null para o que não é foto aceita (GIF, texto, vazio)", () => {
    expect(detectarFormato(Buffer.from("GIF89a", "latin1"))).toBeNull();
    expect(detectarFormato(Buffer.from("<svg xmlns=", "latin1"))).toBeNull();
    expect(detectarFormato(new Uint8Array(0))).toBeNull();
  });
});

describe("nome e tipo do original", () => {
  it("formato pela extensão da chave e nome com a extensão do formato real", () => {
    expect(formatoDaChave("originais/a/b/c.tif")).toBe("tiff");
    expect(formatoDaChave("originais/a/b/c.jpg")).toBe("jpeg");
    expect(formatoDaChave("originais/a/b/c.exe")).toBeNull();
    expect(nomeComExtensao("corrida-IMG_1.JPEG", "jpeg")).toBe("corrida-IMG_1.JPEG");
    expect(nomeComExtensao("corrida-IMG_1.jpg", "png")).toBe("corrida-IMG_1.png");
    expect(nomeComExtensao("corrida-IMG_1.tiff", "tiff")).toBe("corrida-IMG_1.tiff");
    expect(nomeComExtensao("corrida-IMG_1", "avif")).toBe("corrida-IMG_1.avif");
    expect(nomeComExtensao("corrida-IMG_1.heic", "jpeg")).toBe("corrida-IMG_1.jpg");
  });
});
