import "server-only";

import {
  ativarMfa,
  consumirCodigoRecuperacao,
  consumirPassoMfa,
  desligarMfa,
  salvarSegredoPendente,
  segredoMfa,
  trocarCodigosRecuperacao,
  type Usuario,
} from "@/dados";
import {
  cifrarSegredo,
  decifrarSegredo,
  enderecoDoTotp,
  gerarCodigosRecuperacao,
  hashCodigoRecuperacao,
  normalizarCodigoTotp,
  novoSegredoTotp,
  passoDoCodigo,
  segredoParaDigitar,
} from "@/lib/mfa";
import { gerarQrCode } from "@/lib/qrcode";

import { limiteAtingido, zerarTentativas } from "./limites";

// Verificação em duas etapas (docs/seguranca.md, item 3). Opcional para fotógrafo e gestor, ligada
// em Perfil e recebimento. Quando ligada, pede o código:
//   - no login com senha e no login com o Google (src/servicos/sessao.ts, /entrar/codigo);
//   - na troca do CPF/CNPJ (que define a chave Pix) e em cada saque.
// Aceita o código de 6 dígitos do app (cada um uma vez só) ou um código de recuperação (cada um
// uma vez só). Todas as conferências contam no limite `mfa_usuario` (src/servicos/limites.ts).

export type ResultadoCodigo = "ok" | "invalido" | "bloqueado";

async function codigoConfere(usuarioId: string, texto: string, agora: number) {
  const registro = await segredoMfa(usuarioId);
  if (!registro?.ativadoEm) return false;
  if (normalizarCodigoTotp(texto)) {
    const segredo = decifrarSegredo(registro.segredo);
    if (!segredo) return false;
    const passo = passoDoCodigo(segredo, texto, agora);
    // O mesmo código não vale duas vezes (alguém olhando a tela não reaproveita).
    return passo !== null && (await consumirPassoMfa(usuarioId, passo));
  }
  const hash = hashCodigoRecuperacao(texto);
  return hash !== null && (await consumirCodigoRecuperacao(usuarioId, hash));
}

/**
 * Confere o código de quem tem a verificação ligada. Conta a tentativa antes de conferir; o
 * código certo zera a contagem.
 */
export async function conferirCodigoMfa(
  usuarioId: string,
  texto: string,
  agora = Date.now(),
): Promise<ResultadoCodigo> {
  if (await limiteAtingido("mfa_usuario", usuarioId)) return "bloqueado";
  if (!(await codigoConfere(usuarioId, texto.slice(0, 40), agora))) return "invalido";
  await zerarTentativas("mfa_usuario", usuarioId);
  return "ok";
}

/**
 * Para ações sensíveis (saque, troca de CPF/CNPJ): passa direto se a verificação está
 * desligada; se ligada, exige o código.
 */
export async function exigirCodigoSeLigado(
  usuario: Pick<Usuario, "id" | "mfaAtivo">,
  texto: unknown,
): Promise<ResultadoCodigo | "faltando"> {
  if (!usuario.mfaAtivo) return "ok";
  if (typeof texto !== "string" || !texto.trim()) return "faltando";
  return conferirCodigoMfa(usuario.id, texto);
}

export const MENSAGENS_CODIGO: Record<Exclude<ResultadoCodigo, "ok"> | "faltando", string> = {
  faltando: "Digite o código do seu app autenticador.",
  invalido: "Código incorreto ou já usado. Confira o app autenticador e tente de novo.",
  bloqueado: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo.",
};

export type CadastroMfa = {
  /** QR Code (PNG em data URL) com o endereço otpauth:// para o app ler. */
  qrCode: string;
  /** O mesmo segredo, em grupos de 4, para digitar no app. */
  segredo: string;
};

/**
 * Começa o cadastro: gera um segredo novo, guarda cifrado (ainda desligado) e devolve o QR
 * Code. `null` se a verificação já está ligada. A identidade já foi conferida pela ação.
 */
export async function iniciarCadastroMfa(
  usuario: Pick<Usuario, "id" | "email">,
): Promise<CadastroMfa | null> {
  const segredo = novoSegredoTotp();
  if (!(await salvarSegredoPendente(usuario.id, cifrarSegredo(segredo)))) return null;
  const { pngDataUrl } = await gerarQrCode(enderecoDoTotp(segredo, usuario.email));
  return { qrCode: pngDataUrl, segredo: segredoParaDigitar(segredo) };
}

export type ResultadoAtivacao =
  | { ok: true; codigos: string[] }
  | { ok: false; motivo: "invalido" | "bloqueado" | "sem_cadastro" };

/**
 * Confirma o cadastro com o primeiro código do app: liga a verificação e devolve os códigos de
 * recuperação, mostrados uma vez só (no banco fica só o hash).
 */
export async function confirmarCadastroMfa(
  usuarioId: string,
  texto: string,
  agora = Date.now(),
): Promise<ResultadoAtivacao> {
  if (await limiteAtingido("mfa_usuario", usuarioId)) return { ok: false, motivo: "bloqueado" };
  const registro = await segredoMfa(usuarioId);
  if (!registro || registro.ativadoEm) return { ok: false, motivo: "sem_cadastro" };
  const segredo = decifrarSegredo(registro.segredo);
  if (!segredo) return { ok: false, motivo: "sem_cadastro" };
  const passo = passoDoCodigo(segredo, texto.slice(0, 40), agora);
  if (passo === null) return { ok: false, motivo: "invalido" };

  const codigos = gerarCodigosRecuperacao();
  const hashes = codigos.map((c) => hashCodigoRecuperacao(c)!);
  if (!(await ativarMfa(usuarioId, passo, hashes))) return { ok: false, motivo: "sem_cadastro" };
  await zerarTentativas("mfa_usuario", usuarioId);
  return { ok: true, codigos };
}

/** Desliga a verificação, com um código válido (do app ou de recuperação). */
export async function desligarMfaComCodigo(
  usuarioId: string,
  texto: string,
): Promise<ResultadoCodigo> {
  const resultado = await conferirCodigoMfa(usuarioId, texto);
  if (resultado === "ok") await desligarMfa(usuarioId);
  return resultado;
}

/** Gera códigos de recuperação novos (os antigos deixam de valer), com um código válido. */
export async function novosCodigosRecuperacao(
  usuarioId: string,
  texto: string,
): Promise<{ ok: true; codigos: string[] } | { ok: false; motivo: "invalido" | "bloqueado" }> {
  const resultado = await conferirCodigoMfa(usuarioId, texto);
  if (resultado !== "ok") return { ok: false, motivo: resultado };
  const codigos = gerarCodigosRecuperacao();
  await trocarCodigosRecuperacao(
    usuarioId,
    codigos.map((c) => hashCodigoRecuperacao(c)!),
  );
  return { ok: true, codigos };
}
