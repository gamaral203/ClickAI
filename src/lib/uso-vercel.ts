// Gasto da Vercel no Painel de uso (/admin/uso): o consumo do ciclo atual, por item (Fluid Active
// CPU, Fast Origin Transfer, Function Storage, Build CPU Minutes…), o total, o crédito de uso
// incluso no Pro (US$ 20 por ciclo) e o que passou dele (on-demand).
//
// API oficial de cobrança da Vercel: GET https://api.vercel.com/v1/billing/charges?from&to
// (https://vercel.com/docs/rest-api/billing/list-focus-billing-charges), que devolve as
// cobranças no formato FOCUS v1.3, uma por linha (JSONL), com granularidade de 1 dia.
//
// Token próprio, só no servidor: VERCEL_API_TOKEN (escopo do time; a Vercel não tem token só de
// leitura) e VERCEL_TEAM_ID quando o token é de conta inteira (instrucoes/deploy.md). Sem o
// token, não chama a Vercel e o quadro diz "não configurado". O token nunca vai para o log nem
// para a resposta: o log mostra só o status HTTP ou o nome do erro.

import "server-only";

import { cacheLife } from "next/cache";

const API = "https://api.vercel.com/v1/billing/charges";
/** Uma Vercel lenta não pode prender o painel: o quadro mostra a falha e o resto segue. */
const TEMPO_LIMITE_MS = 8_000;
/** Resposta maior que isso não é lida (um ciclo do time cabe com folga). */
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

/** Crédito de uso incluso no plano Pro, por ciclo, em centavos de dólar (US$ 20). */
export const CREDITO_INCLUSO_PRO_CENTAVOS = 2_000;

export type ItemVercel = {
  /** Nome do produto na Vercel (ServiceName), ex.: "Fluid Active CPU". */
  nome: string;
  custoCentavos: number;
  /** Quantidade consumida no ciclo e a unidade (quando a Vercel informa). */
  quantidade: number | null;
  unidade: string | null;
};

export type CobrancasVercel = {
  /** Itens de uso (ChargeCategory "Usage"), o mais caro primeiro. */
  itens: ItemVercel[];
  /** Soma dos itens de uso, antes do crédito incluso. */
  usoCentavos: number;
  /** Valores fixos (ChargeCategory "Purchase"), como a mensalidade do Pro. */
  fixoCentavos: number;
  /** Créditos e ajustes que a Vercel lançou (normalmente negativos). */
  creditosEAjustesCentavos: number;
  impostosCentavos: number;
  /** Linhas que não deu para ler (sem valor numérico, moeda diferente de USD ou JSON inválido). */
  ignoradas: number;
};

export type ResumoVercel = CobrancasVercel & {
  creditoInclusoCentavos: number;
  /** Quanto do crédito incluso o uso já consumiu (até o crédito). */
  creditoUsadoCentavos: number;
  /** Uso acima do crédito incluso (on-demand). */
  excedenteCentavos: number;
};

export type LeituraVercel =
  | { estado: "nao-configurado" }
  | { estado: "falha"; erro: string; lidoEm: string }
  | ({ estado: "ok"; lidoEm: string; de: string; ate: string } & ResumoVercel);

/** Valor da linha em milionésimos de dólar (somar inteiros evita erro de arredondamento). */
function microdolares(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
}

const paraCentavos = (micro: number) => Math.round(micro / 10_000);

