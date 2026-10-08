import "server-only";

import {
  anonimizarConta,
  buscarContaDoFotografo,
  buscarUsuarioParaLogin,
  impedimentosDaExclusao,
  type ImpedimentosDaExclusao,
  type Usuario,
} from "@/dados";
import { removerRostos } from "@/lib/reconhecimento";
import { senhaConfere } from "@/lib/senha";
import { conferirSaques, SAQUE_MINIMO_CENTAVOS } from "@/servicos/saques";

// Exclusão de conta pelo próprio usuário (docs/arquitetura.md, "Exclusão de conta"). As regras
// ficam aqui; a anonimização, em src/dados/exclusao.ts.

export type SituacaoDaExclusao = ImpedimentosDaExclusao & {
  /**
   * O saldo dá para sacar (o líquido, depois da comissão, chega ao mínimo do Pix)? Saldo menor
   * nunca poderia ser sacado e não segura a exclusão: a tela avisa que a pessoa abre mão dele.
   */
  saldoSacavel: boolean;
};

/** Algo impede a exclusão agora? */
export function temImpedimento(s: SituacaoDaExclusao) {
  return s.saldoSacavel || s.saqueProcessando || s.pedidoPendente;
}

/** O saldo chega ao mínimo de saque, no saque normal (só a comissão)? */
export function saldoSacavel(saldoCentavos: number, comissaoPct: number) {
  const liquido = saldoCentavos - Math.floor((saldoCentavos * comissaoPct) / 100);
  return liquido >= SAQUE_MINIMO_CENTAVOS;
}

/**
 * O que impede o usuário de excluir a conta agora. Confere antes os saques em processamento no
 * Mercado Pago, para um saque que já saiu não segurar a exclusão.
 */
export async function situacaoDaExclusao(usuario: Usuario): Promise<SituacaoDaExclusao> {
  const conta = await buscarContaDoFotografo(usuario.id);
  if (conta) await conferirSaques(conta.id);
  const impedimentos = await impedimentosDaExclusao(usuario.id);
  return {
    ...impedimentos,
    saldoSacavel: saldoSacavel(impedimentos.saldoCentavos, conta?.comissaoPct ?? 0),
  };
}

/** A conta tem senha? Quem só entra com o Google confirma de outro jeito (digitando o e-mail). */
export async function contaTemSenha(usuario: Usuario) {
  return Boolean((await buscarUsuarioParaLogin(usuario.email))?.senhaHash);
}

export type ResultadoExclusao =
  | { ok: true }
  | { ok: false; motivo: "gestor" | "senha" | "confirmacao" | "inexistente" }
  | { ok: false; motivo: "impedimento"; situacao: SituacaoDaExclusao };

/**
 * Exclui (anonimiza) a conta do usuário logado. Quem tem senha confirma com ela; quem só entra
 * com o Google confirma digitando o próprio e-mail. Gestor não se exclui por aqui (seria
 * recriado pela variável GESTORES e deixaria a equipe sem gestão). Depois disso a versão da
 * sessão vira `null`: todo cookie aberto, em qualquer aparelho, deixa de valer.
 */
export async function excluirConta(
  usuario: Usuario,
  confirmacao: { senha?: string | null; email?: string | null },
): Promise<ResultadoExclusao> {
  if (usuario.papel === "admin") return { ok: false, motivo: "gestor" };

  const interno = await buscarUsuarioParaLogin(usuario.email);
  if (!interno || interno.id !== usuario.id) return { ok: false, motivo: "inexistente" };
  if (interno.senhaHash) {
    if (!confirmacao.senha || !senhaConfere(confirmacao.senha, interno.senhaHash)) {
      return { ok: false, motivo: "senha" };
    }
  } else if (confirmacao.email?.trim().toLowerCase() !== usuario.email) {
    return { ok: false, motivo: "confirmacao" };
  }

  const situacao = await situacaoDaExclusao(usuario);
  if (temImpedimento(situacao)) return { ok: false, motivo: "impedimento", situacao };

  const rostos = await anonimizarConta(usuario.id);
  if (rostos === null) return { ok: false, motivo: "inexistente" };

  // Tira os rostos das fotos removidas da coleção do Rekognition. Se falhar, a conta já está
  // excluída e os rostos já saíram do banco (a busca não acha mais as fotos); fica o registro.
  const porEvento = new Map<string, string[]>();
  for (const r of rostos)
    porEvento.set(r.eventoId, [...(porEvento.get(r.eventoId) ?? []), r.rostoIdProvedor]);
  for (const [eventoId, ids] of porEvento) {
    try {
      await removerRostos(eventoId, ids);
    } catch (erro) {
      console.error("Falha ao tirar rostos do Rekognition na exclusão de conta", {
        eventoId,
        erro,
      });
    }
  }
  return { ok: true };
}
