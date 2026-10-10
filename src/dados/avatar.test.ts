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

import { escolherAvatarAcao } from "@/app/(fotografo)/painel/perfil/avatar-acoes";
import {
  buscarContaDoFotografo,
  buscarFotografoPublico,
  criarContaDeFotografo,
  criarContaDeFotografoSeNaoExistir,
  definirAvatarDoFotografo,
} from "@/dados";
// Os ids vêm dos dados de exemplo: são os mesmos que a semente grava no banco (PGlite).
import { fotografos } from "@/dados/exemplo/dados";
import { avatarPadrao, avatarValido, urlDoAvatar } from "@/lib/avatares";

const [lia, pedro] = fotografos;

describe("avatar do fotógrafo", () => {
  it("começa sem escolha e fica com o padrão da conta", async () => {
    const conta = (await buscarContaDoFotografo(pedro.usuarioId))!;
    expect(conta.avatar).toBeNull();
    expect(urlDoAvatar(conta)).toBe(avatarPadrao(pedro.id).url);
  });

  it("a função de dados grava um id do catálogo e recusa outro valor", async () => {
    expect(await definirAvatarDoFotografo(pedro.id, "avatar-05")).toBe(true);
    expect((await buscarContaDoFotografo(pedro.usuarioId))!.avatar).toBe("avatar-05");

    expect(await definirAvatarDoFotografo(pedro.id, "avatar-99")).toBe(false);
    expect(await definirAvatarDoFotografo(pedro.id, "/etc/passwd")).toBe(false);
    expect((await buscarContaDoFotografo(pedro.usuarioId))!.avatar).toBe("avatar-05");

    expect(await definirAvatarDoFotografo(pedro.id, null)).toBe(true);
    expect((await buscarContaDoFotografo(pedro.usuarioId))!.avatar).toBeNull();
  });

  it("a Server Action salva na conta logada e aparece no perfil público", async () => {
    sessao.conta = lia;
    expect(await escolherAvatarAcao("avatar-02")).toEqual({ ok: true });
    const publico = (await buscarFotografoPublico(lia.slug))!;
    expect(publico.avatar).toBe("avatar-02");
    expect(urlDoAvatar(publico)).toBe("/avatares/avatar-02.svg");
  });

  it("a Server Action recusa id fora do catálogo sem mudar o que estava salvo", async () => {
    sessao.conta = lia;
    for (const invalido of ["avatar-13", "", null, 3, { id: "avatar-01" }]) {
      const resultado = await escolherAvatarAcao(invalido);
      expect(resultado.ok).toBe(false);
    }
    expect((await buscarFotografoPublico(lia.slug))!.avatar).toBe("avatar-02");
  });
});

describe("avatar inicial da conta nova", () => {
  // Ana (cliente de exemplo) ainda não tem conta de fotógrafo; o usuarioId é único.
  const ana = "05e70000-0000-4000-8000-000000000004";

  it("a conta criada já nasce com o avatar padrão gravado", async () => {
    const conta = await criarContaDeFotografo({
      usuarioId: ana,
      nomePublico: "Ana Souza",
      slug: "ana-souza-teste",
    });
    expect(avatarValido(conta.avatar)).toBe(true);
    expect(conta.avatar).toBe(avatarPadrao(conta.id).id);
    expect((await buscarContaDoFotografo(ana))!.avatar).toBe(conta.avatar);
    expect(urlDoAvatar(conta)).toBe(avatarPadrao(conta.id).url);
  });

  it("a criação sem conflito também grava; com conflito, não cria outra", async () => {
    expect(
      await criarContaDeFotografoSeNaoExistir({
        usuarioId: ana,
        nomePublico: "Ana Souza",
        slug: "ana-souza-outra",
      }),
    ).toBeNull();
    const nova = await criarContaDeFotografoSeNaoExistir({
      usuarioId: "05e70000-0000-4000-8000-000000000005",
      nomePublico: "Equipe",
      slug: "equipe-teste",
    });
    // O PGlite semeia o admin de exemplo (usuário 5), que ainda não tem conta de fotógrafo.
    expect(nova).not.toBeNull();
    expect(nova!.avatar).toBe(avatarPadrao(nova!.id).id);
  });
});
