import { describe, expect, it } from "vitest";

import { mimeDoFormato, nomeDoArquivoOriginal, tipoDoOriginal } from "./arquivo-original";

describe("tipo do arquivo no envio e no download", () => {
  it("dá o tipo certo para foto e para vídeo (o PUT do vídeo quebrava sem ele)", () => {
    expect(mimeDoFormato("jpeg")).toBe("image/jpeg");
    expect(mimeDoFormato("mp4")).toBe("video/mp4");
    expect(mimeDoFormato("mov")).toBe("video/quicktime");
  });

  it("o original baixado sai com o tipo e a extensão do formato real", () => {
    expect(tipoDoOriginal("originais/a/b/c.mp4")).toEqual({ mime: "video/mp4", extensao: "mp4" });
    expect(tipoDoOriginal("originais/a/b/c.png").mime).toBe("image/png");
    expect(nomeDoArquivoOriginal("laco", "originais/a/b/c.mov")).toBe("laco.mov");
    expect(nomeDoArquivoOriginal("IMG_1.MP4", "originais/a/b/c.mp4")).toBe("IMG_1.MP4");
  });
});
