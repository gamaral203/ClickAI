import "server-only";

import {
  definirPastaRaizDrive,
  FINALIDADE_REFRESH_TOKEN_DRIVE,
  lerCredencialDrive,
  type OperacaoDeArmazenamento,
  PASTA_RAIZ_DRIVE,
  registrarErroDrive,
  registrarMetricaArmazenamento,
  registrarUsoDrive,
} from "@/dados/configuracoes";
import {
  type ClienteDrive,
  criarClienteDrive,
  ErroDrive,
  type ObterAccessToken,
  renovarAccessToken,
} from "@/lib/google-drive";
import { ERRO_SEM_ARMAZENAMENTO, r2Configurado } from "@/lib/r2";
import { decifrarSegredo } from "@/lib/segredo-cifrado";

import { criarProvedorDrive } from "./drive";
import { provedorR2 } from "./r2";
import type { ProvedorDeOriginais, ProvedorOriginal, ReferenciaOriginal } from "./tipos";

export type * from "./tipos";

// Escolhe quem guarda o original (docs/arquitetura.md, "Armazenamento"). O R2 vale sempre que
// está configurado. O Drive vale sempre que há uma conta conectada, mesmo com a trava
// `armazenamento_experimental` desligada: quem comprou uma foto gravada no Drive continua
// baixando. A trava (e o evento `hibrido`) decide só onde GRAVAR as próximas fotos.
//
// O access token do Drive fica só na memória do processo, até 1 minuto antes de vencer; o
// refresh token só é decifrado na hora de renovar. Nenhum dos dois vai a log nem ao banco.

export const ERRO_DRIVE_NAO_CONECTADO = "Google Drive não conectado.";

/** Margem para renovar o access token antes de ele vencer. */
const MARGEM_TOKEN_MS = 60_000;
/** O último uso do Drive é gravado no banco no máximo uma vez por minuto por processo. */
const INTERVALO_USO_MS = 60_000;

type TokenEmCache = { cifrado: string; accessToken: string; expiraEm: number };

let tokenEmCache: TokenEmCache | null = null;
let renovacao: { cifrado: string; promessa: Promise<string> } | null = null;
let usoRegistradoEm = 0;

/** Só para os testes: esquece o access token e o último uso registrados. */
export function reiniciarArmazenamento() {
  tokenEmCache = null;
  renovacao = null;
  usoRegistradoEm = 0;
}

/**
 * Access token do Drive, renovado pelo refresh token cifrado quando falta, está para vencer ou
 * o cliente pede (`renovar`, depois de um 401). Renovações ao mesmo tempo viram uma só.
 */
function tokenDoDrive(cifrado: string): ObterAccessToken {
  return async (opcoes) => {
    if (
      !opcoes?.renovar &&
      tokenEmCache?.cifrado === cifrado &&
      tokenEmCache.expiraEm - MARGEM_TOKEN_MS > Date.now()
    ) {
      return tokenEmCache.accessToken;
    }
    if (renovacao?.cifrado === cifrado) return renovacao.promessa;
    tokenEmCache = null;
    const promessa = (async () => {
      const refreshToken = decifrarSegredo(cifrado, FINALIDADE_REFRESH_TOKEN_DRIVE);
      if (!refreshToken) {
        throw new ErroDrive(
          "token_invalido",
          "A autorização guardada do Google Drive não abre (APP_SECRET trocado?); conecte de novo",
        );
      }
      const { accessToken, expiraEm } = await renovarAccessToken(refreshToken);
      tokenEmCache = { cifrado, accessToken, expiraEm: expiraEm.getTime() };
      return accessToken;
    })();
    const atual = { cifrado, promessa };
    renovacao = atual;
    try {
      return await promessa;
    } finally {
      if (renovacao === atual) renovacao = null;
    }
  };
}

/**
 * Roda uma chamada ao Drive: no sucesso, marca o último uso (no máximo uma vez por minuto); no
 * erro do Drive (menos "não encontrado", que é fluxo normal), grava o último erro sem segredo e
 * relança. Token inválido também esquece o access token em cache.
 */
async function vigiarDrive<T>(chamada: () => Promise<T>): Promise<T> {
  try {
    const resultado = await chamada();
    if (Date.now() - usoRegistradoEm > INTERVALO_USO_MS) {
      usoRegistradoEm = Date.now();
      await registrarUsoDrive().catch(() => {});
    }
    return resultado;
  } catch (erro) {
    if (erro instanceof ErroDrive && erro.codigo !== "nao_encontrado") {
      if (erro.codigo === "token_invalido") tokenEmCache = null;
      await registrarErroDrive(erro).catch(() => {});
    }
    throw erro;
  }
}

