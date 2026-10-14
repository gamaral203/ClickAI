// Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): o estado fica no banco
// (`modo_manutencao`, uma linha por mudança) e é lido por quase toda página do site. Por isso a
// leitura passa por um cache em memória de poucos segundos, e o liga/desliga troca o cache na
// hora na instância que gravou.
//
// Por que não "use cache" + cacheTag: o obterBanco espera a requisição (connection()) antes de
// tocar no banco, e o Next não aceita connection() dentro de um "use cache". Além disso, na
// Vercel o "use cache" padrão também fica na memória de cada instância, e o updateTag não chega
// às outras: o resultado seria o mesmo deste cache, com mais peças.

import "server-only";

import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { iso } from "./mapas";

/**
 * Quanto tempo a leitura vale na memória de cada instância. Na instância que liga ou desliga, a
 * mudança vale na hora; nas outras, em até este tempo.
 */
export const VALIDADE_CACHE_MANUTENCAO_MS = 10_000;

/** Tamanho máximo do recado do gestor para o público. */
export const MAXIMO_MENSAGEM_MANUTENCAO = 200;

export type SituacaoManutencao = {
  ativa: boolean;
  /** Recado do gestor para o público, se houver. */
  mensagem: string | null;
  /** Quando o estado atual começou (ISO), ou `null` se nunca foi ligada. */
  desde: string | null;
  /** Nome de quem fez a última mudança, se a conta ainda existir. */
  por: string | null;
};

export const MANUTENCAO_DESLIGADA: SituacaoManutencao = {
  ativa: false,
  mensagem: null,
  desde: null,
  por: null,
};

/** Estado atual direto do banco (sem cache): a linha mais recente. */
export async function lerManutencaoDoBanco(): Promise<SituacaoManutencao> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      ativa: t.modoManutencao.ativa,
      mensagem: t.modoManutencao.mensagem,
      alteradaEm: t.modoManutencao.alteradaEm,
      nome: t.usuarios.nome,
    })
    .from(t.modoManutencao)
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.modoManutencao.alteradaPor))
    .orderBy(desc(t.modoManutencao.alteradaEm))
    .limit(1);
  if (!linha) return MANUTENCAO_DESLIGADA;
  return {
    ativa: linha.ativa,
    mensagem: linha.ativa ? linha.mensagem : null,
    desde: iso(linha.alteradaEm),
    por: linha.nome ?? null,
  };
}

type Lembrado = { situacao: SituacaoManutencao; ate: number };

const memoria = globalThis as typeof globalThis & {
  __clicouaiManutencao?: Lembrado;
  __clicouaiManutencaoLendo?: Promise<SituacaoManutencao>;
  /** Sobe a cada gravação: uma leitura que começou antes não sobrescreve o estado novo. */
  __clicouaiManutencaoVersao?: number;
};

function lembrar(situacao: SituacaoManutencao) {
  memoria.__clicouaiManutencao = { situacao, ate: Date.now() + VALIDADE_CACHE_MANUTENCAO_MS };
}

/** Esquece o estado lembrado (testes; a gravação já troca o cache sozinha). */
export function esquecerManutencao() {
  memoria.__clicouaiManutencao = undefined;
  memoria.__clicouaiManutencaoLendo = undefined;
  memoria.__clicouaiManutencaoVersao = (memoria.__clicouaiManutencaoVersao ?? 0) + 1;
}

/**
 * Situação do modo de manutenção, do cache (no máximo VALIDADE_CACHE_MANUTENCAO_MS). Se o banco
 * falhar, considera DESLIGADA: o site não pode cair por causa do interruptor. A falha vai para o
 * log (e para o Sentry) e não fica no cache: a próxima leitura tenta o banco de novo.
 */
export async function situacaoDaManutencao(): Promise<SituacaoManutencao> {
  // Com Cache Components, o relógio só pode ser lido depois de esperar a requisição. Fora de uma
  // requisição do Next (testes, scripts), connection() não se aplica.
  try {
    await connection();
  } catch {
    // Fora de uma requisição do Next.
  }
  const lembrado = memoria.__clicouaiManutencao;
  if (lembrado && lembrado.ate > Date.now()) return lembrado.situacao;
  // Várias páginas ao mesmo tempo com o cache vencido: uma consulta só.
  if (!memoria.__clicouaiManutencaoLendo) {
    const versao = memoria.__clicouaiManutencaoVersao ?? 0;
    const leitura = lerManutencaoDoBanco().then((situacao) => {
      if ((memoria.__clicouaiManutencaoVersao ?? 0) === versao) lembrar(situacao);
      return situacao;
    });
    memoria.__clicouaiManutencaoLendo = leitura;
    void leitura
      .finally(() => {
        if (memoria.__clicouaiManutencaoLendo === leitura) {
          memoria.__clicouaiManutencaoLendo = undefined;
        }
      })
      .catch(() => {});
  }
  try {
    return await memoria.__clicouaiManutencaoLendo;
  } catch (erro) {
    console.error("[manutencao] falha ao ler o estado; seguindo com a manutenção desligada", erro);
    return MANUTENCAO_DESLIGADA;
  }
}

/** Grava a mudança (uma linha nova, com quem e quando) e devolve o estado gravado. */
export async function gravarManutencao(dados: {
  ativa: boolean;
  mensagem: string | null;
  gestorId: string;
}): Promise<SituacaoManutencao> {
  const banco = await obterBanco();
  await banco.insert(t.modoManutencao).values({
    ativa: dados.ativa,
    mensagem: dados.ativa ? dados.mensagem : null,
    alteradaPor: dados.gestorId,
  });
  const situacao = await lerManutencaoDoBanco();
  // Nesta instância, a mudança vale na hora (e leituras que começaram antes não a desfazem).
  esquecerManutencao();
  lembrar(situacao);
  return situacao;
}
