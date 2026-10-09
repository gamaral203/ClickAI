// O que fazer quando o link de confirmação do e-mail não saiu por e-mail. Fora da produção
// (desenvolvimento, testes e preview com dados de exemplo), a tela mostra o link para dar para
// testar sem o Resend. Na produção, nunca: quem criasse conta com o e-mail de outra pessoa
// confirmaria pela tela e herdaria as compras de convidado dela.

import { emProducao } from "@/db/conexao";
import { emailConfigurado } from "@/lib/email";

const TOKEN = /^[\w-]{20,100}$/;

/**
 * Para onde ir quando o e-mail de confirmação não foi enviado. Na produção, a URL não leva o
 * token (nem a tela, nem os logs de acesso o veem) e o erro fica no log, sem o token.
 */
export function destinoSemEnvio(token: string, destino: string): string {
  const proximo = encodeURIComponent(destino);
  if (emProducao()) {
    console.error("[auth] link de confirmação de e-mail não enviado: envio de e-mail indisponível");
    return `/conta/confirmar-email?indisponivel=1&proximo=${proximo}`;
  }
  return `/conta/confirmar-email?token=${encodeURIComponent(token)}&proximo=${proximo}`;
}

/** Token que a tela pode mostrar como link de exemplo. Na produção, sempre `null`. */
export function tokenDeExemplo(token: unknown): string | null {
  if (emProducao()) return null;
  return typeof token === "string" && TOKEN.test(token) ? token : null;
}

/**
 * Dá para mandar (ou, fora da produção, mostrar) um link de confirmação? Na produção sem o
 * Resend configurado, não: a tela mostra o aviso em vez do botão "Confirmar e-mail", que só
 * levaria de novo ao aviso de envio indisponível.
 */
export function podeEnviarConfirmacao(): boolean {
  return emailConfigurado() || !emProducao();
}
