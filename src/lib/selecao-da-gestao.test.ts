import { describe, expect, it } from "vitest";

import { filtroDoAlvo, ouvirSelecaoParaBaixar, selecionarParaBaixar } from "./selecao-da-gestao";

// Seleção do download da gestão (/admin/eventos/[id]): as fotos achadas pela busca por selfie vão
// para "As selecionadas" do quadro de download, que manda ao servidor só os ids.

describe("filtroDoAlvo", () => {
  const filtro = { pastaId: "sem" as const, autorId: crypto.randomUUID(), excluidas: true };

  it("'todas do filtro' leva o filtro da tela inteiro", () => {
    expect(filtroDoAlvo("filtro", filtro)).toEqual(filtro);
  });

  it("selecionadas e evento levam só 'mostrar excluídas' (as encontradas podem estar em qualquer pasta)", () => {
    expect(filtroDoAlvo("selecionadas", filtro)).toEqual({ excluidas: true });
    expect(filtroDoAlvo("evento", filtro)).toEqual({ excluidas: true });
    expect(filtroDoAlvo("selecionadas", { pastaId: "sem" })).toEqual({ excluidas: false });
  });
});

describe("selecionarParaBaixar", () => {
  it("entrega os ids sem repetição a quem ouve, e para de entregar depois de parar", () => {
    const recebidos: string[][] = [];
    const parar = ouvirSelecaoParaBaixar((ids) => recebidos.push(ids));
    selecionarParaBaixar(["a", "b", "a"]);
    expect(recebidos).toEqual([["a", "b"]]);
    parar();
    selecionarParaBaixar(["c"]);
    expect(recebidos).toHaveLength(1);
  });

  it("sem o quadro de download na tela, não faz nada", () => {
    expect(() => selecionarParaBaixar(["a"])).not.toThrow();
  });
});
