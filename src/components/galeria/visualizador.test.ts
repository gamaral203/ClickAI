import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// O "Comprar foto" do visualizador usa o carrinho que já existe: as mesmas funções do
// "Adicionar ao carrinho" da página da foto, com o id da foto aberta.
const adicionarAoCarrinho = vi.fn();
const enviarMetrica = vi.fn();
vi.mock("@/components/carrinho/carrinho", () => ({ adicionarAoCarrinho }));
vi.mock("@/components/metricas/registrar", () => ({ enviarMetrica }));

const { comprarFoto } = await import("./comprar-foto");

describe("comprarFoto", () => {
  beforeEach(() => {
    adicionarAoCarrinho.mockClear();
    enviarMetrica.mockClear();
  });

  it("põe no carrinho existente a foto aberta, com o id certo", () => {
    comprarFoto("7f8c2b1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b");
    expect(adicionarAoCarrinho).toHaveBeenCalledTimes(1);
    expect(adicionarAoCarrinho).toHaveBeenCalledWith("7f8c2b1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b");
    expect(enviarMetrica).toHaveBeenCalledWith({
      tipo: "carrinho",
      fotoId: "7f8c2b1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b",
    });
  });
});

// Contrato do código-fonte: o visualizador e o desfoque só mexem com a prévia e a miniatura
// (docs/CLAUDE.md, "Regras que não podem ser quebradas"). Se falhar, a mudança abriu caminho
// para o original: corrija o código, não o teste.
const ARQUIVOS = [
  "src/components/galeria/visualizador-foto.tsx",
  "src/components/galeria/foto-desfocada.tsx",
  "src/components/galeria/previa-desfocada.ts",
  "src/components/galeria/comprar-foto.ts",
  "src/lib/visualizador.ts",
  "src/lib/desfoque.ts",
];
const RAIZ = path.resolve(__dirname, "..", "..", "..");

/** Código sem os comentários (que falam do original para explicar a regra). */
function codigo(arquivo: string) {
  return readFileSync(path.join(RAIZ, arquivo), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("contrato: visualizador só com a prévia", () => {
  it.each(ARQUIVOS)("%s não referencia o original nem rotas de download", (arquivo) => {
    const texto = codigo(arquivo);
    expect(texto).not.toMatch(
      /original|chave_?original|\/api\/painel|\/api\/download|urlAssinada|assinad|r2\.dev|getSignedUrl/i,
    );
  });

  it("as imagens do visualizador saem só de urlPrevia, urlPreviaCelular ou urlMiniatura", () => {
    // Toda atribuição de imagem nos arquivos do visualizador, com o valor.
    const fontes = ARQUIVOS.flatMap((arquivo) =>
      [...codigo(arquivo).matchAll(/\b(src|miniatura)\s*=\s*\{?([^}\n;]+?)\}?;?\s*$/gm)].map(
        (m) => `${m[1]}=${m[2].trim()}`,
      ),
    );
    expect(new Set(fontes)).toEqual(
      new Set([
        // A prévia escolhida por imagemDoVisualizador (prévia ou prévia do celular)...
        "src=imagemDoVisualizador(foto, telaEstreita)",
        // ...que desce até a FotoDesfocada e o carregador do desfoque.
        "src=src",
        "src=url",
        // A miniatura (desfocada) enquanto a prévia chega.
        "miniatura=foto.urlMiniatura",
        "src=miniatura",
      ]),
    );
    // E a função que escolhe a imagem só lê os campos de prévia.
    const escolha = codigo("src/lib/visualizador.ts").match(
      /export function imagemDoVisualizador[\s\S]*?\n}/,
    )?.[0];
    expect(escolha).toBeDefined();
    const campos = [...escolha!.matchAll(/foto\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(campos)).toEqual(new Set(["urlPreviaCelular", "urlPrevia"]));
  });
});
