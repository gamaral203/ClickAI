import type { NextRequest } from "next/server";
import { z } from "zod";

import { confirmarEmail } from "@/servicos/sessao";

const token = z.string().regex(/^[\w-]{20,100}$/);

/** Link do e-mail de confirmação. Confirma, vincula as compras de convidado e redireciona. */
export async function GET(request: NextRequest) {
  const dados = token.safeParse(request.nextUrl.searchParams.get("token"));
  const vinculados = dados.success ? await confirmarEmail(dados.data) : null;
  const destino = new URL("/minhas-compras", request.nextUrl.origin);
  destino.searchParams.set("confirmacao", vinculados === null ? "invalida" : String(vinculados));
  return Response.redirect(destino, 303);
}
