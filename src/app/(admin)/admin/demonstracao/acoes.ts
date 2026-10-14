"use server";

import { z } from "zod";

import { formatarPreco } from "@/lib/formatar";
import { criarContaDemonstracao } from "@/servicos/demonstracao";
import { exigirGestor } from "@/servicos/sessao";

export type EstadoDemonstracao = { ok?: string; erro?: string };

const entrada = z.object({
  nome: z.string().trim().min(2).max(80),
  email: z.email().max(200),
  senha: z.string().min(8).max(200),
});

/**
 * Cria a conta de demonstração (src/servicos/demonstracao.ts). Só gestores. A senha vem do
 * formulário e só o hash fica no banco.
 */
export async function criarContaDemonstracaoAcao(
  _anterior: EstadoDemonstracao,
  formulario: FormData,
): Promise<EstadoDemonstracao> {
  await exigirGestor("/admin/demonstracao");
  const dados = entrada.safeParse(Object.fromEntries(formulario));
  if (!dados.success) {
    return { erro: "Preencha o nome, um e-mail válido e uma senha com pelo menos 8 caracteres." };
  }
  const r = await criarContaDemonstracao(dados.data);
  if ("erro" in r) return { erro: r.erro };
  return {
    ok:
      `Conta criada: ${r.eventos} eventos, ${r.fotos} fotos e ${r.pedidos} pedidos fictícios ` +
      `(${formatarPreco(r.vendidoCentavos)}). Entre com ${dados.data.email.toLowerCase()} e a ` +
      `senha escolhida.`,
  };
}
