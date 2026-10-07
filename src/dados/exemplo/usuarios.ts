// Usuários de exemplo, gravados pela semente do banco (src/db/semente.ts). Todos usam a senha
// "clicouai123". A conta de exemplo da equipe (gestor) não entra na produção da Vercel, porque a
// senha dela é pública (README): lá a equipe entra pelas contas de GESTORES.

import { gerarHashSenha } from "@/lib/senha";

import type { UsuarioInterno } from "../tipos";

export const SENHA_DE_EXEMPLO = "clicouai123";

function usuarioDeExemplo(
  n: number,
  nome: string,
  email: string,
  papel: UsuarioInterno["papel"],
  senhaHash: string,
): UsuarioInterno {
  return {
    id: `05e70000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    nome,
    email,
    telefone: null,
    papel,
    senhaHash,
    googleId: null,
    emailConfirmadoEm: "2026-01-01T00:00:00.000Z",
    criadoEm: "2026-01-01T00:00:00.000Z",
  };
}

/** Os três primeiros são os donos dos fotógrafos de exemplo (mesmo usuarioId). */
export function usuariosDeExemplo(incluirEquipe: boolean): UsuarioInterno[] {
  const senhaHash = gerarHashSenha(SENHA_DE_EXEMPLO);
  return [
    usuarioDeExemplo(1, "Lia Ramos", "lia@exemplo.com", "fotografo", senhaHash),
    usuarioDeExemplo(2, "Pedro Kenji", "pedro@exemplo.com", "fotografo", senhaHash),
    usuarioDeExemplo(3, "Equipe Clique Esportes", "clique@exemplo.com", "fotografo", senhaHash),
    usuarioDeExemplo(4, "Ana Souza", "ana@exemplo.com", "cliente", senhaHash),
    ...(incluirEquipe
      ? [usuarioDeExemplo(5, "Equipe ClicouAí", "admin@exemplo.com", "admin", senhaHash)]
      : []),
  ];
}
