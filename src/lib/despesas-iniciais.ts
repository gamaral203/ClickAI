// Despesas iniciais da plataforma, informadas pelos donos em 28/10/2026. Não entram sozinhas em
// nenhum banco: o gestor importa por "Importar despesas iniciais" em /admin/uso/financeiro
// (src/dados/financeiro-plataforma.ts, `importarDespesas`), uma vez, e pode rodar de novo sem
// duplicar nada (cada despesa e cada cobrança tem uma chave própria).
//
// Dólar convertido pela cotação de referência US$ 1 = R$ 5,3495, gravada em cada cobrança:
// US$ 20,00 → R$ 106,99 e US$ 2,14 → R$ 11,45 (o que os donos informaram).
//
// O domínio: já havia um registro de domínio de US$ 5/ano cadastrado à mão. É o mesmo
// clicouai.com, comprado pela Vercel em 09/10/2026, com renovação de US$ 11,25/ano; os R$ 60,00
// informados pelos donos são o que saiu no cartão. A importação atualiza esse registro (sem
// criar outro) e anota o motivo nas observações.
//
// Fora daqui, de propósito: o Cloudflare Workers Paid (não é assinado).

import type { DespesaInicial } from "@/dados/financeiro-plataforma";

import { converterParaReal, COTACAO_PADRAO_DEZ_MILESIMOS } from "./financeiro-plataforma";

/** Dia em que os donos informaram os valores (data das cobranças sem data própria). */
export const DIA_INFORMADO = "2026-10-28";

const COTACAO = COTACAO_PADRAO_DEZ_MILESIMOS;

const emDolar = (centavosUsd: number) => ({
  valorCentavos: centavosUsd,
  moeda: "USD" as const,
  cotacaoDezMilesimos: COTACAO,
  valorBrlCentavos: converterParaReal(centavosUsd, COTACAO),
  iofCentavos: 0,
});

const emReais = (centavos: number) => ({
  valorCentavos: centavos,
  moeda: "BRL" as const,
  cotacaoDezMilesimos: null,
  valorBrlCentavos: centavos,
  iofCentavos: 0,
});