function quantidade(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Lê o JSONL de /v1/billing/charges. Usa BilledCost (o valor que vai para a fatura) e agrupa o
 * uso por ServiceName. Nunca lança: linha que não dá para ler entra em `ignoradas`.
 */
export function interpretarCobrancasVercel(jsonl: string): CobrancasVercel {
  const porItem = new Map<
    string,
    { micro: number; quantidade: number | null; unidade: string | null }
  >();
  let fixo = 0;
  let creditos = 0;
  let impostos = 0;
  let ignoradas = 0;

  for (const bruta of jsonl.split("\n")) {
    const texto = bruta.trim();
    if (!texto) continue;
    let linha: Record<string, unknown>;
    try {
      const lido: unknown = JSON.parse(texto);
      if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error();
      linha = lido as Record<string, unknown>;
    } catch {
      ignoradas++;
      continue;
    }
    const micro = microdolares(linha.BilledCost);
    const moeda = linha.BillingCurrency ?? "USD";
    if (micro === null || moeda !== "USD") {
      ignoradas++;
      continue;
    }
    switch (linha.ChargeCategory) {
      case "Usage": {
        const nome =
          typeof linha.ServiceName === "string" && linha.ServiceName.trim()
            ? linha.ServiceName.trim().slice(0, 80)
            : typeof linha.SkuId === "string"
              ? linha.SkuId.slice(0, 80)
              : "Outros";
        const atual = porItem.get(nome) ?? { micro: 0, quantidade: null, unidade: null };
        atual.micro += micro;
        const q = quantidade(linha.ConsumedQuantity);
        const unidade =
          typeof linha.ConsumedUnit === "string" ? linha.ConsumedUnit.slice(0, 40) : null;
        // Só soma a quantidade quando a unidade é a mesma; unidades diferentes não se misturam.
        if (q !== null && unidade && (atual.unidade === null || atual.unidade === unidade)) {
          atual.quantidade = (atual.quantidade ?? 0) + q;
          atual.unidade = unidade;
        }
        porItem.set(nome, atual);
        break;
      }
      case "Purchase":
        fixo += micro;
        break;
      case "Credit":
      case "Adjustment":
        creditos += micro;
        break;
      case "Tax":
        impostos += micro;
        break;
      default:
        ignoradas++;
    }
  }

  const itens = [...porItem.entries()]
    .map(([nome, i]) => ({
      nome,
      custoCentavos: paraCentavos(i.micro),
      quantidade: i.quantidade,
      unidade: i.unidade,
    }))
    .sort((a, b) => b.custoCentavos - a.custoCentavos || a.nome.localeCompare(b.nome));
  const usoMicro = [...porItem.values()].reduce((s, i) => s + i.micro, 0);
  return {
    itens,
    usoCentavos: paraCentavos(usoMicro),
    fixoCentavos: paraCentavos(fixo),
    creditosEAjustesCentavos: paraCentavos(creditos),
    impostosCentavos: paraCentavos(impostos),
    ignoradas,
  };
}

/** Uso contra o crédito incluso do Pro: quanto do crédito já foi e o que passou (on-demand). */
export function resumirUsoVercel(
  c: CobrancasVercel,
  creditoInclusoCentavos = CREDITO_INCLUSO_PRO_CENTAVOS,
): ResumoVercel {
  const uso = Math.max(0, c.usoCentavos);
  return {
    ...c,
    creditoInclusoCentavos,
    creditoUsadoCentavos: Math.min(uso, creditoInclusoCentavos),
    excedenteCentavos: Math.max(0, uso - creditoInclusoCentavos),
  };
}

/**
 * Início do ciclo atual (UTC): o dia `VERCEL_DIA_DO_CICLO` (1 a 28; padrão 1) deste mês, ou do
 * mês passado se ainda não chegou. O fim é o começo do dia seguinte (exclusivo), para pegar hoje.
 */
export function cicloAtualVercel(agora: number = Date.now(), diaDoCiclo = lerDiaDoCiclo()) {
  const d = new Date(agora);
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth();
  const inicio =
    d.getUTCDate() >= diaDoCiclo
      ? Date.UTC(ano, mes, diaDoCiclo)
      : Date.UTC(ano, mes - 1, diaDoCiclo);
  const fim = Date.UTC(ano, mes, d.getUTCDate() + 1);
  return { de: new Date(inicio).toISOString(), ate: new Date(fim).toISOString() };
}

function lerDiaDoCiclo() {
  const n = Number(process.env.VERCEL_DIA_DO_CICLO);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : 1;
}

/** Id do time só com letras, números, "_" e "-" (vai na URL). */
const TIME_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/** Lê o ciclo atual na Vercel agora, sem cache. Nunca lança: a falha vira um estado. */
export async function consultarUsoVercel(agora: number = Date.now()): Promise<LeituraVercel> {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  if (!token) return { estado: "nao-configurado" };
  const lidoEm = new Date(agora).toISOString();
  const { de, ate } = cicloAtualVercel(agora);
  const url = new URL(API);
  url.searchParams.set("from", de);
  url.searchParams.set("to", ate);
  const time = process.env.VERCEL_TEAM_ID?.trim();
  if (time) {
    if (!TIME_VALIDO.test(time))
      return { estado: "falha", erro: "VERCEL_TEAM_ID inválido", lidoEm };
    url.searchParams.set("teamId", time);
  }
  try {
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/jsonl" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) {
      console.error("[uso-vercel] a Vercel recusou a leitura", resposta.status);
      return { estado: "falha", erro: `HTTP ${resposta.status}`, lidoEm };
    }
    const tamanho = Number(resposta.headers.get("content-length"));
    if (Number.isFinite(tamanho) && tamanho > TAMANHO_MAXIMO) {
      return { estado: "falha", erro: "Resposta grande demais", lidoEm };
    }
    const texto = await resposta.text();
    if (texto.length > TAMANHO_MAXIMO) {
      return { estado: "falha", erro: "Resposta grande demais", lidoEm };
    }
    return {
      estado: "ok",
      lidoEm,
      de,
      ate,
      ...resumirUsoVercel(interpretarCobrancasVercel(texto)),
    };
  } catch (erro) {
    const nome =
      erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError")
        ? "Tempo esgotado"
        : erro instanceof Error
          ? erro.name
          : "Erro";
    console.error("[uso-vercel] falha ao ler o uso", nome);
    return { estado: "falha", erro: nome, lidoEm };
  }
}

/**
 * A leitura com cache (Cache Components, `use cache`): 5 minutos quando dá certo (a Vercel
 * atualiza o uso ao longo do dia); 1 minuto quando falha, para um token novo valer logo.
 */
export async function lerUsoVercel(): Promise<LeituraVercel> {
  "use cache";
  const leitura = await consultarUsoVercel();
  if (leitura.estado === "falha") cacheLife("minutes");
  else cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  return leitura;
}
