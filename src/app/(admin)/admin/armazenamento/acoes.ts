"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  CONFIG_ARMAZENAMENTO_EXPERIMENTAL,
  definirArmazenamentoDoEvento,
  eventoParaArmazenamento,
  gravarConfiguracao,
  situacaoDaConexaoDrive,
} from "@/dados/configuracoes";
import { FORMATO_SLUG } from "@/lib/slug";
import {
  desconectarDrive,
  testarConexaoDrive,
  type ResultadoTesteDrive,
} from "@/servicos/conexao-drive";
import { limiteAtingido } from "@/servicos/limites";
import { exigirGestor } from "@/servicos/sessao";

// Ações da tela de Armazenamento da gestão (protótipo do Google Drive; docs/arquitetura.md,
// "Armazenamento experimental"). Todas conferem o gestor; nenhuma devolve id, link ou token do
// Drive, só números e mensagens.

const TELA = "/admin/armazenamento";

export type EstadoAcaoArmazenamento = { ok?: string; erro?: string };

/** "1 foto ou vídeo" / "3 fotos ou vídeos". */
function textoDeFotos(n: number) {
  return n === 1 ? "Há 1 foto ou vídeo" : `Há ${n.toLocaleString("pt-BR")} fotos ou vídeos`;
}

/** Testa a conexão com o Drive (espaço usado + pasta raiz), com o tempo de resposta. */
export async function testarConexaoDriveAcao(): Promise<ResultadoTesteDrive> {
  const gestor = await exigirGestor(TELA);
  if (await limiteAtingido("drive_teste_usuario", gestor.id)) {
    return { ok: false, erro: "Muitos testes seguidos. Espere alguns minutos." };
  }
  const resultado = await testarConexaoDrive();
  revalidatePath(TELA);
  return resultado;
}

/**
 * Revoga o acesso no Google e apaga a credencial. Recusa enquanto houver original gravado no
 * Drive (inclusive de foto excluída): sem a conta, ninguém mais baixaria esses arquivos.
 */
export async function desconectarDriveAcao(): Promise<EstadoAcaoArmazenamento> {
  await exigirGestor(TELA);
  const resultado = await desconectarDrive();
  revalidatePath(TELA);
  if (!resultado.ok) {
    return {
      erro:
        `${textoDeFotos(resultado.fotosNoDrive)} com o original nesta conta do Google Drive. ` +
        "Enquanto existirem, a conta não pode ser desconectada nem trocada.",
    };
  }
  return resultado.revogado
    ? { ok: "Conta do Google Drive desconectada." }
    : {
        ok:
          "Conta desconectada aqui, mas o Google não confirmou a revogação. Remova o acesso do " +
          "ClicouAí em myaccount.google.com/permissions.",
      };
}

/** Liga ou desliga a trava do armazenamento experimental. Ligar exige uma conta conectada. */
export async function alternarArmazenamentoExperimentalAcao(
  ativo: boolean,
): Promise<EstadoAcaoArmazenamento> {
  const gestor = await exigirGestor(TELA);
  if (typeof ativo !== "boolean") return { erro: "Pedido inválido." };
  if (ativo && !(await situacaoDaConexaoDrive())) {
    return { erro: "Conecte uma conta do Google Drive antes de ativar." };
  }
  await gravarConfiguracao(CONFIG_ARMAZENAMENTO_EXPERIMENTAL, { ativo }, gestor.id);
  revalidatePath(TELA);
  return {
    ok: ativo ? "Armazenamento experimental ativado." : "Armazenamento experimental desativado.",
  };
}

const slug = z
  .string()
  .trim()
  .toLowerCase()
  // Aceita o endereço inteiro colado (…/eventos/meu-evento) e fica só com o fim.
  .transform((s) => s.replace(/\/+$/, "").split("/").pop() ?? "")
  .pipe(z.string().regex(FORMATO_SLUG));

/** Marca o evento (pelo endereço) como híbrido: as PRÓXIMAS fotos dele vão para o Drive. */
export async function marcarEventoHibridoAcao(
  _anterior: EstadoAcaoArmazenamento,
  formulario: FormData,
): Promise<EstadoAcaoArmazenamento> {
  await exigirGestor(TELA);
  const dados = slug.safeParse(formulario.get("slug") ?? "");
  if (!dados.success) return { erro: "Digite o endereço do evento (ex.: meia-maratona-rio-2026)." };
  const evento = await eventoParaArmazenamento(dados.data);
  if (!evento) return { erro: "Nenhum evento com esse endereço." };
  if (evento.armazenamento === "hibrido") return { ok: `“${evento.titulo}” já é híbrido.` };
  await definirArmazenamentoDoEvento(evento.id, "hibrido");
  revalidatePath(TELA);
  return { ok: `“${evento.titulo}” agora é híbrido.` };
}

/** Volta o evento ao R2: as próximas fotos vão para o R2; as já gravadas no Drive ficam lá. */
export async function voltarEventoParaR2Acao(eventoId: string): Promise<EstadoAcaoArmazenamento> {
  await exigirGestor(TELA);
  if (!z.uuid().safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const mudou = await definirArmazenamentoDoEvento(eventoId, "r2");
  if (!mudou) return { erro: "Evento não encontrado." };
  revalidatePath(TELA);
  return { ok: "O evento voltou ao R2." };
}
