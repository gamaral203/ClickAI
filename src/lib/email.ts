// Envio de e-mail pelo Resend (https://resend.com). Só roda no servidor: a chave nunca vai ao
// navegador. Sem RESEND_API_KEY e EMAIL_REMETENTE, não envia nada e devolve `false`: a mensagem
// continua registrada na caixa de saída (/admin/mensagens), como no ambiente de exemplo.

import "server-only";

export type Email = {
  para: string;
  assunto: string;
  /** Parágrafos do corpo, em texto puro (viram HTML escapado). */
  paragrafos: string[];
  /** Botão principal do e-mail. */
  botao?: { texto: string; url: string };
  /** Texto em destaque depois dos parágrafos (ex.: o código de confirmação). */
  destaque?: string;
};

export function emailConfigurado() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_REMETENTE);
}

function escapar(texto: string) {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** HTML simples, nas cores da marca, que abre bem em qualquer cliente de e-mail. */
function html({ assunto, paragrafos, botao, destaque }: Email) {
  const corpo =
    paragrafos
      .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapar(p)}</p>`)
      .join("") +
    (destaque
      ? `<p style="margin:8px 0 24px;font-size:32px;font-weight:800;letter-spacing:8px;color:#0f1729">${escapar(destaque)}</p>`
      : "");
  const link = botao
    ? `<p style="margin:24px 0"><a href="${escapar(botao.url)}" style="display:inline-block;background:#2362FE;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapar(botao.texto)}</a></p>
<p style="margin:0;font-size:13px;color:#5a6478">Se o botão não abrir, copie este endereço: ${escapar(botao.url)}</p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f4fa;font-family:Arial,Helvetica,sans-serif;color:#0f1729">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 16px;font-size:22px;font-weight:800">Clicou<span style="color:#2362FE">Aí</span></p>
<div style="background:#ffffff;border-radius:12px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escapar(assunto)}</h1>${corpo}${link}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#5a6478">Você recebeu este e-mail por uma compra ou conta no ClicouAí.</p>
</div></body></html>`;
}

/** Envia o e-mail. Devolve se o Resend aceitou; erro de envio fica só no log, sem o conteúdo. */
export async function enviarEmail(email: Email): Promise<boolean> {
  if (!emailConfigurado()) return false;
  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_REMETENTE,
        to: [email.para],
        subject: email.assunto,
        html: html(email),
        text: [
          ...email.paragrafos,
          email.destaque ?? "",
          email.botao ? `${email.botao.texto}: ${email.botao.url}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) console.error(`[email] Resend respondeu ${resposta.status}`);
    return resposta.ok;
  } catch (erro) {
    console.error("[email] falha ao enviar", erro instanceof Error ? erro.name : "desconhecido");
    return false;
  }
}
