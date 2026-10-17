import { z } from "zod";

import { estadoDaLiberacao, type EstadoLiberacao } from "./liberacao";
import { idsDaPastaComSubpastas } from "./pastas";

// Filtros da grade de fotos do painel do evento (docs/arquitetura.md, "Pastas e subpastas"):
// liberação, pasta e dia, combináveis e guardados na URL. As mesmas regras valem na tela (que
// conta e mostra) e no servidor (que reavalia o filtro na hora de mover "todas do filtro"), por
// isso ficam aqui, puras. O dia é o de Brasília (UTC-3, sem horário de verão desde 2019).

export const PASTA_TODAS = "todas";
export const SEM_PASTA = "sem";
export const DIA_TODOS = "todos";
/** Fotos sem data de captura no EXIF (só no dia por captura). */
export const SEM_DATA = "sem-data";

const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const filtroDoPainelSchema = z
  .object({
    liberacao: z.enum(["todas", "liberada", "agendada", "manual"]).default("todas"),
    /** "todas", "sem" (sem pasta) ou o id da pasta (a de nível 1 inclui as subpastas). */
    pasta: z.union([z.literal(PASTA_TODAS), z.literal(SEM_PASTA), z.uuid()]).default(PASTA_TODAS),
    /** Qual data define o dia: a da captura (EXIF) ou a do envio. */
    base: z.enum(["captura", "envio"]).default("captura"),
    /** "todos", "sem-data" (só na captura) ou "AAAA-MM-DD" (dia de Brasília). */
    dia: z
      .string()
      .refine(
        (d) => d === DIA_TODOS || d === SEM_DATA || (DIA.test(d) && intervaloDoDia(d) !== null),
      )
      .default(DIA_TODOS),
  })
  .refine((f) => !(f.dia === SEM_DATA && f.base === "envio"), {
    message: "Toda foto tem data de envio.",
  });

export type FiltroDoPainel = z.infer<typeof filtroDoPainelSchema>;

export const FILTRO_PADRAO: FiltroDoPainel = {
  liberacao: "todas",
  pasta: PASTA_TODAS,
  base: "captura",
  dia: DIA_TODOS,
};

