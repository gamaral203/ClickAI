import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { COOKIE_GOOGLE, concluirLoginGoogle } from "@/lib/google";
import { destinoDoCadastro } from "@/lib/redirecionamento";
import { entrarComGoogle, inicioDoPapel } from "@/servicos/sessao";

const desafio = z.object({
  state: z.string().min(20),
  verificador: z.string().min(20),
  proximo: z.string().nullable(),
  vender: z.boolean(),
});

function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Volta do Google: confere o state, troca o código e abre a sessão. */
export async function GET(request: NextRequest) {
  const loja = await cookies();
  const bruto = loja.get(COOKIE_GOOGLE)?.value;
  // O desafio é de uso único: some antes de qualquer outra coisa.
  loja.delete({ name: COOKIE_GOOGLE, path: "/api/auth/google" });

  const erro = (motivo: string) =>
    Response.redirect(new URL(`/entrar?erro=${motivo}`, request.url), 303);

  const params = request.nextUrl.searchParams;
  const codigo = params.get("code");
  const state = params.get("state");
  let salvo: z.infer<typeof desafio> | null = null;
  try {
    salvo = desafio.parse(JSON.parse(bruto ?? ""));
  } catch {
    salvo = null;
  }
  // State diferente: a volta não começou neste navegador (proteção contra CSRF de login).
  if (!salvo || !codigo || !state || !iguais(state, salvo.state)) return erro("google");

  try {
    const perfil = await concluirLoginGoogle(codigo, salvo.verificador);
    if (!perfil) return erro("google");
    const resultado = await entrarComGoogle(perfil, salvo.vender);
    if (!resultado.ok) return erro("google_outra_conta");
    // Conta nova vai para a tela principal (ou volta ao fotógrafo); login segue para a sua área.
    const destino = resultado.novo
      ? destinoDoCadastro(salvo.proximo, resultado.usuario.papel)
      : (salvo.proximo ?? inicioDoPapel(resultado.usuario.papel));
    return Response.redirect(new URL(destino, request.url), 303);
  } catch (falha) {
    console.error("Falha no login com Google", falha);
    return erro("google");
  }
}
