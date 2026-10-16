"use server";

import { formatarHora } from "@/lib/formatar";
import {
  ehFinalidadeDeCodigo,
  enviarCodigoDeAcao,
  ESPERA_REENVIO_CODIGO_ACAO_MS,
} from "@/servicos/codigo-acao";
import { usuarioAtual } from "@/servicos/sessao";

export type EnvioDoCodigo =
  { ok: true; mensagem: string; esperaS: number } | { ok: false; erro: string; esperaS?: number };

/** "ri***@gmail.com": mostra para onde foi sem expor o e-mail inteiro na tela. */
function mascarar(email: string) {
  const [nome, dominio] = email.split("@");
  if (!dominio) return "seu e-mail";
  return `${nome.slice(0, 2)}${"*".repeat(Math.max(3, nome.length - 2))}@${dominio}`;
}

/**
 * "Enviar código" das ações sensíveis (src/servicos/codigo-acao.ts): manda o código de
 * confirmação para o e-mail da conta de quem está logado. Só serve à própria conta.
 */
export async function enviarCodigoDeAcaoAcao(finalidade: unknown): Promise<EnvioDoCodigo> {
  const usuario = await usuarioAtual();
  if (!usuario) return { ok: false, erro: "Entre de novo para continuar." };
  if (!ehFinalidadeDeCodigo(finalidade)) return { ok: false, erro: "Pedido inválido." };
  const r = await enviarCodigoDeAcao(usuario, finalidade);
  const esperaS = Math.ceil(ESPERA_REENVIO_CODIGO_ACAO_MS / 1000);
  if (r.ok) {
    return {
      ok: true,
      esperaS,
      mensagem: `Enviamos um código para ${mascarar(usuario.email)}. Ele vale até ${formatarHora(r.expiraEm)}.`,
    };
  }
  if (r.motivo === "espera") {
    return { ok: false, esperaS, erro: "Acabamos de enviar um código. Confira o seu e-mail." };
  }
  if (r.motivo === "limite") {
    return { ok: false, erro: "Muitos códigos pedidos. Espere um pouco e tente de novo." };
  }
  return { ok: false, erro: "Não foi possível enviar o e-mail agora. Tente de novo em instantes." };
}
