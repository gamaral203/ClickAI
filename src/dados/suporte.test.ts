import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  abrirConversaNaGestao,
  conversaDoUsuario,
  criarSugestao,
  criarUsuario,
  listarConversasSuporte,
  listarSugestoes,
  marcarLidaPeloUsuario,
  mudarStatusSugestao,
  registrarMensagemDoUsuario,
  registrarRespostaDaEquipe,
  temRespostaNaoLida,
} from "@/dados";

async function fotografo() {
  return criarUsuario({
    nome: "Fotógrafa Chat",
    email: `chat-${randomUUID().slice(0, 8)}@exemplo.com`,
    senhaHash: "x",
    papel: "fotografo",
  });
}

describe("chat de ajuda", () => {
  it("abre uma conversa por usuário e troca as mensagens com a equipe", async () => {
    const usuario = await fotografo();
    const contato = { nome: "Fotógrafa", email: usuario.email };
    expect(await conversaDoUsuario(usuario.id)).toBeNull();

    const primeira = await registrarMensagemDoUsuario(usuario.id, contato, "Como saco?");
    expect(primeira.primeira).toBe(true);
    expect(primeira.conversa.naoLidaPelaEquipe).toBe(true);
    const segunda = await registrarMensagemDoUsuario(usuario.id, contato, "Oi?");
    expect(segunda.primeira).toBe(false);
    expect(segunda.conversa.id).toBe(primeira.conversa.id);

    const naLista = (await listarConversasSuporte()).find((c) => c.id === primeira.conversa.id);
    expect(naLista?.ultima?.texto).toBe("Oi?");

    const aberta = await abrirConversaNaGestao(primeira.conversa.id);
    expect(aberta?.mensagens.map((m) => m.texto)).toEqual(["Como saco?", "Oi?"]);
    expect(aberta?.conversa.naoLidaPelaEquipe).toBe(false);

    const respondida = await registrarRespostaDaEquipe(primeira.conversa.id, "Pelo Financeiro.");
    expect(respondida?.usuarioId).toBe(usuario.id);
    expect(await temRespostaNaoLida(usuario.id)).toBe(true);
    await marcarLidaPeloUsuario(usuario.id);
    expect(await temRespostaNaoLida(usuario.id)).toBe(false);

    const doUsuario = await conversaDoUsuario(usuario.id);
    expect(doUsuario?.mensagens.map((m) => m.autor)).toEqual(["usuario", "usuario", "equipe"]);
  });

  it("resposta para conversa que não existe não grava nada", async () => {
    expect(await registrarRespostaDaEquipe(randomUUID(), "Oi")).toBeNull();
  });
});

describe("sugestões", () => {
  it("grava a sugestão e muda o status", async () => {
    const usuario = await fotografo();
    const criada = await criarSugestao({
      usuarioId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      texto: "Editar preço em massa",
    });
    expect(criada.status).toBe("nova");
    expect(await mudarStatusSugestao(criada.id, "feita")).toBe(true);
    const lista = await listarSugestoes();
    expect(lista.find((s) => s.id === criada.id)?.status).toBe("feita");
  });
});
