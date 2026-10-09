import "server-only";

import { buscarUsuario, buscarUsuarioParaLogin, definirSenhaDoUsuario } from "@/dados";
import { emailEhGestorDeAmbiente } from "@/dados/exemplo/gestores";
import { gerarHashSenha, senhaConfere } from "@/lib/senha";

import { loginBloqueado } from "./limites";
import { avisarTrocaDeSenha } from "./mensagens";
import { exigirCodigoSeLigado } from "./mfa";
import { encerrarOutrasSessoes, type SessaoAtual } from "./sessao";
import { LOGIN_GOOGLE_RECENTE_MS } from "./troca-documento";

// Troca de senha do usuário logado (/conta/seguranca), para cliente, fotógrafo e gestor:
//   - pede a senha atual, com o mesmo limite de tentativas do login (por e-mail e por IP);
//   - com a verificação em duas etapas ligada, pede também o código do app;
//   - a senha nova segue a regra do cadastro e precisa ser diferente da atual;
//   - grava só o hash, derruba as outras sessões (a versão da sessão inclui o hash) e mantém esta
//     com um cookie novo;
//   - avisa por e-mail, sem a senha.
// Conta só com o Google pode criar uma senha, se entrou com o Google há menos de 10 minutos
// (como na troca de CPF/CNPJ). Gestores de GESTORES não trocam por aqui: a senha vem da variável
// e voltaria a antiga no próximo deploy.

/** Como a conta entra, para a tela saber o que mostrar. */
export type SituacaoDaSenha = "com_senha" | "so_google" | "gestor_ambiente";

export async function situacaoDaSenha(
  usuario: Pick<SessaoAtual["usuario"], "email">,
): Promise<SituacaoDaSenha> {
  if (emailEhGestorDeAmbiente(usuario.email)) return "gestor_ambiente";
  const interno = await buscarUsuarioParaLogin(usuario.email);
  return interno?.senhaHash ? "com_senha" : "so_google";
}

export type MotivoRecusaSenha =
  | "senha"
  | "bloqueado"
  | "igual"
  | "google_antigo"
  | "gestor_ambiente"
  | "codigo_faltando"
  | "codigo_invalido"
  | "codigo_bloqueado"
  | "mudou";

export type ResultadoTrocaSenha =
  { ok: true; criada: boolean } | { ok: false; motivo: MotivoRecusaSenha };

/**
 * Troca (ou cria) a senha do usuário da sessão. A senha nova já passou pela regra do cadastro
 * (src/lib/regras-senha.ts) na ação; aqui ficam as conferências de identidade e a gravação.
 */
export async function trocarSenha(
  sessao: SessaoAtual,
  dados: { senhaAtual?: string | null; novaSenha: string; codigoMfa?: unknown },
  agora = Date.now(),
): Promise<ResultadoTrocaSenha> {
  const { usuario } = sessao;
  if (emailEhGestorDeAmbiente(usuario.email)) return { ok: false, motivo: "gestor_ambiente" };

  const interno = await buscarUsuarioParaLogin(usuario.email);
  if (!interno || interno.id !== usuario.id || interno.excluidoEm) {
    return { ok: false, motivo: "senha" };
  }

  const hashAnterior = interno.senhaHash;
  if (hashAnterior) {
    // Mesmo limite do login: quem roubou só o cookie não testa senhas por aqui.
    if (await loginBloqueado(interno.email)) return { ok: false, motivo: "bloqueado" };
    if (!dados.senhaAtual || !senhaConfere(dados.senhaAtual, hashAnterior)) {
      return { ok: false, motivo: "senha" };
    }
    if (senhaConfere(dados.novaSenha, hashAnterior)) return { ok: false, motivo: "igual" };
  } else {
    // Sem senha: só o Google prova quem é, e precisa ser um login recente.
    const recente =
      sessao.metodo === "google" &&
      agora - sessao.entrouEm >= 0 &&
      agora - sessao.entrouEm <= LOGIN_GOOGLE_RECENTE_MS;
    if (!recente) return { ok: false, motivo: "google_antigo" };
  }

  // O estado do MFA vem do banco, não da sessão lida no começo da requisição.
  const atualizado = await buscarUsuario(usuario.id);
  if (!atualizado) return { ok: false, motivo: "senha" };
  const codigo = await exigirCodigoSeLigado(atualizado, dados.codigoMfa);
  if (codigo === "faltando") return { ok: false, motivo: "codigo_faltando" };
  if (codigo === "invalido") return { ok: false, motivo: "codigo_invalido" };
  if (codigo === "bloqueado") return { ok: false, motivo: "codigo_bloqueado" };

  if (!(await definirSenhaDoUsuario(usuario.id, gerarHashSenha(dados.novaSenha), hashAnterior))) {
    // A senha mudou entre a conferência e a gravação (outra troca ao mesmo tempo).
    return { ok: false, motivo: "mudou" };
  }
  // O hash novo já derrubou todos os cookies, inclusive este: emite um novo para esta sessão.
  await encerrarOutrasSessoes(usuario.id, sessao);

  const criada = hashAnterior === null;
  // O aviso não pode desfazer a troca: se falhar, fica no log (sem a senha nem o e-mail).
  await avisarTrocaDeSenha(
    usuario.email,
    usuario.nome,
    new Date(agora).toISOString(),
    criada,
  ).catch((erro) =>
    console.error(
      "[seguranca] falha ao avisar a troca de senha",
      erro instanceof Error ? erro.name : "desconhecido",
    ),
  );
  return { ok: true, criada };
}
