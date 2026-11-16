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
/**
 * Proteção contra resposta absurda. O corpo é lido em streaming e cada linha é somada na hora
 * (o corpo inteiro nunca fica na memória), então o limite fica bem acima do tamanho real de um
 * ciclo: o JSONL tem uma linha por dia, produto, região e projeto e já passa de 8 MB.
 */
export const BYTES_MAXIMOS = 100 * 1024 * 1024;
export const LINHAS_MAXIMAS = 1_000_000;
/** Uma linha FOCUS tem poucos KB; sem "\n" por mais que isso, a resposta é recusada. */
const LINHA_MAXIMA = 256 * 1024;

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
 * Soma as linhas do JSONL de /v1/billing/charges uma a uma, sem guardar o corpo. Usa BilledCost
 * (o valor que vai para a fatura) e agrupa o uso por ServiceName. Nunca lança: linha que não dá
 * para ler entra em `ignoradas`.
 */
export function criarSomaCobrancasVercel() {
  const porItem = new Map<
    string,
    { micro: number; quantidade: number | null; unidade: string | null }
  >();
  let fixo = 0;
  let creditos = 0;
  let impostos = 0;
  let ignoradas = 0;

  function somarLinha(bruta: string) {
    const texto = bruta.trim();
    if (!texto) return;
    let linha: Record<string, unknown>;
    try {
      const lido: unknown = JSON.parse(texto);
      if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error();
      linha = lido as Record<string, unknown>;
    } catch {
      ignoradas++;
      return;
    }
    const micro = microdolares(linha.BilledCost);
    const moeda = linha.BillingCurrency ?? "USD";
    if (micro === null || moeda !== "USD") {
      ignoradas++;
      return;
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

  function resultado(): CobrancasVercel {
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

  return { somarLinha, resultado };
}

/** Lê um JSONL que já está inteiro na memória (pequeno; a leitura da Vercel usa o streaming). */
export function interpretarCobrancasVercel(jsonl: string): CobrancasVercel {
  const soma = criarSomaCobrancasVercel();
  for (const linha of jsonl.split("\n")) soma.somarLinha(linha);
  return soma.resultado();
}

export class RespostaGrandeDemais extends Error {
  override name = "RespostaGrandeDemais";
}

/**
 * Lê o corpo em streaming, linha a linha: a linha partida entre pedaços espera no `resto` até o
 * próximo, e a última sem "\n" entra no fim. Passou dos bytes, das linhas ou do tamanho de uma
 * linha: cancela o leitor e lança RespostaGrandeDemais.
 */
export async function lerCobrancasEmStreaming(
  corpo: ReadableStream<Uint8Array>,
  limites: { bytes: number; linhas: number } = { bytes: BYTES_MAXIMOS, linhas: LINHAS_MAXIMAS },
): Promise<CobrancasVercel> {
  const soma = criarSomaCobrancasVercel();
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  let bytes = 0;
  let linhas = 0;
  const somar = (linha: string) => {
    if (++linhas > limites.linhas) throw new RespostaGrandeDemais();
    soma.somarLinha(linha);
  };
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limites.bytes) throw new RespostaGrandeDemais();
      resto += decodificador.decode(value, { stream: true });
      let inicio = 0;
      for (let fim = resto.indexOf("\n"); fim !== -1; fim = resto.indexOf("\n", inicio)) {
        somar(resto.slice(inicio, fim));
        inicio = fim + 1;
      }
      resto = resto.slice(inicio);
      if (resto.length > LINHA_MAXIMA) throw new RespostaGrandeDemais();
    }
    resto += decodificador.decode();
    if (resto) somar(resto);
    return soma.resultado();
  } catch (erro) {
    await leitor.cancel().catch(() => {});
    throw erro;
  } finally {
    leitor.releaseLock();
  }
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
    if (!resposta.body) return { estado: "falha", erro: "Resposta vazia", lidoEm };
    // O sinal de timeout do fetch também interrompe a leitura do corpo: cobre a leitura inteira.
    const cobrancas = await lerCobrancasEmStreaming(resposta.body);
    return { estado: "ok", lidoEm, de, ate, ...resumirUsoVercel(cobrancas) };
  } catch (erro) {
    if (erro instanceof RespostaGrandeDemais) {
      console.error("[uso-vercel] resposta grande demais");
      return { estado: "falha", erro: "Resposta grande demais", lidoEm };
    }
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
