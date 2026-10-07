// Usuários, sessões e confirmações de e-mail de exemplo (sessão simulada da Parte A).
// Todos os usuários de exemplo usam a senha "clicouai123". Na Fase 11 o Better Auth assume.

import { gerarHashSenha } from "@/lib/senha";

import type { UsuarioInterno } from "../tipos";
import { compartilhado } from "./compartilhado";

export const SENHA_DE_EXEMPLO = "clicouai123";

function usuarioDeExemplo(
  n: number,
  nome: string,
  email: string,
  papel: UsuarioInterno["papel"],
): UsuarioInterno {
  return {
    id: `05e70000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    nome,
    email,
    telefone: null,
    papel,
    senhaHash: gerarHashSenha(SENHA_DE_EXEMPLO),
    googleId: null,
    emailConfirmadoEm: "2026-01-01T00:00:00.000Z",
    criadoEm: "2026-01-01T00:00:00.000Z",
  };
}

type Sessao = { usuarioId: string; expiraEm: number };
type Confirmacao = { usuarioId: string; expiraEm: number };

export const { usuarios, sessoes, confirmacoes } = compartilhado("usuarios-exemplo", () => ({
  /** Os três primeiros são os donos dos fotógrafos de exemplo (mesmo usuarioId). */
  usuarios: new Map(
    [
      usuarioDeExemplo(1, "Lia Ramos", "lia@exemplo.com", "fotografo"),
      usuarioDeExemplo(2, "Pedro Kenji", "pedro@exemplo.com", "fotografo"),
      usuarioDeExemplo(3, "Equipe Clique Esportes", "clique@exemplo.com", "fotografo"),
      usuarioDeExemplo(4, "Ana Souza", "ana@exemplo.com", "cliente"),
      usuarioDeExemplo(5, "Equipe ClicouAí", "admin@exemplo.com", "admin"),
      usuarioDeExemplo(6, "Bruno Atendimento", "atendente@exemplo.com", "atendente"),
    ].map((u) => [u.id, u]),
  ),
  /** Chave: hash do token da sessão. */
  sessoes: new Map<string, Sessao>(),
  /** Chave: hash do token de confirmação de e-mail. */
  confirmacoes: new Map<string, Confirmacao>(),
}));
