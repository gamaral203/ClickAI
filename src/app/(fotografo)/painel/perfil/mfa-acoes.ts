"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { desligarMfa, ligarVerificacaoPorEmail } from "@/dados";
import { exigirCodigoDeAcao, MENSAGENS_CODIGO_ACAO } from "@/servicos/codigo-acao";
import { encerrarOutrasSessoes, exigirFotografo } from "@/servicos/sessao";

// Verificação em duas etapas em Perfil e recebimento. Desde 16/10/2026 é por e-mail: ligada, o
// login pede o código enviado ao e-mail da conta (src/servicos/codigo-login.ts) e a troca de senha
// e o download dos originais também (src/servicos/codigo-acao.ts). Ligar e desligar pedem o código
// do e-mail: quem roubou só o cookie não muda a proteção da conta.

export type EstadoMfa = { ok?: string; erro?: string };

const entrada = z.object({
  acao: z.enum(["ligar", "desligar"]),
  codigo: z.string().max(40).optional(),
});

export async function verificacaoDuasEtapasAcao(
  _anterior: EstadoMfa,
  formulario: FormData,
): Promise<EstadoMfa> {
  const { usuario } = await exigirFotografo("/painel/perfil");
  const dados = entrada.safeParse(Object.fromEntries(formulario));
  if (!dados.success) return { erro: "Pedido inválido. Recarregue a página." };
  const ligar = dados.data.acao === "ligar";
  if (ligar === usuario.mfaAtivo) {
    return { ok: ligar ? "A verificação já está ligada." : "A verificação já está desligada." };
  }
  const codigo = await exigirCodigoDeAcao(usuario, "verificacao", dados.data.codigo);
  if (codigo !== "ok") return { erro: MENSAGENS_CODIGO_ACAO[codigo] };
  if (ligar) {
    await ligarVerificacaoPorEmail(usuario.id);
    // As outras sessões entraram sem o código: caem e precisam entrar de novo com ele.
    await encerrarOutrasSessoes(usuario.id);
  } else {
    await desligarMfa(usuario.id);
  }
  revalidatePath("/painel/perfil");
  return {
    ok: ligar
      ? "Verificação em duas etapas ligada. Nos próximos logins, vamos pedir o código do e-mail."
      : "Verificação em duas etapas desligada.",
  };
}
