"use server";

import { z } from "zod";

import {
  conversaDoUsuario,
  criarSugestao,
  marcarLidaPeloUsuario,
  registrarMensagemDoUsuario,
  type MensagemSuporte,
} from "@/dados";
import { avisarMensagemDeSuporte, avisarSugestao } from "@/servicos/avisos-suporte";
import { limiteAtingido } from "@/servicos/limites";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";

// Chat de ajuda e sugestões do painel: só quem usa o painel (fotógrafo e gestor), sempre com o
// usuário da sessão (nunca um id vindo do navegador).

async function quemUsaOPainel() {
  const usuario = await usuarioAtual();
  return usuario && podeUsarPainel(usuario) ? usuario : null;
}

export type EstadoChat = {
  nome: string;
  email: string;
  mensagens: MensagemSuporte[];
};

/** Mensagens da conversa; abrir o chat conta como ter lido a resposta. */
export async function carregarChatAcao(): Promise<EstadoChat | null> {
  const usuario = await quemUsaOPainel();
  if (!usuario) return null;
  const atual = await conversaDoUsuario(usuario.id);
  if (atual?.conversa.naoLidaPeloUsuario) await marcarLidaPeloUsuario(usuario.id);
  return {
    nome: atual?.conversa.nome ?? usuario.nome,
    email: atual?.conversa.email ?? usuario.email,
    mensagens: atual?.mensagens ?? [],
  };
}

const mensagem = z.object({
  nome: z.string().trim().min(2, "Informe o seu nome.").max(100),
  email: z.email("Informe um e-mail válido.").max(200),
  texto: z.string().trim().min(2, "Escreva a sua mensagem.").max(2000, "Até 2.000 caracteres."),
});

export async function enviarMensagemSuporteAcao(
  dados: unknown,
): Promise<{ erro: string } | { estado: EstadoChat }> {
  const usuario = await quemUsaOPainel();
  if (!usuario) return { erro: "Entre na sua conta para falar com a gente." };
  const valido = mensagem.safeParse(dados);
  if (!valido.success) return { erro: valido.error.issues[0]?.message ?? "Confira a mensagem." };
  if (await limiteAtingido("suporte_usuario", usuario.id)) {
    return { erro: "Muitas mensagens seguidas. Espere um pouco ou chame no WhatsApp." };
  }
  const { nome, email, texto } = valido.data;
  const { conversa } = await registrarMensagemDoUsuario(usuario.id, { nome, email }, texto);
  await avisarMensagemDeSuporte(conversa, texto);
  const atual = await conversaDoUsuario(usuario.id);
  return { estado: { nome, email, mensagens: atual?.mensagens ?? [] } };
}

const sugestao = z
  .string()
  .trim()
  .min(5, "Conte um pouco mais da sua ideia.")
  .max(2000, "Até 2.000 caracteres.");

export async function enviarSugestaoAcao(texto: unknown): Promise<{ erro?: string }> {
  const usuario = await quemUsaOPainel();
  if (!usuario) return { erro: "Entre na sua conta para mandar a sugestão." };
  const valido = sugestao.safeParse(texto);
  if (!valido.success) return { erro: valido.error.issues[0]?.message ?? "Confira o texto." };
  if (await limiteAtingido("sugestao_usuario", usuario.id)) {
    return { erro: "Muitas sugestões seguidas. Tente de novo mais tarde." };
  }
  const criada = await criarSugestao({
    usuarioId: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    texto: valido.data,
  });
  await avisarSugestao(criada);
  return {};
}
