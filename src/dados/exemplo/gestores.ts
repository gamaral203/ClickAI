import { createHash } from "node:crypto";

import { z } from "zod";

import type { UsuarioInterno } from "../tipos";

// Gestores (admins) da equipe, lidos da variável GESTORES: um JSON com e-mail, nome e o HASH
// da senha (scrypt, gerado por `npm run senha:hash`). A senha em texto nunca fica no código,
// no repositório nem na Vercel. Até a Fase 11 os usuários ficam em memória, então estas contas
// são recriadas a cada início do servidor; com o banco, viram uma migração inicial.

const gestor = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  nome: z.string().trim().min(1).max(100),
  senhaHash: z.string().regex(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/),
});

/** Id estável a partir do e-mail, para a sessão continuar valendo entre reinícios. */
function idDoEmail(email: string) {
  const h = createHash("sha256").update(`gestor:${email}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function lerGestores(valor: string | undefined, silencioso = false): UsuarioInterno[] {
  if (!valor?.trim()) return [];
  let lista: unknown;
  try {
    lista = JSON.parse(valor);
  } catch {
    if (!silencioso) console.error("GESTORES não é um JSON válido; nenhum gestor criado.");
    return [];
  }
  const dados = z.array(gestor).max(20).safeParse(lista);
  if (!dados.success) {
    if (!silencioso) console.error("GESTORES fora do formato esperado; nenhum gestor criado.");
    return [];
  }
  return dados.data.map((g) => ({
    id: idDoEmail(g.email),
    nome: g.nome,
    email: g.email,
    telefone: null,
    papel: "admin",
    senhaHash: g.senhaHash,
    googleId: null,
    emailConfirmadoEm: "2026-01-01T00:00:00.000Z",
    criadoEm: "2026-01-01T00:00:00.000Z",
  }));
}

/**
 * O e-mail é de um gestor de GESTORES? A senha dessas contas vem da variável e é regravada a cada
 * início do servidor (src/db/semente.ts, sincronizarGestores): trocada pela tela, voltaria a
 * antiga no próximo deploy. Por isso a troca de senha recusa essas contas.
 */
export function emailEhGestorDeAmbiente(email: string, valor = process.env.GESTORES) {
  const alvo = email.trim().toLowerCase();
  return lerGestores(valor, true).some((g) => g.email === alvo);
}
