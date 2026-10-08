import { describe, expect, it, vi } from "vitest";

import type { FotografoConta } from "@/dados/tipos";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// A Server Action pede o fotógrafo logado; aqui a conta é escolhida pelo teste.
const sessao = vi.hoisted(() => ({ conta: null as unknown as FotografoConta }));
vi.mock("@/servicos/sessao", () => ({
  exigirFotografo: async () => ({ conta: sessao.conta }),
}));

import { publicarEventoAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { buscarEventoDoFotografo } from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";

import { pendenciaDeRecebimento } from "./saques";

const CPF_VALIDO = "52998224725";
const clique = fotografos[2];
// Rascunho da Clique Esportes, que nasce sem chave Pix confirmada.
const rascunho = eventos.find((e) => e.slug === "travessia-lagoa-conceicao-2026")!;

describe("pendenciaDeRecebimento", () => {
  it("diferencia CPF/CNPJ faltando de chave Pix não confirmada", () => {
    expect(pendenciaDeRecebimento({ cpfCnpj: "", chavePix: null })).toBe("sem_documento");
    expect(pendenciaDeRecebimento({ cpfCnpj: CPF_VALIDO, chavePix: null })).toBe("chave_pendente");
    expect(pendenciaDeRecebimento({ cpfCnpj: CPF_VALIDO, chavePix: CPF_VALIDO })).toBeNull();
  });

  it("não aceita chave que não seja o próprio CPF/CNPJ", () => {
    expect(pendenciaDeRecebimento({ cpfCnpj: CPF_VALIDO, chavePix: "11144477735" })).toBe(
      "chave_pendente",
    );
  });
});

describe("publicarEventoAcao", () => {
  it("com CPF salvo e chave não confirmada, diz que falta clicar em usar o CPF como chave", async () => {
    sessao.conta = { ...clique, cpfCnpj: CPF_VALIDO, chavePix: null };
    const resultado = await publicarEventoAcao(rascunho.id);
    expect(resultado.irParaPerfil).toBe(true);
    expect(resultado.erro).toMatch(/Falta confirmar a chave Pix/);
    expect(resultado.erro).toMatch(/Usar meu CPF\/CNPJ como chave Pix/);
  });

  it("sem CPF/CNPJ, diz que falta informar o documento", async () => {
    sessao.conta = { ...clique, cpfCnpj: "", chavePix: null };
    const resultado = await publicarEventoAcao(rascunho.id);
    expect(resultado.erro).toMatch(/Falta o CPF ou CNPJ/);
  });

  it("com a chave confirmada, publica", async () => {
    sessao.conta = { ...clique, cpfCnpj: CPF_VALIDO, chavePix: CPF_VALIDO };
    expect(await publicarEventoAcao(rascunho.id)).toEqual({});
    expect((await buscarEventoDoFotografo(rascunho.id, clique.id))?.status).toBe("publicado");
  });
});
