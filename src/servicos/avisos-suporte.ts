import "server-only";

import { gestoresParaAviso, type ConversaSuporte, type Sugestao } from "@/dados";
import { enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";
import { enviarPush } from "@/lib/push";

// Avisos do chat de ajuda e das sugestões: a gestão fica sabendo de cada mensagem nova; quem
// escreveu fica sabendo da resposta. Uma falha aqui nunca desfaz a mensagem gravada.

/** Começo do texto, para o corpo da notificação. */
function resumo(texto: string, max = 120) {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

export async function avisarMensagemDeSuporte(conversa: ConversaSuporte, texto: string) {
  try {
    const gestores = await gestoresParaAviso();
    const url = `/admin/suporte/${conversa.id}`;
    await enviarPush(
      gestores.map((g) => g.id),
      { titulo: `Chat de ajuda: ${conversa.nome}`, corpo: resumo(texto), url },
    );
    for (const gestor of gestores) {
      await enviarEmail({
        para: gestor.email,
        assunto: `Nova mensagem no chat de ajuda: ${conversa.nome}`,
        paragrafos: [`${conversa.nome} (${conversa.email}) escreveu:`, texto],
        botao: { texto: "Responder", url: urlDoSite(url) },
      });
    }
  } catch (erro) {
    console.error("Falha ao avisar a gestão da mensagem de suporte", {
      conversa: conversa.id,
      erro,
    });
  }
}

export async function avisarRespostaDeSuporte(conversa: ConversaSuporte, texto: string) {
  try {
    await enviarPush([conversa.usuarioId], {
      titulo: "Resposta da equipe ClicouAí 💬",
      corpo: resumo(texto),
      url: "/painel?ajuda=1",
    });
    await enviarEmail({
      para: conversa.email,
      assunto: "Respondemos a sua mensagem no ClicouAí",
      paragrafos: [
        `Oi, ${conversa.nome}! A nossa equipe respondeu no chat de ajuda:`,
        texto,
        "Para continuar a conversa, abra o chat no seu painel.",
      ],
      botao: { texto: "Abrir o chat", url: urlDoSite("/painel?ajuda=1") },
    });
  } catch (erro) {
    console.error("Falha ao avisar a resposta de suporte", { conversa: conversa.id, erro });
  }
}

export async function avisarSugestao(sugestao: Sugestao) {
  try {
    const gestores = await gestoresParaAviso();
    await enviarPush(
      gestores.map((g) => g.id),
      {
        titulo: `Sugestão de ${sugestao.nome} 🚀`,
        corpo: resumo(sugestao.texto),
        url: "/admin/sugestoes",
      },
    );
  } catch (erro) {
    console.error("Falha ao avisar a gestão da sugestão", { sugestao: sugestao.id, erro });
  }
}
