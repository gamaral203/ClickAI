import "server-only";

import { buscarUsuarioParaLogin, trocarDocumentoDoFotografo, type FotografoConta } from "@/dados";
import { senhaConfere } from "@/lib/senha";

import { loginBloqueado } from "./limites";
import { avisarTrocaDeDocumento } from "./mensagens";
import { BLOQUEIO_SAQUE_APOS_TROCA_MS } from "./saques";
import { encerrarOutrasSessoes, type SessaoAtual } from "./sessao";

// Troca do CPF/CNPJ do fotógrafo, que define a chave Pix do saque (docs/riscos.md, prioridade
// alta: saque para a chave de outra pessoa). Quem invade a conta não pode trocar o documento e
// sacar logo em seguida:
//   - a troca pede a senha atual de novo; quem só entra com o Google precisa ter entrado com ele
//     há pouco (LOGIN_GOOGLE_RECENTE_MS);
//   - a chave Pix volta a exigir confirmação;
//   - sai um aviso por e-mail para a dona da conta;
//   - os saques ficam bloqueados por 72 horas (src/servicos/saques.ts, saqueBloqueadoAte);
//   - as outras sessões da conta caem; esta continua.

/** Login com o Google que vale como confirmação da identidade para trocar o documento. */
export const LOGIN_GOOGLE_RECENTE_MS = 10 * 60 * 1000;

export type ConfirmacaoDeIdentidade = "ok" | "senha" | "bloqueado" | "google_antigo";

/**
 * Confere de novo quem está trocando o documento. Conta com senha: a senha atual, com o mesmo
 * limite de tentativas do login. Conta só com o Google: sessão aberta pelo Google há menos de 10
 * minutos (senão, a tela pede para entrar de novo com ele).
 */
export async function confirmarIdentidade(
  sessao: SessaoAtual,
  senha: string | null | undefined,
  agora = Date.now(),
): Promise<ConfirmacaoDeIdentidade> {
  const interno = await buscarUsuarioParaLogin(sessao.usuario.email);
  if (!interno || interno.id !== sessao.usuario.id) return "senha";
  if (interno.senhaHash) {
    if (await loginBloqueado(interno.email)) return "bloqueado";
    return senha && senhaConfere(senha, interno.senhaHash) ? "ok" : "senha";
  }
  const recente =
    sessao.metodo === "google" &&
    agora - sessao.entrouEm >= 0 &&
    agora - sessao.entrouEm <= LOGIN_GOOGLE_RECENTE_MS;
  return recente ? "ok" : "google_antigo";
}

/**
 * Grava o documento novo (a identidade já foi conferida), derruba as outras sessões e avisa por
 * e-mail. Devolve a conta atualizada.
 */
export async function trocarDocumento(
  sessao: SessaoAtual,
  documento: string,
  agora = Date.now(),
): Promise<FotografoConta | null> {
  const conta = await trocarDocumentoDoFotografo(sessao.usuario.id, documento, agora);
  if (!conta) return null;
  await encerrarOutrasSessoes(sessao.usuario.id);
  // O aviso não pode desfazer a troca: se falhar, fica no log (o bloqueio de 72 horas vale).
  await avisarTrocaDeDocumento(
    sessao.usuario.email,
    sessao.usuario.nome,
    new Date(agora).toISOString(),
    new Date(agora + BLOQUEIO_SAQUE_APOS_TROCA_MS).toISOString(),
  ).catch((erro) =>
    console.error(
      "[perfil] falha ao avisar a troca de CPF/CNPJ",
      erro instanceof Error ? erro.name : "desconhecido",
    ),
  );
  return conta;
}
