// Créditos da conta da AWS no Painel de uso (/admin/uso). A conta está no plano gratuito novo da
// AWS (contas criadas a partir de julho de 2025): US$ 100 de crédito que acabam em 6 meses ou
// quando se esgotam. A API Free Tier (GetAccountPlanState) informa o restante e a validade; o
// total vem das configurações da gestão (padrão US$ 100).
//
// Mesmas chaves do Rekognition (REKOGNITION_*), com a permissão de leitura
// freetier:GetAccountPlanState (instrucoes/deploy.md). A API é global, em us-east-1, qualquer que
// seja a região do Rekognition. Sem as chaves (desenvolvimento, dados de exemplo), não chama a AWS.
// Nada da resposta nem das chaves vai para o log: só o nome do erro.

import "server-only";

import {
  FreeTierClient,
  GetAccountPlanStateCommand,
  type GetAccountPlanStateCommandOutput,
} from "@aws-sdk/client-freetier";
import { cacheLife } from "next/cache";

import { dolaresParaCentavos } from "@/lib/painel-de-uso";
import { credenciaisAws, nomeDoErro } from "@/lib/reconhecimento";

/** Endpoint global da API Free Tier (freetier.us-east-1.api.aws). */
export const REGIAO_FREE_TIER = "us-east-1";

export type PlanoAws = "FREE" | "PAID";
export type SituacaoPlanoAws = "ACTIVE" | "EXPIRED" | "NOT_STARTED";

export type LeituraCreditosAws =
  | { estado: "nao-configurado" }
  | { estado: "sem-permissao"; lidoEm: string }
  | { estado: "falha"; erro: string; lidoEm: string }
  | {
      estado: "ok";
      lidoEm: string;
      plano: PlanoAws | null;
      situacao: SituacaoPlanoAws | null;
      /** Centavos de dólar; `null` se a AWS não informou créditos. */
      restanteCentavos: number | null;
      /** Instante ISO da expiração do plano; `null` se a AWS não informou. */
      expiraEm: string | null;
    };

let cliente: { chave: string; ft: FreeTierClient } | null = null;
function freeTier(credenciais: { accessKeyId: string; secretAccessKey: string }) {
  // Credenciais passadas aqui, nunca pela cadeia padrão do SDK (que leria as AWS_* da Vercel).
  if (cliente?.chave !== credenciais.accessKeyId) {
    cliente = {
      chave: credenciais.accessKeyId,
      ft: new FreeTierClient({
        region: REGIAO_FREE_TIER,
        credentials: credenciais,
        maxAttempts: 2,
        // Uma AWS lenta não pode prender o painel: o quadro mostra a falha e o resto segue.
        requestHandler: { connectionTimeout: 3_000, requestTimeout: 5_000 },
      }),
    };
  }
  return cliente.ft;
}

const PLANOS: readonly string[] = ["FREE", "PAID"];
const SITUACOES: readonly string[] = ["ACTIVE", "EXPIRED", "NOT_STARTED"];

function paraLeitura(r: GetAccountPlanStateCommandOutput, lidoEm: string): LeituraCreditosAws {
  const credito = r.accountPlanRemainingCredits;
  if (credito && credito.unit !== "USD") {
    return { estado: "falha", erro: "MoedaInesperada", lidoEm };
  }
  const expira = r.accountPlanExpirationDate;
  return {
    estado: "ok",
    lidoEm,
    plano: PLANOS.includes(r.accountPlanType ?? "") ? (r.accountPlanType as PlanoAws) : null,
    situacao: SITUACOES.includes(r.accountPlanStatus ?? "")
      ? (r.accountPlanStatus as SituacaoPlanoAws)
      : null,
    restanteCentavos: credito ? dolaresParaCentavos(credito.amount) : null,
    expiraEm:
      expira instanceof Date && !Number.isNaN(expira.getTime()) ? expira.toISOString() : null,
  };
}

/** Lê o plano da conta na AWS agora, sem cache. Nunca lança: a falha vira um estado. */
export async function consultarCreditosAws(): Promise<LeituraCreditosAws> {
  const credenciais = credenciaisAws();
  if (!credenciais) return { estado: "nao-configurado" };
  const lidoEm = new Date().toISOString();
  try {
    const resposta = await freeTier(credenciais).send(new GetAccountPlanStateCommand({}));
    return paraLeitura(resposta, lidoEm);
  } catch (erro) {
    const nome = nomeDoErro(erro);
    if (nome === "AccessDeniedException") {
      console.warn("[creditos-aws] sem permissão freetier:GetAccountPlanState");
      return { estado: "sem-permissao", lidoEm };
    }
    console.error("[creditos-aws] falha ao ler os créditos", nome);
    return { estado: "falha", erro: nome, lidoEm };
  }
}

/**
 * A leitura com cache (Cache Components, `use cache`): 1 hora quando dá certo; poucos minutos
 * quando falha, para a permissão nova valer logo. O cache fica na memória da instância: na Vercel,
 * outra instância pode ler de novo, o que não custa nada (a API Free Tier não é cobrada).
 */
export async function lerCreditosAws(): Promise<LeituraCreditosAws> {
  "use cache";
  const leitura = await consultarCreditosAws();
  // Uma chamada só por execução (docs do Next, cacheLife: "conditional cache lifetimes").
  if (leitura.estado === "ok") cacheLife("hours");
  else cacheLife("minutes");
  return leitura;
}
