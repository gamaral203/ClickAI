"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  confirmarCadastroMfa,
  desligarMfaComCodigo,
  iniciarCadastroMfa,
  MENSAGENS_CODIGO,
  novosCodigosRecuperacao,
} from "@/servicos/mfa";
import { encerrarOutrasSessoes, exigirFotografo, sessaoAtual } from "@/servicos/sessao";
import { confirmarIdentidade } from "@/servicos/troca-documento";

// Verificação em duas etapas em Perfil e recebimento (src/servicos/mfa.ts). Opcional, para
// fotógrafo e gestor (os dois usam o painel).

export type EstadoMfa = {
  /** Cadastro começado: QR Code e segredo para o app; falta o primeiro código. */
  cadastro?: { qrCode: string; segredo: string };
  /** Códigos de recuperação novos, mostrados uma vez só. */
  codigos?: string[];
  ok?: string;
  erro?: string;
  /** Conta só com o Google: precisa entrar de novo com ele para ligar. */
  reentrarComGoogle?: boolean;
};

const entrada = z.discriminatedUnion("etapa", [
  z.object({ etapa: z.literal("iniciar"), senha: z.string().max(200).optional() }),
  z.object({ etapa: z.literal("confirmar"), codigo: z.string().trim().min(6).max(40) }),
  z.object({ etapa: z.literal("desligar"), codigo: z.string().trim().min(6).max(40) }),
  z.object({ etapa: z.literal("codigos"), codigo: z.string().trim().min(6).max(40) }),
]);

const ERRO_SENHA = "Senha incorreta. Para ligar a verificação, digite a senha atual da sua conta.";

export async function verificacaoDuasEtapasAcao(
  anterior: EstadoMfa,
  formulario: FormData,
): Promise<EstadoMfa> {
  const { usuario } = await exigirFotografo("/painel/perfil");
  const dados = entrada.safeParse(Object.fromEntries(formulario));
  if (!dados.success) {
    return { cadastro: anterior.cadastro, erro: MENSAGENS_CODIGO.faltando };
  }

  switch (dados.data.etapa) {
    case "iniciar": {
      if (usuario.mfaAtivo) return { erro: "A verificação em duas etapas já está ligada." };
      // Quem roubou só o cookie não pode ligar a verificação com o celular dele e trancar a
      // dona da conta do lado de fora: pede a senha de novo (ou um login recente com o Google).
      const sessao = await sessaoAtual();
      if (!sessao || sessao.usuario.id !== usuario.id) return { erro: ERRO_SENHA };
      switch (await confirmarIdentidade(sessao, dados.data.senha ?? null)) {
        case "senha":
          return { erro: ERRO_SENHA };
        case "bloqueado":
          return { erro: MENSAGENS_CODIGO.bloqueado };
        case "google_antigo":
          return { reentrarComGoogle: true };
      }
      const cadastro = await iniciarCadastroMfa(usuario);
      if (!cadastro) return { erro: "A verificação em duas etapas já está ligada." };
      return { cadastro };
    }
    case "confirmar": {
      const resultado = await confirmarCadastroMfa(usuario.id, dados.data.codigo);
      if (!resultado.ok) {
        if (resultado.motivo === "sem_cadastro") {
          return { erro: "O cadastro expirou. Comece de novo." };
        }
        return { cadastro: anterior.cadastro, erro: MENSAGENS_CODIGO[resultado.motivo] };
      }
      // As outras sessões entraram sem o código: caem e precisam entrar de novo com ele.
      await encerrarOutrasSessoes(usuario.id);
      revalidatePath("/painel/perfil");
      return { codigos: resultado.codigos, ok: "Verificação em duas etapas ligada." };
    }
    case "desligar": {
      const resultado = await desligarMfaComCodigo(usuario.id, dados.data.codigo);
      if (resultado !== "ok") return { erro: MENSAGENS_CODIGO[resultado] };
      await encerrarOutrasSessoes(usuario.id);
      revalidatePath("/painel/perfil");
      return { ok: "Verificação em duas etapas desligada." };
    }
    case "codigos": {
      const resultado = await novosCodigosRecuperacao(usuario.id, dados.data.codigo);
      if (!resultado.ok) return { erro: MENSAGENS_CODIGO[resultado.motivo] };
      revalidatePath("/painel/perfil");
      return {
        codigos: resultado.codigos,
        ok: "Códigos novos gerados. Os antigos não valem mais.",
      };
    }
  }
}
