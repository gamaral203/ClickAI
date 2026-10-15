import "server-only";

import {
  configuracaoDaMarca,
  contadoresDeHoje,
  contarFotosComPreviaAntiga,
  historicoDaMarca,
  lerConfiguracoesGestao,
  pedirRegeracaoDasPrevias,
  salvarConfiguracaoDaMarca,
  type ConfigMarcaEmVigor,
  type RevisaoDaMarca,
  type Usuario,
} from "@/dados";
import {
  esquemaConfigMarca,
  estimarRegeracao,
  type CampoConfigMarca,
  type EstimativaRegeracao,
} from "@/lib/protecao-previas";

import { contadorDeBloqueio } from "./limites";
import { regerarPrevias, type ResultadoRegeracao } from "./regerar-previas";

/** Regras contra a raspagem das prévias, mostradas na tela com os bloqueios do dia. */
const REGRAS_DE_RASPAGEM = ["galeria_ip", "foto_ip", "busca_numero_ip"] as const;

// Proteção das prévias na gestão (/admin/marca-dagua; docs/arquitetura.md, "Prévia e marca
// d'água"). Toda função recebe o gestor já conferido (exigirGestor na página ou na ação) e
// confere de novo o papel aqui: nada passa sem ser admin.

function exigirAdmin(usuario: Pick<Usuario, "papel">) {
  if (usuario.papel !== "admin") throw new Error("Só gestores mudam a proteção das prévias");
}

export type SituacaoDaProtecao = {
  config: ConfigMarcaEmVigor;
  historico: RevisaoDaMarca[];
  /** Fotos com prévia de outra revisão ou versão (as que a regeração refaria). */
  foraDaConfiguracao: number;
  estimativa: EstimativaRegeracao;
  /** Cotação do dólar em centavos de real (Painel de uso), para a estimativa em reais. */
  cotacaoCentavos: number | null;
  /** Acessos bloqueados hoje pelos limites contra raspagem (só contagens, sem quem). */
  bloqueiosHoje: Record<(typeof REGRAS_DE_RASPAGEM)[number], number>;
};

export async function situacaoDaProtecao(
  gestor: Pick<Usuario, "papel">,
): Promise<SituacaoDaProtecao> {
  exigirAdmin(gestor);
  const config = await configuracaoDaMarca();
  const [historico, foraDaConfiguracao, gestao, contadores] = await Promise.all([
    historicoDaMarca(10),
    contarFotosComPreviaAntiga({ tipo: "revisao", revisao: config.revisao }),
    lerConfiguracoesGestao(),
    contadoresDeHoje(REGRAS_DE_RASPAGEM.map(contadorDeBloqueio)),
  ]);
  return {
    config,
    historico,
    foraDaConfiguracao,
    estimativa: estimarRegeracao(foraDaConfiguracao),
    cotacaoCentavos: gestao.cotacaoUsdCentavos,
    bloqueiosHoje: {
      galeria_ip: contadores[contadorDeBloqueio("galeria_ip")] ?? 0,
      foto_ip: contadores[contadorDeBloqueio("foto_ip")] ?? 0,
      busca_numero_ip: contadores[contadorDeBloqueio("busca_numero_ip")] ?? 0,
    },
  };
}

export type ResultadoSalvarMarca =
  { ok: true; revisao: number } | { erros: Partial<Record<CampoConfigMarca | "geral", string>> };

/**
 * Valida (limites no servidor: fora deles é recusado, nunca ajustado em silêncio) e grava uma
 * revisão nova em nome do gestor. As prévias já enviadas continuam como estão até o gestor
 * pedir a regeração; as fotos novas já saem com esta revisão.
 */
export async function salvarProtecao(
  gestor: Pick<Usuario, "id" | "papel">,
  entrada: unknown,
): Promise<ResultadoSalvarMarca> {
  exigirAdmin(gestor);
  const r = esquemaConfigMarca.safeParse(entrada);
  if (!r.success) {
    const erros: Partial<Record<CampoConfigMarca | "geral", string>> = {};
    for (const p of r.error.issues) {
      const campo = (p.path[0] as CampoConfigMarca | undefined) ?? "geral";
      erros[campo] ??= p.message;
    }
    return { erros };
  }
  const revisao = await salvarConfiguracaoDaMarca(r.data, gestor.id);
  // Só ids e números: nada de dado pessoal no log.
  console.info(`[marca] revisão ${revisao} da configuração salva pelo gestor ${gestor.id}`);
  return { ok: true, revisao };
}

/**
 * O gestor confirmou regerar as prévias já enviadas com a revisão `revisao` (a que ele via na
 * tela, com a contagem e a estimativa). Se outro gestor salvou uma revisão nova no meio, recusa.
 */
export async function confirmarRegeracao(
  gestor: Pick<Usuario, "id" | "papel">,
  revisao: number,
): Promise<{ ok: true } | { erro: string }> {
  exigirAdmin(gestor);
  if (!Number.isInteger(revisao) || revisao < 0) return { erro: "Revisão inválida." };
  if (!(await pedirRegeracaoDasPrevias(revisao, gestor.id))) {
    return { erro: "A configuração mudou desde que a página abriu. Atualize e confira de novo." };
  }
  console.info(`[marca] regeração das prévias pedida para a revisão ${revisao} (${gestor.id})`);
  return { ok: true };
}

/**
 * Um lote da regeração pedida, dentro do prazo (a tela chama de novo até `restantes` chegar a
 * 0; com a página fechada, o job de revisão continua sozinho). Sem pedido em vigor, não faz
 * nada: o gestor confirma primeiro.
 */
export async function regerarLoteDoGestor(
  gestor: Pick<Usuario, "papel">,
  prazoMs: number,
): Promise<ResultadoRegeracao & { pedida: boolean }> {
  exigirAdmin(gestor);
  const config = await configuracaoDaMarca();
  if (!config.regeracaoPedida) {
    const restantes = await contarFotosComPreviaAntiga({
      tipo: "revisao",
      revisao: config.revisao,
    });
    return { regeradas: 0, falhas: 0, restantes, pedida: false };
  }
  return { ...(await regerarPrevias({ limite: 200, prazoMs })), pedida: true };
}
