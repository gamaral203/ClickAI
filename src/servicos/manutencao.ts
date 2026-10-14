import "server-only";

import { z } from "zod";

import {
  gravarManutencao,
  MAXIMO_MENSAGEM_MANUTENCAO,
  situacaoDaManutencao,
  type SituacaoManutencao,
  type Usuario,
} from "@/dados";
import {
  bloqueiaNaManutencao,
  caminhoLiberadoNaManutencao,
  ESPERA_MANUTENCAO_S,
  MENSAGEM_MANUTENCAO,
} from "@/lib/manutencao";

import { usuarioAtual } from "./sessao";

// Modo de manutenção no servidor (docs/arquitetura.md, "Modo de manutenção"). Um ponto só para
// as páginas (PortaoManutencao), as Server Actions (recusarSeEmManutencao) e as rotas de API
// (respostaDaManutencao): ninguém repete a regra de quem passa.

/**
 * Com a manutenção ligada, esta pessoa fica de fora? `null` é o visitante. Lê o estado do cache;
 * com a manutenção desligada, nem precisa da sessão.
 */
export async function emManutencaoParaEste(
  usuario: Pick<Usuario, "papel"> | null,
): Promise<boolean> {
  const { ativa } = await situacaoDaManutencao();
  return bloqueiaNaManutencao(ativa, usuario);
}

/**
 * Para as Server Actions do público: a mensagem de recusa se a manutenção está ligada e quem
 * chamou não é gestor, ou `null` para seguir. A sessão só é lida com a manutenção ligada.
 */
export async function recusarSeEmManutencao(): Promise<string | null> {
  const { ativa } = await situacaoDaManutencao();
  if (!ativa) return null;
  return bloqueiaNaManutencao(ativa, await usuarioAtual()) ? MENSAGEM_MANUTENCAO : null;
}

/**
 * Para as rotas de API do público: a resposta 503 (com Retry-After) se a manutenção barra quem
 * chamou, ou `null` para seguir. Caminho da lista de exceções (webhooks, jobs, login) nunca é
 * barrado, mesmo que alguém chame esta função nele.
 */
export async function respostaDaManutencao(request: Request): Promise<Response | null> {
  if (caminhoLiberadoNaManutencao(new URL(request.url).pathname)) return null;
  const mensagem = await recusarSeEmManutencao();
  if (!mensagem) return null;
  return respostaRecusada();
}

/**
 * Para as rotas que não usam a sessão (o plugin do Lightroom entra pela chave de acesso): a
 * resposta 503 se a manutenção barra o dono da chave, ou `null` para seguir.
 */
export async function respostaDaManutencaoPara(
  usuario: Pick<Usuario, "papel">,
): Promise<Response | null> {
  return (await emManutencaoParaEste(usuario)) ? respostaRecusada() : null;
}

function respostaRecusada() {
  return Response.json(
    { erro: MENSAGEM_MANUTENCAO },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": String(ESPERA_MANUTENCAO_S) },
    },
  );
}

const entrada = z.object({
  ativa: z.boolean(),
  mensagem: z
    .string()
    .trim()
    .max(
      MAXIMO_MENSAGEM_MANUTENCAO,
      `A mensagem pode ter até ${MAXIMO_MENSAGEM_MANUTENCAO} caracteres.`,
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});

export type ResultadoManutencao = { ok: true; situacao: SituacaoManutencao } | { erro: string };

/**
 * Liga ou desliga a manutenção. Só gestor (a ação da gestão já passou por `exigirGestor`; a
 * conferência aqui é a segunda trava). Grava quem e quando, e registra no log.
 */
export async function alternarManutencao(
  usuario: Pick<Usuario, "id" | "papel">,
  dados: unknown,
): Promise<ResultadoManutencao> {
  if (usuario.papel !== "admin") return { erro: "Só gestores ligam ou desligam a manutenção." };
  const validacao = entrada.safeParse(dados);
  if (!validacao.success) {
    return { erro: validacao.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const situacao = await gravarManutencao({
    ativa: validacao.data.ativa,
    mensagem: validacao.data.mensagem,
    gestorId: usuario.id,
  });
  console.info(
    `[manutencao] ${situacao.ativa ? "ligada" : "desligada"} pelo gestor ${usuario.id} em ${situacao.desde}`,
  );
  return { ok: true, situacao };
}
