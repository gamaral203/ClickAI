import "server-only";

import { randomUUID } from "node:crypto";

import {
  listarLancamentosDoFotografo,
  listarSaquesDoFotografo,
  listarSaquesProcessando,
  mudarStatusSaque,
  reservarLancamentosParaSaque,
  soltarLancamentosDoSaque,
  type FotografoConta,
  type Lancamento,
  type Saque,
  type Usuario,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { cpfOuCnpjValido, somenteDigitos } from "@/lib/documentos";
import { formatarDataEHora } from "@/lib/formatar";
import {
  buscarSaque,
  enviarSaquePix,
  ErroGateway,
  gatewayConfigurado,
  recusaDoSaque,
  SaqueNaoHabilitado,
  type ResultadoPayout,
} from "@/lib/gateway";

// Saque do fotógrafo (docs/arquitetura.md, "Saque do fotógrafo"). O cliente paga na conta da
// plataforma; o fotógrafo saca pelo painel e o dinheiro sai por Pix para o CPF/CNPJ dele, já
// sem a comissão:
//   - saque normal: vendas com 30 dias ou mais, comissão de 8%;
//   - saque antecipado: vendas com 1 dia ou mais; o que ainda não tinha 30 dias paga 8% + 2%.
//
// Por enquanto o saque é MANUAL: o pedido fica em `processando`, a gestão é avisada, faz o Pix
// pelo app do banco em até 1 dia e marca como pago em /admin/saques. Com SAQUE_AUTOMATICO=1 (e o
// Payouts liberado no gateway), o saque volta a sair sozinho pelo gateway.

/** Taxa extra do saque antecipado, em pontos percentuais. */
export const TAXA_ANTECIPACAO_PCT = 1.99;

/** "1,99%": a única taxa que o fotógrafo vê (a comissão não aparece para ele). */
export const TAXA_ANTECIPACAO_TEXTO = `${TAXA_ANTECIPACAO_PCT.toLocaleString("pt-BR")}%`;

/** O saque sai sozinho pelo gateway? Só com SAQUE_AUTOMATICO=1; sem ele, a gestão paga à mão. */
export function saqueAutomatico() {
  return process.env.SAQUE_AUTOMATICO === "1" && gatewayConfigurado();
}
/** Os gateways não enviam Pix abaixo de R$ 1,00. */
export const SAQUE_MINIMO_CENTAVOS = 100;
/**
 * Saques bloqueados por 72 horas depois de trocar o CPF/CNPJ (a chave Pix): quem invadir a conta
 * e trocar o documento não saca antes de a dona ver o aviso por e-mail (docs/riscos.md).
 */
export const BLOQUEIO_SAQUE_APOS_TROCA_MS = 72 * 60 * 60 * 1000;

/**
 * Até quando os saques estão bloqueados pela troca do CPF/CNPJ (ISO), ou `null` se liberados.
 * Calculado no servidor, pela hora gravada na troca.
 */
export function saqueBloqueadoAte(
  conta: Pick<FotografoConta, "documentoTrocadoEm">,
  agora: number,
): string | null {
  if (!conta.documentoTrocadoEm) return null;
  const ate = new Date(conta.documentoTrocadoEm).getTime() + BLOQUEIO_SAQUE_APOS_TROCA_MS;
  return ate > agora ? new Date(ate).toISOString() : null;
}

export type CalculoSaque = {
  lancamentoIds: string[];
  /** Vendas com 30 dias ou mais: pagam só a comissão. */
  maduroCentavos: number;
  /** Vendas entre 1 e 30 dias, só no saque antecipado: pagam comissão + antecipação. */
  antecipadoCentavos: number;
  brutoCentavos: number;
  taxaCentavos: number;
  liquidoCentavos: number;
};

/** Taxa sobre um valor, arredondada para baixo (o centavo fica com o fotógrafo). */
function taxa(valorCentavos: number, pct: number) {
  return Math.max(0, Math.floor((valorCentavos * pct) / 100));
}

/** Quanto um saque pagaria agora. Recebe só lançamentos ainda sem saque. */
export function calcularSaque(
  lancamentos: Pick<Lancamento, "id" | "valorCentavos" | "disponivelEm" | "antecipavelEm">[],
  agora: number,
  comissaoPct: number,
  antecipado: boolean,
): CalculoSaque {
  const maduros = lancamentos.filter((l) => new Date(l.disponivelEm).getTime() <= agora);
  const antecipados = antecipado
    ? lancamentos.filter(
        (l) =>
          new Date(l.antecipavelEm).getTime() <= agora &&
          new Date(l.disponivelEm).getTime() > agora,
      )
    : [];
  const soma = (lista: typeof lancamentos) => lista.reduce((s, l) => s + l.valorCentavos, 0);
  const maduroCentavos = soma(maduros);
  const antecipadoCentavos = soma(antecipados);
  const taxaCentavos =
    taxa(maduroCentavos, comissaoPct) +
    taxa(antecipadoCentavos, comissaoPct + TAXA_ANTECIPACAO_PCT);
  const brutoCentavos = maduroCentavos + antecipadoCentavos;
  return {
    lancamentoIds: [...maduros, ...antecipados].map((l) => l.id),
    maduroCentavos,
    antecipadoCentavos,
    brutoCentavos,
    taxaCentavos,
    liquidoCentavos: brutoCentavos - taxaCentavos,
  };
}

/**
 * Liberação TEMPORÁRIA de teste: o gestor (papel `admin`) cujo e-mail está em
 * SAQUE_SEM_PRAZO_EMAILS (lista separada por vírgula) saca as próprias vendas sem esperar o
 * prazo. Só o prazo muda: comissão, chave Pix do próprio CPF/CNPJ, valor calculado aqui,
 * idempotência e `processando` sem resposta continuam iguais. Sem a variável, nada muda.
 * Remover a variável da produção depois do teste (docs/tarefas.md, Fase 14).
 */
export function saqueSemPrazo(
  usuario: Pick<Usuario, "id" | "email" | "papel">,
  conta: Pick<FotografoConta, "usuarioId">,
  lista = process.env.SAQUE_SEM_PRAZO_EMAILS,
) {
  if (!lista || usuario.papel !== "admin" || conta.usuarioId !== usuario.id) return false;
  const emails = lista
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(usuario.email.trim().toLowerCase());
}

/** Com a liberação de teste, todo lançamento conta como já disponível (venda com 30 dias). */
export function aplicarLiberacao<T extends Pick<Lancamento, "disponivelEm" | "antecipavelEm">>(
  lancamentos: T[],
  agora: number,
  liberado: boolean,
): T[] {
  if (!liberado) return lancamentos;
  const agoraIso = new Date(agora).toISOString();
  return lancamentos.map((l) =>
    new Date(l.disponivelEm).getTime() <= agora
      ? l
      : { ...l, disponivelEm: agoraIso, antecipavelEm: agoraIso },
  );
}

export type SaldoDoFotografo = {
  /** Vendas com 30 dias ou mais, prontas para o saque normal. */
  disponivelCentavos: number;
  /** Vendas entre 1 e 30 dias: só no saque antecipado. */
  antecipavelCentavos: number;
  /** Vendas de menos de 1 dia: ainda não dá para sacar. */
  aLiberarCentavos: number;
  normal: CalculoSaque;
  antecipado: CalculoSaque;
};

export function calcularSaldo(
  lancamentos: Lancamento[],
  agora: number,
  comissaoPct: number,
): SaldoDoFotografo {
  const livres = lancamentos.filter((l) => l.saqueId === null);
  const normal = calcularSaque(livres, agora, comissaoPct, false);
  const antecipado = calcularSaque(livres, agora, comissaoPct, true);
  const total = livres.reduce((s, l) => s + l.valorCentavos, 0);
  return {
    disponivelCentavos: normal.maduroCentavos,
    antecipavelCentavos: antecipado.antecipadoCentavos,
    aLiberarCentavos: total - antecipado.brutoCentavos,
    normal,
    antecipado,
  };
}

/**
 * O que a página de vendas mostra: saldo, extrato e saques, depois de conferir os saques em
 * processamento. A hora é lida aqui, como o NOW() do banco faria.
 */
export async function situacaoFinanceira(conta: FotografoConta, usuario: Usuario) {
  await conferirSaques(conta.id);
  const [doBanco, saques] = await Promise.all([
    listarLancamentosDoFotografo(conta.id),
    listarSaquesDoFotografo(conta.id),
  ]);
  const agora = Date.now();
  const liberacaoTeste = saqueSemPrazo(usuario, conta);
  const lancamentos = aplicarLiberacao(doBanco, agora, liberacaoTeste);
  return {
    agora,
    lancamentos,
    saques,
    liberacaoTeste,
    bloqueadoAte: saqueBloqueadoAte(conta, agora),
    saldo: calcularSaldo(lancamentos, agora, conta.comissaoPct),
  };
}

/** A chave Pix confirmada ainda é o CPF/CNPJ atual do cadastro? */
export function chavePixValida(conta: Pick<FotografoConta, "chavePix" | "cpfCnpj">) {
  const documento = somenteDigitos(conta.cpfCnpj);
  return Boolean(conta.chavePix) && conta.chavePix === documento && documento.length >= 11;
}

/**
 * O que falta para o fotógrafo poder receber (e, por isso, publicar evento), ou `null` se nada.
 * Salvar o CPF/CNPJ não confirma a chave: é preciso clicar em "Usar meu CPF/CNPJ como chave Pix".
 */
export function pendenciaDeRecebimento(conta: Pick<FotografoConta, "chavePix" | "cpfCnpj">) {
  if (chavePixValida(conta)) return null;
  return cpfOuCnpjValido(conta.cpfCnpj) ? ("chave_pendente" as const) : ("sem_documento" as const);
}

export const MENSAGEM_PENDENCIA_RECEBIMENTO = {
  sem_documento:
    "Falta o CPF ou CNPJ para receber as vendas. Informe e salve o seu CPF ou CNPJ e depois clique em “Usar meu CPF/CNPJ como chave Pix”.",
  chave_pendente:
    "Falta confirmar a chave Pix para receber as vendas. Clique em “Usar meu CPF/CNPJ como chave Pix”: só salvar o CPF/CNPJ não basta.",
};

/** Texto da tela de saques enquanto o bloqueio da troca de CPF/CNPJ vale. */
export function mensagemDeBloqueio(bloqueadoAte: string) {
  return `Por segurança, os saques ficam bloqueados por 72 horas depois da troca do CPF/CNPJ. Você poderá sacar a partir de ${formatarDataEHora(bloqueadoAte)}.`;
}

export type ResultadoSaque =
  | { ok: true; saque: Saque }
  | { ok: false; motivo: "documento_trocado"; bloqueadoAte: string }
  | {
      ok: false;
      motivo: "sem_chave" | "saque_em_andamento" | "abaixo_do_minimo" | "conflito" | "falhou";
    };

/**
 * Alerta para revisão manual: o saque fica em `processando` (o fotógrafo não pede outro e o
 * gestor o vê em /admin/saques) e nada é devolvido sozinho, porque o Pix pode ter saído.
 */
function alertarRevisao(motivo: string, dados: Record<string, unknown>) {
  console.error(`ALERTA saque para revisão manual: ${motivo}`, dados);
}

/** Aplica ao saque a situação que o gateway informou. */
async function aplicarSituacao(saqueId: string, payout: ResultadoPayout) {
  const gatewayId = payout.id;
  if (payout.situacao === "pago") {
    await mudarStatusSaque(saqueId, "processando", "pago", {
      gatewayId,
      pagoEm: new Date().toISOString(),
    });
  } else if (payout.situacao === "falhou") {
    if (await mudarStatusSaque(saqueId, "processando", "falhou", { gatewayId })) {
      await soltarLancamentosDoSaque(saqueId);
    }
  } else {
    if (payout.situacao === "revisao") {
      alertarRevisao("o gateway informou o Pix como devolvido", {
        saque: saqueId,
        payout: payout.id,
        transacao: payout.transacaoId,
        status: payout.status,
        detalhe: payout.detalhe,
      });
    }
    await mudarStatusSaque(saqueId, "processando", "processando", { gatewayId });
  }
}

/**
 * Envia (ou reenvia, com a mesma chave de idempotência) o payout de um saque em
 * processamento. O saldo só volta ao fotógrafo quando é certo que o Pix não saiu:
 *   - no PRIMEIRO envio, recusa clara do Mercado Pago (assinatura, token, permissão, corpo
 *     inválido) ou saque não habilitado (nada foi enviado);
 *   - recusa ambígua (referência repetida, conflito, código desconhecido) ou qualquer 4xx num
 *     REENVIO (o primeiro envio pode ter criado o payout) fica em `processando` com alerta;
 *   - erro de rede, timeout, 5xx ou resposta ilegível ficam em `processando`: a próxima
 *     conferência reenvia com a mesma chave e descobre, sem pagar duas vezes.
 */
async function enviar(saque: Saque, primeiroEnvio: boolean) {
  try {
    const payout = await enviarSaquePix({
      saqueId: saque.id,
      liquidoCentavos: saque.liquidoCentavos,
      chavePix: saque.chavePix,
    });
    await aplicarSituacao(saque.id, payout);
  } catch (erro) {
    const quatroXX = erro instanceof ErroGateway && erro.status >= 400 && erro.status < 500;
    const naoEnviado = erro instanceof SaqueNaoHabilitado;
    if (quatroXX || naoEnviado) {
      const clara = naoEnviado || (erro instanceof ErroGateway && recusaDoSaque(erro) === "clara");
      if (primeiroEnvio && clara) {
        console.error("Saque recusado; saldo devolvido", { saque: saque.id, erro });
        if (await mudarStatusSaque(saque.id, "processando", "falhou")) {
          await soltarLancamentosDoSaque(saque.id);
        }
      } else {
        alertarRevisao(
          primeiroEnvio ? "recusa ambígua do gateway" : "recusa do gateway num reenvio",
          { saque: saque.id, erro },
        );
      }
    } else {
      console.error("Saque sem resposta; fica em processamento", { saque: saque.id, erro });
    }
  }
}

/** Pede o saque de todo o saldo que dá para sacar agora, normal ou antecipado. */
export async function solicitarSaque(
  conta: FotografoConta,
  usuario: Usuario,
  antecipado: boolean,
): Promise<ResultadoSaque> {
  if (!chavePixValida(conta) || !conta.chavePix) return { ok: false, motivo: "sem_chave" };
  // CPF/CNPJ trocado há menos de 72 horas: nenhum saque, nem com a liberação de teste.
  const bloqueadoAte = saqueBloqueadoAte(conta, Date.now());
  if (bloqueadoAte) return { ok: false, motivo: "documento_trocado", bloqueadoAte };
  // Saque automático na produção sem as credenciais do gateway: recusa antes de reservar o saldo
  // (o saque sairia "pago" sem Pix nenhum). O manual não depende do gateway.
  if (process.env.SAQUE_AUTOMATICO === "1" && emProducao() && !gatewayConfigurado()) {
    console.error("Saque recusado: gateway sem credenciais na produção");
    return { ok: false, motivo: "falhou" };
  }
  // Um saque por vez: evita somar saldo enquanto outro ainda não terminou.
  if ((await listarSaquesProcessando(conta.id)).length > 0) {
    return { ok: false, motivo: "saque_em_andamento" };
  }

  const agora = Date.now();
  const liberacaoTeste = saqueSemPrazo(usuario, conta);
  const lancamentos = aplicarLiberacao(
    await listarLancamentosDoFotografo(conta.id),
    agora,
    liberacaoTeste,
  );
  const calculo = calcularSaque(
    lancamentos.filter((l) => l.saqueId === null),
    agora,
    conta.comissaoPct,
    antecipado,
  );
  if (calculo.liquidoCentavos < SAQUE_MINIMO_CENTAVOS) {
    return { ok: false, motivo: "abaixo_do_minimo" };
  }

  const saque: Saque = {
    id: randomUUID(),
    fotografoId: conta.id,
    antecipado: antecipado && calculo.antecipadoCentavos > 0,
    brutoCentavos: calculo.brutoCentavos,
    taxaCentavos: calculo.taxaCentavos,
    liquidoCentavos: calculo.liquidoCentavos,
    chavePix: conta.chavePix,
    gatewayId: null,
    status: "processando",
    criadoEm: new Date(agora).toISOString(),
    pagoEm: null,
  };
  if (!(await reservarLancamentosParaSaque(saque, calculo.lancamentoIds))) {
    return { ok: false, motivo: "conflito" };
  }
  if (liberacaoTeste) {
    console.warn("Saque com liberação de teste (SAQUE_SEM_PRAZO_EMAILS): prazo ignorado", {
      saque: saque.id,
      fotografo: conta.id,
    });
  }

  // Manual (o padrão): fica em `processando` até a gestão pagar e dar baixa em /admin/saques.
  if (saqueAutomatico()) await enviar(saque, true);
  return { ok: true, saque };
}

/** Confere no gateway os saques ainda em processamento do fotógrafo. */
export async function conferirSaques(fotografoId: string) {
  // Saque manual: quem confere é a gestão, não o gateway.
  if (!saqueAutomatico()) return;
  for (const saque of await listarSaquesProcessando(fotografoId)) {
    if (!saque.gatewayId) {
      // O primeiro envio ficou sem resposta: reenvia com a mesma chave de idempotência.
      await enviar(saque, false);
      continue;
    }
    try {
      await aplicarSituacao(saque.id, await buscarSaque(saque.gatewayId, saque.id));
    } catch (erro) {
      console.error("Falha ao consultar o saque no gateway", { saque: saque.id, erro });
    }
  }
}