/** Instante → "AAAA-MM-DD" do dia em Brasília (23:30 de Brasília ainda é o mesmo dia). */
export function diaEmBrasilia(instante: string | Date): string {
  const ms = new Date(instante).getTime() - OFFSET_BRASILIA_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Dia de Brasília → [início, fim) em UTC. `null` para data inválida (ex.: 2026-02-30). */
export function intervaloDoDia(dia: string): { inicio: Date; fim: Date } | null {
  if (!DIA.test(dia)) return null;
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  if (Number.isNaN(inicio.getTime()) || diaEmBrasilia(inicio) !== dia) return null;
  return { inicio, fim: new Date(inicio.getTime() + UM_DIA_MS) };
}

/** "2026-10-16" → "16/10" (ou "16/10/2025" fora do ano de referência). */
export function rotuloDoDia(dia: string, anoAtual?: number): string {
  const [ano, mes, d] = dia.split("-");
  return anoAtual !== undefined && Number(ano) !== anoAtual ? `${d}/${mes}/${ano}` : `${d}/${mes}`;
}

export type ItemFiltravel = {
  id: string;
  pastaId: string | null;
  liberarEm: string | null;
  criadoEm: string;
  capturadaEm: string | null;
};

/** O dia do item conforme a base, ou `null` (captura sem EXIF). */
export function diaDoItem(item: ItemFiltravel, base: FiltroDoPainel["base"]): string | null {
  const instante = base === "envio" ? item.criadoEm : item.capturadaEm;
  return instante ? diaEmBrasilia(instante) : null;
}

/**
 * Filtra os itens como o servidor filtra ao mover (`condicoesDoFiltro` em src/dados/pastas.ts).
 * `pastas` é a árvore do evento, para a pasta de nível 1 incluir as subpastas.
 */
export function filtrarItensDoPainel<T extends ItemFiltravel>(
  itens: T[],
  filtro: FiltroDoPainel,
  pastas: { id: string; pastaPaiId: string | null }[],
  agora: number,
): T[] {
  const daPasta =
    filtro.pasta !== PASTA_TODAS && filtro.pasta !== SEM_PASTA
      ? idsDaPastaComSubpastas(filtro.pasta, pastas)
      : null;
  return itens.filter((item) => {
    if (
      filtro.liberacao !== "todas" &&
      estadoDaLiberacao(item.liberarEm, agora) !== (filtro.liberacao as EstadoLiberacao)
    ) {
      return false;
    }
    if (filtro.pasta === SEM_PASTA && item.pastaId !== null) return false;
    if (daPasta && (item.pastaId === null || !daPasta.has(item.pastaId))) return false;
    if (filtro.dia !== DIA_TODOS) {
      const dia = diaDoItem(item, filtro.base);
      if (filtro.dia === SEM_DATA ? dia !== null : dia !== filtro.dia) return false;
    }
    return true;
  });
}

/** Dias com fotos (mais antigo primeiro), com a contagem; "sem-data" no fim, se houver. */
export function diasComFotos(
  itens: ItemFiltravel[],
  base: FiltroDoPainel["base"],
): { dia: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const item of itens) {
    const dia = diaDoItem(item, base) ?? SEM_DATA;
    contagem.set(dia, (contagem.get(dia) ?? 0) + 1);
  }
  const dias = [...contagem.entries()]
    .filter(([dia]) => dia !== SEM_DATA)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, total]) => ({ dia, total }));
  const semData = contagem.get(SEM_DATA);
  return semData ? [...dias, { dia: SEM_DATA, total: semData }] : dias;
}

/** Lê o filtro da URL; valor inválido volta ao padrão daquele campo. */
export function filtroDaUrl(
  parametros: { get(nome: string): string | null },
  basePadrao: FiltroDoPainel["base"],
): FiltroDoPainel {
  const campo = <K extends keyof FiltroDoPainel>(chave: K, nome: string): FiltroDoPainel[K] => {
    const valor = parametros.get(nome);
    if (valor === null)
      return chave === "base" ? (basePadrao as FiltroDoPainel[K]) : FILTRO_PADRAO[chave];
    const r = filtroDoPainelSchema.safeParse({
      ...FILTRO_PADRAO,
      base: basePadrao,
      [chave]: valor,
    });
    return r.success
      ? r.data[chave]
      : chave === "base"
        ? (basePadrao as FiltroDoPainel[K])
        : FILTRO_PADRAO[chave];
  };
  const filtro: FiltroDoPainel = {
    liberacao: campo("liberacao", "liberacao"),
    pasta: campo("pasta", "pasta"),
    base: campo("base", "data"),
    dia: campo("dia", "dia"),
  };
  return filtroDoPainelSchema.safeParse(filtro).success ? filtro : { ...filtro, dia: DIA_TODOS };
}

/** Grava o filtro nos parâmetros (sem os valores padrão, para a URL ficar curta). */
export function filtroParaUrl(
  filtro: FiltroDoPainel,
  parametros: URLSearchParams,
  basePadrao: FiltroDoPainel["base"],
): URLSearchParams {
  const p = new URLSearchParams(parametros);
  const definir = (nome: string, valor: string, padrao: string) => {
    if (valor === padrao) p.delete(nome);
    else p.set(nome, valor);
  };
  definir("liberacao", filtro.liberacao, FILTRO_PADRAO.liberacao);
  definir("pasta", filtro.pasta, FILTRO_PADRAO.pasta);
  definir("data", filtro.base, basePadrao);
  definir("dia", filtro.dia, FILTRO_PADRAO.dia);
  return p;
}