export const DESPESAS_INICIAIS: DespesaInicial[] = [
  {
    chave: "inicial:vercel-pro",
    procurar: { categoria: "hospedagem", nomeContem: ["vercel"], naoContem: ["(exemplo)"] },
    atualizarExistente: false,
    assinatura: {
      nome: "Vercel Pro",
      categoria: "hospedagem",
      plano: "Pro",
      valorCentavos: 2000,
      moeda: "USD",
      ciclo: "mensal",
      assinadaEm: "2026-10-11",
      renovaEm: "2026-11-11",
      ativa: true,
      observacoes: "Importada das despesas iniciais (informadas pelos donos em 28/10/2026).",
    },
    cobrancas: [
      {
        chave: "inicial:vercel-pro:2026-10",
        data: "2026-10-11",
        ...emDolar(2000),
        status: "paga",
        pagoPeloSaldoMp: false,
        observacao:
          "Paga: R$ 106,99 informados pelos donos (cartão, fora do saldo do Mercado Pago).",
      },
    ],
  },
  {
    chave: "inicial:resend-pro",
    procurar: { categoria: "email", nomeContem: ["resend"], naoContem: ["(exemplo)"] },
    atualizarExistente: false,
    assinatura: {
      nome: "Resend Pro",
      categoria: "email",
      plano: "Pro",
      valorCentavos: 2000,
      moeda: "USD",
      ciclo: "mensal",
      assinadaEm: "2026-10-12",
      renovaEm: "2026-11-12",
      ativa: true,
      observacoes: "Importada das despesas iniciais (informadas pelos donos em 28/10/2026).",
    },
    cobrancas: [
      {
        chave: "inicial:resend-pro:2026-10",
        data: "2026-10-12",
        ...emDolar(2000),
        status: "paga",
        pagoPeloSaldoMp: false,
        observacao:
          "Paga: R$ 106,99 informados pelos donos (cartão, fora do saldo do Mercado Pago).",
      },
    ],
  },
  {
    chave: "inicial:dominio-clicouai-com",
    procurar: {
      categoria: "dominio",
      nomeContem: ["clicouai", "domínio", "dominio", "vercel"],
      naoContem: [".com.br", "(exemplo)"],
    },
    atualizarExistente: true,
    assinatura: {
      nome: "Domínio clicouai.com",
      categoria: "dominio",
      plano: "Vercel Domains",
      valorCentavos: 1125,
      moeda: "USD",
      ciclo: "anual",
      assinadaEm: "2026-10-09",
      renovaEm: "2027-10-09",
      ativa: true,
      observacoes:
        "Importação de 28/10/2026: o mesmo clicouai.com, comprado pela Vercel em 09/10/2026. " +
        "Valor corrigido para a renovação de US$ 11,25/ano (o registro anterior dizia US$ 5/ano); " +
        "a compra saiu por R$ 60,00 no cartão (cobrança no histórico).",
    },
    cobrancas: [
      {
        chave: "inicial:dominio-clicouai-com:2026-10",
        data: "2026-10-09",
        ...emReais(6000),
        status: "paga",
        pagoPeloSaldoMp: false,
        observacao: "Compra do domínio: R$ 60,00 informados pelos donos (cartão).",
      },
    ],
  },
  {
    chave: "inicial:cloudflare-r2",
    procurar: {
      categoria: "armazenamento",
      nomeContem: ["r2", "cloudflare"],
      naoContem: ["(exemplo)", "workers"],
    },
    atualizarExistente: false,
    assinatura: {
      nome: "Cloudflare R2",
      categoria: "armazenamento",
      plano: "Pague pelo uso (10 GB grátis)",
      valorCentavos: 214,
      moeda: "USD",
      ciclo: "uso",
      assinadaEm: DIA_INFORMADO,
      renovaEm: null,
      ativa: true,
      observacoes:
        "Custo variável: 155 GB armazenados em 28/10/2026, franquia de 10 GB. O gasto real vai no " +
        "histórico de cobranças, mês a mês.",
    },
    cobrancas: [
      {
        chave: "inicial:cloudflare-r2:2026-10",
        data: DIA_INFORMADO,
        ...emDolar(214),
        status: "provisionada",
        pagoPeloSaldoMp: false,
        observacao:
          "Consumo acumulado informado (US$ 2,14 ≈ R$ 11,45), ainda sem fatura: provisionado, não pago.",
      },
    ],
  },
  {
    chave: "inicial:trafego-pago",
    procurar: { categoria: "marketing", nomeContem: ["tráfego", "trafego", "anúncio"] },
    atualizarExistente: false,
    assinatura: {
      nome: "Tráfego pago",
      categoria: "marketing",
      plano: "Anúncios",
      valorCentavos: 6000,
      moeda: "BRL",
      ciclo: "avulsa",
      assinadaEm: DIA_INFORMADO,
      renovaEm: null,
      ativa: true,
      observacoes: "Despesa avulsa informada pelos donos em 28/10/2026.",
    },
    cobrancas: [
      {
        chave: "inicial:trafego-pago:2026-10",
        data: DIA_INFORMADO,
        ...emReais(6000),
        status: "prevista",
        pagoPeloSaldoMp: false,
        observacao:
          "Situação do pagamento não informada: confira e marque como paga (e se saiu do saldo do " +
          "Mercado Pago).",
      },
    ],
  },
  {
    chave: "inicial:meta-verified",
    procurar: { categoria: "marketing", nomeContem: ["meta verified", "meta"] },
    atualizarExistente: false,
    assinatura: {
      nome: "Meta Verified",
      categoria: "marketing",
      plano: "Selo verificado",
      valorCentavos: 5300,
      moeda: "BRL",
      ciclo: "avulsa",
      assinadaEm: DIA_INFORMADO,
      renovaEm: null,
      ativa: true,
      observacoes:
        "Cobrança histórica, já paga com o saldo do Mercado Pago. Se virar recorrente, mude o " +
        "ciclo para mensal.",
    },
    cobrancas: [
      {
        chave: "inicial:meta-verified:historica",
        data: DIA_INFORMADO,
        ...emReais(5300),
        status: "paga",
        pagoPeloSaldoMp: true,
        observacao:
          "Paga com o saldo do Mercado Pago (informado pelos donos em 28/10/2026; data aproximada).",
      },
    ],
  },
];
