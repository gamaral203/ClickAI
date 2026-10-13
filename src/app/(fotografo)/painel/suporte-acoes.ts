"use server";

import { z } from "zod";

import {
  conversaDoUsuario,
  criarSugestao,
  marcarLidaPeloUsuario,
  registrarMensagemDoUsuario,
  type DonoDaConversa,
  type MensagemSuporte,
  type TipoContatoSuporte,
} from "@/dados";
import { avisarMensagemDeSuporte, avisarSugestao } from "@/servicos/avisos-suporte";
import { limiteAtingido, limiteDoIpAtingido } from "@/servicos/limites";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";
import { visitanteDoChat } from "@/servicos/suporte-visitante";

// Chat de ajuda (painel e site) e sugestões (só o painel). Quem fala vem sempre da sessão ou do
// cookie do visitante, nunca de um id mandado pelo navegador.

async function quemUsaOPainel() {
  const usuario = await usuarioAtual();
  return usuario && podeUsarPainel(usuario) ? usuario : null;
}

/**
 * Quem está no chat: a conta logada (fotógrafo, gestor ou cliente) ou o visitante sem conta. Sem
 * `criar`, o visitante que ainda não escreveu fica `null`.
 */
async function quemFala(criar: boolean): Promise<{
  dono: DonoDaConversa;
  tipo: TipoContatoSuporte;
  nome: string;
  email: string;
  limite: () => Promise<boolean>;
} | null> {
  const usuario = await usuarioAtual();
  if (usuario) {
    const tipo =
      usuario.papel === "admin"
        ? "gestor"
        : usuario.papel === "fotografo"
          ? "fotografo"
          : "cliente";
    return {
      dono: { usuarioId: usuario.id },
      tipo,
      nome: usuario.nome,
      email: usuario.email,
      limite: () => limiteAtingido("suporte_usuario", usuario.id),
    };
  }
  const visitanteId = await visitanteDoChat(criar);
  if (!visitanteId) return null;
  return {
    dono: { visitanteId },
    tipo: "visitante",
    nome: "",
    email: "",
    limite: () => limiteDoIpAtingido("suporte_ip"),
  };
}

export type EstadoChat = {
  nome: string;
  email: string;
  mensagens: MensagemSuporte[];
};

/** Mensagens da conversa; abrir o chat conta como ter lido a resposta. */
export async function carregarChatAcao(): Promise<EstadoChat | null> {
  const quem = await quemFala(false);
  if (!quem) return { nome: "", email: "", mensagens: [] };
  const atual = await conversaDoUsuario(quem.dono);
  if (atual?.conversa.naoLidaPeloUsuario) await marcarLidaPeloUsuario(quem.dono);
  return {
    nome: atual?.conversa.nome ?? quem.nome,
    email: atual?.conversa.email ?? quem.email,
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
  const valido = mensagem.safeParse(dados);
  if (!valido.success) return { erro: valido.error.issues[0]?.message ?? "Confira a mensagem." };
  const quem = await quemFala(true);
  if (!quem) return { erro: "Não foi possível abrir o chat. Chame no WhatsApp." };
  if (await quem.limite()) {
    return { erro: "Muitas mensagens seguidas. Espere um pouco ou chame no WhatsApp." };
  }
  const { nome, email, texto } = valido.data;
  const { conversa } = await registrarMensagemDoUsuario(
    quem.dono,
    { nome, email, tipo: quem.tipo },
    texto,
  );
  await avisarMensagemDeSuporte(conversa, texto);
  const atual = await conversaDoUsuario(quem.dono);
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