function vigiado(provedor: ProvedorDeOriginais): ProvedorDeOriginais {
  return {
    nome: provedor.nome,
    gravarOriginal: (args) => vigiarDrive(() => provedor.gravarOriginal(args)),
    lerOriginal: (ref) => vigiarDrive(() => provedor.lerOriginal(ref)),
    lerTrecho: (ref, inicio, fim) => vigiarDrive(() => provedor.lerTrecho(ref, inicio, fim)),
    tamanhoDoOriginal: (ref) => vigiarDrive(() => provedor.tamanhoDoOriginal(ref)),
    abrirFluxo: (ref, range) => vigiarDrive(() => provedor.abrirFluxo(ref, range)),
    removerOriginal: (ref) => vigiarDrive(() => provedor.removerOriginal(ref)),
    entregaParaDownload: (ref, nome, tipo) =>
      vigiarDrive(() => provedor.entregaParaDownload(ref, nome, tipo)),
  };
}

/**
 * Esquece o access token do Drive guardado na memória do processo (ex.: ao desconectar a conta).
 * O próximo uso, se houver outra conta, renova a partir da credencial nova.
 */
export function esquecerAcessoDrive() {
  tokenEmCache = null;
  renovacao = null;
}

/**
 * Cliente do Drive autenticado com a conta conectada (mesmo cache e renovação de token do
 * provedor), para a gestão testar a conexão e ler o espaço usado. Não grava último uso nem
 * último erro: quem chama decide. Sem conta conectada, lança ERRO_DRIVE_NAO_CONECTADO.
 */
export async function clienteDriveConectado(): Promise<ClienteDrive> {
  const credencial = await lerCredencialDrive();
  if (!credencial) throw new Error(ERRO_DRIVE_NAO_CONECTADO);
  return criarClienteDrive(tokenDoDrive(credencial.refreshTokenCifrado), { tentativas: 2 });
}

/**
 * O provedor de originais pelo nome. R2: exige as variáveis `R2_*`. Drive: exige a conta
 * conectada (a pasta `ClicouAI_Storage` é criada na primeira vez e o id fica guardado).
 */
export async function provedorDeOriginais(nome: ProvedorOriginal): Promise<ProvedorDeOriginais> {
  if (nome === "r2") {
    if (!r2Configurado()) throw new Error(ERRO_SEM_ARMAZENAMENTO);
    return provedorR2;
  }
  const credencial = await lerCredencialDrive();
  if (!credencial) throw new Error(ERRO_DRIVE_NAO_CONECTADO);
  const cliente: ClienteDrive = criarClienteDrive(tokenDoDrive(credencial.refreshTokenCifrado));
  let pastaRaizId = credencial.pastaRaizId;
  if (!pastaRaizId) {
    pastaRaizId = await vigiarDrive(() => cliente.garantirPasta(PASTA_RAIZ_DRIVE, null));
    await definirPastaRaizDrive(pastaRaizId);
  }
  return vigiado(criarProvedorDrive({ cliente, pastaRaizId }));
}

/** Onde está o original da foto, ou `null` se ela não tem original (dados de exemplo antigos). */
export function referenciaDaFoto(foto: {
  chaveOriginal: string | null;
  provedorOriginal: ProvedorOriginal;
  driveArquivoId: string | null;
}): ReferenciaOriginal | null {
  if (!foto.chaveOriginal) return null;
  return {
    provedor: foto.provedorOriginal,
    chave: foto.chaveOriginal,
    driveArquivoId: foto.driveArquivoId,
  };
}

/**
 * Mede uma operação com originais e grava em `metricas_armazenamento` (duração, bytes, sucesso
 * e o erro sem segredo). A gravação da métrica nunca derruba a operação: se falhar, é ignorada,
 * e o erro da própria operação é relançado como veio.
 */
export async function medir<T>(
  provedor: ProvedorOriginal,
  operacao: OperacaoDeArmazenamento,
  fn: () => Promise<T>,
  extras: {
    bytes?: number | null | ((resultado: T) => number | null);
    fotoId?: string | null;
    eventoId?: string | null;
  } = {},
): Promise<T> {
  const inicio = performance.now();
  const registrar = async (sucesso: boolean, bytes: number | null, erro?: unknown) => {
    try {
      await registrarMetricaArmazenamento({
        provedor,
        operacao,
        duracaoMs: performance.now() - inicio,
        sucesso,
        bytes,
        erro,
        fotoId: extras.fotoId,
        eventoId: extras.eventoId,
      });
    } catch {
      // A métrica é só telemetria.
    }
  };
  let resultado: T;
  try {
    resultado = await fn();
  } catch (erro) {
    await registrar(false, typeof extras.bytes === "number" ? extras.bytes : null, erro);
    throw erro;
  }
  let bytes: number | null = null;
  try {
    bytes = typeof extras.bytes === "function" ? extras.bytes(resultado) : (extras.bytes ?? null);
  } catch {
    bytes = null;
  }
  await registrar(true, bytes);
  return resultado;
}
