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
    const dono = { usuarioId: usuario.id };
    const contato = { nome: "Fotógrafa", email: usuario.email, tipo: "fotografo" as const };
    expect(await conversaDoUsuario(dono)).toBeNull();

    const primeira = await registrarMensagemDoUsuario(dono, contato, "Como saco?");
    expect(primeira.primeira).toBe(true);
    expect(primeira.conversa.naoLidaPelaEquipe).toBe(true);
    const segunda = await registrarMensagemDoUsuario(dono, contato, "Oi?");
    expect(segunda.primeira).toBe(false);
    expect(segunda.conversa.id).toBe(primeira.conversa.id);

    const naLista = (await listarConversasSuporte()).find((c) => c.id === primeira.conversa.id);
    expect(naLista?.ultima?.texto).toBe("Oi?");

    const aberta = await abrirConversaNaGestao(primeira.conversa.id);
    expect(aberta?.mensagens.map((m) => m.texto)).toEqual(["Como saco?", "Oi?"]);
    expect(aberta?.conversa.naoLidaPelaEquipe).toBe(false);

    const respondida = await registrarRespostaDaEquipe(primeira.conversa.id, "Pelo Financeiro.");
    expect(respondida?.usuarioId).toBe(usuario.id);
    expect(await temRespostaNaoLida(dono)).toBe(true);
    await marcarLidaPeloUsuario(dono);
    expect(await temRespostaNaoLida(dono)).toBe(false);

    const doUsuario = await conversaDoUsuario(dono);
    expect(doUsuario?.mensagens.map((m) => m.autor)).toEqual(["usuario", "usuario", "equipe"]);
  });

  it("visitante sem conta tem a conversa dele, separada pelo cookie", async () => {
    const visitante = { visitanteId: randomUUID().replace(/-/g, "") };
    const outro = { visitanteId: randomUUID().replace(/-/g, "") };
    const contato = { nome: "Vyrna", email: "vyrna@teste.com", tipo: "visitante" as const };
    const { conversa, primeira } = await registrarMensagemDoUsuario(
      visitante,
      contato,
      "Não recebi as fotos",
    );
    expect(primeira).toBe(true);
    expect(conversa).toMatchObject({ usuarioId: null, tipo: "visitante", nome: "Vyrna" });
    expect(conversa).not.toHaveProperty("visitanteId");
    const segunda = await registrarMensagemDoUsuario(visitante, contato, "Oi?");
    expect(segunda.conversa.id).toBe(conversa.id);
    expect(await conversaDoUsuario(outro)).toBeNull();
    await registrarRespostaDaEquipe(conversa.id, "Já reenviamos.");
    expect(await temRespostaNaoLida(visitante)).toBe(true);
    expect(await temRespostaNaoLida(outro)).toBe(false);
    const lista = await listarConversasSuporte();
    expect(lista.find((c) => c.id === conversa.id)?.tipo).toBe("visitante");
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
