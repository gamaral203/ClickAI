"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formatarPreco } from "@/lib/formatar";
import { exigirCodigoSeLigado, MENSAGENS_CODIGO } from "@/servicos/mfa";
import { avisarSaqueSolicitado } from "@/servicos/avisos-saque";
import { FREQUENCIAS_TRANSFERENCIA } from "@/servicos/financeiro";
import {
  mensagemDeBloqueio,
  salvarAntecipacao,
  salvarTransferenciaAutomatica,
  saqueAutomatico,
  solicitarSaque,
} from "@/servicos/saques";
import { recusarSeEmManutencao } from "@/servicos/manutencao";
import { exigirFotografo } from "@/servicos/sessao";

export type EstadoSaque = { ok?: string; erro?: string };
/** Resposta das configurações: só o erro importa, o sucesso volta pela página revalidada. */
export type EstadoConfiguracao = { erro?: string };

const MOTIVOS = {
  sem_chave: "Confirme sua chave Pix em Perfil e recebimento antes de transferir.",
  saque_em_andamento:
    "Já existe uma transferência em andamento. Espere ela terminar para pedir outra.",
  abaixo_do_minimo: "O valor a receber precisa ser de pelo menos R$ 1,00.",
  conflito: "Outra transferência foi pedida ao mesmo tempo. Atualize a página e confira.",
  falhou: "Não foi possível pedir a transferência agora. Tente de novo em alguns minutos.",
  demonstracao: "Conta de demonstração: as vendas são fictícias e não podem ser transferidas.",
};

const NAO_SALVOU = "Não foi possível salvar agora. Tente de novo em alguns minutos.";

const entradaSaque = z.object({ codigo: z.string().max(40).optional() });

/**
 * Transferência manual de todo o saldo disponível. O valor nunca vem do navegador: o servidor
 * calcula a partir dos lançamentos do fotógrafo logado e da configuração de antecipação dele.
 */
export async function solicitarSaqueAcao(
  _anterior: EstadoSaque,
  formulario: FormData,
): Promise<EstadoSaque> {
  const { usuario, conta } = await exigirFotografo("/painel/vendas");
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção").
  const manutencao = await recusarSeEmManutencao();
  if (manutencao) return { erro: manutencao };
  const dados = entradaSaque.safeParse(Object.fromEntries(formulario));
  if (!dados.success) return { erro: MOTIVOS.falhou };
  // Com a verificação em duas etapas ligada, cada saque pede o código do app.
  const codigo = await exigirCodigoSeLigado(usuario, dados.data.codigo);
  if (codigo !== "ok") return { erro: MENSAGENS_CODIGO[codigo] };

  const resultado = await solicitarSaque(conta, usuario);
  revalidatePath("/painel/vendas");
  if (!resultado.ok) {
    if (resultado.motivo === "documento_trocado") {
      return { erro: mensagemDeBloqueio(resultado.bloqueadoAte) };
    }
    return { erro: MOTIVOS[resultado.motivo] };
  }
  if (saqueAutomatico()) {
    return {
      ok: `Transferência de ${formatarPreco(resultado.saque.liquidoCentavos)} pedida. O Pix vai para a sua chave cadastrada.`,
    };
  }
  // Saque manual: a gestão é avisada e faz o Pix em até 1 dia útil.
  await avisarSaqueSolicitado(resultado.saque, conta);
  return {
    ok: `Transferência de ${formatarPreco(resultado.saque.liquidoCentavos)} pedida. A equipe do ClicouAí faz o Pix para a sua chave em até 1 dia útil e você recebe um aviso quando sair.`,
  };
}

/**
 * Liga ou desliga "Antecipar automaticamente vendas no cartão". Não pede o código: muda só QUANDO
 * o dinheiro fica disponível (e a taxa), nunca para onde ele vai.
 */
export async function salvarAntecipacaoAcao(ligado: boolean): Promise<EstadoConfiguracao> {
  const { conta } = await exigirFotografo("/painel/vendas");
  const manutencao = await recusarSeEmManutencao();
  if (manutencao) return { erro: manutencao };
  const resultado = await salvarAntecipacao(conta, ligado);
  revalidatePath("/painel/vendas");
  return resultado.ok ? {} : { erro: NAO_SALVOU };
}

const entradaTransferencia = z.object({
  ligada: z.boolean(),
  frequencia: z.enum(FREQUENCIAS_TRANSFERENCIA),
  codigo: z.string().max(40).optional(),
});

/**
 * Liga, desliga ou muda a frequência da transferência automática. LIGAR pede o código da
 * verificação em duas etapas, como o saque manual: a partir dali saques saem sem ninguém clicar.
 * Desligar e mudar a frequência de uma transferência já ligada não pedem (não criam saque novo).
 */
export async function salvarTransferenciaAutomaticaAcao(entrada: {
  ligada: boolean;
  frequencia: string;
  codigo?: string;
}): Promise<EstadoConfiguracao> {
  const { usuario, conta } = await exigirFotografo("/painel/vendas");
  const manutencao = await recusarSeEmManutencao();
  if (manutencao) return { erro: manutencao };
  const dados = entradaTransferencia.safeParse(entrada);
  if (!dados.success) return { erro: NAO_SALVOU };
  if (dados.data.ligada && !conta.transferenciaAutomatica) {
    const codigo = await exigirCodigoSeLigado(usuario, dados.data.codigo);
    if (codigo !== "ok") return { erro: MENSAGENS_CODIGO[codigo] };
  }
  const resultado = await salvarTransferenciaAutomatica(conta, {
    ligada: dados.data.ligada,
    frequencia: dados.data.frequencia,
  });
  revalidatePath("/painel/vendas");
  return resultado.ok ? {} : { erro: NAO_SALVOU };
}
