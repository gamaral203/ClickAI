import { describe, expect, it } from "vitest";

import { motivoDaCapaForaDoSite, textoSemCapa } from "./capa";

describe("textoSemCapa", () => {
  it("segue a situação da galeria", () => {
    expect(
      textoSemCapa({ visibilidade: "publico", situacaoGaleria: { tipo: "aguardando_liberacao" } }),
    ).toBe("Fotos em breve");
    expect(
      textoSemCapa({ visibilidade: "senha", situacaoGaleria: { tipo: "aguardando_liberacao" } }),
    ).toBe("Fotos protegidas");
    expect(textoSemCapa({ visibilidade: "senha", situacaoGaleria: { tipo: "senha" } })).toBe(
      "Fotos protegidas",
    );
  });
});

describe("motivoDaCapaForaDoSite", () => {
  const base = {
    status: "publicado",
    visibilidade: "publico",
    capaEnviada: false,
    liberadas: 3,
  };

  it("galeria aberta ou evento não publicado: sem aviso", () => {
    expect(motivoDaCapaForaDoSite(base)).toBeNull();
    expect(motivoDaCapaForaDoSite({ ...base, status: "rascunho", liberadas: 0 })).toBeNull();
  });

  it("capa de foto com a galeria fechada: diz o motivo", () => {
    expect(motivoDaCapaForaDoSite({ ...base, liberadas: 0 })).toBe(
      "nenhuma foto foi liberada ainda",
    );
    expect(motivoDaCapaForaDoSite({ ...base, visibilidade: "senha" })).toBe("o evento tem senha");
  });

  it("imagem enviada aparece mesmo com a galeria fechada, menos com senha", () => {
    const enviada = { ...base, capaEnviada: true, liberadas: 0 };
    expect(motivoDaCapaForaDoSite(enviada)).toBeNull();
    expect(motivoDaCapaForaDoSite({ ...enviada, visibilidade: "senha" })).toBe(
      "o evento tem senha",
    );
  });
});
