import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { COOKIE_GOOGLE, googleConfigurado, iniciarLoginGoogle } from "@/lib/google";
import { caminhoSeguro } from "@/lib/redirecionamento";

/**
 * Começa o login com o Google. `?proximo=` diz para onde voltar; `?vender=1` cria a conta como
 * fotógrafo (botão "Quero vender").
 */
export async function GET(request: NextRequest) {
  if (!googleConfigurado()) return Response.redirect(new URL("/entrar", request.url), 303);

  const proximo = request.nextUrl.searchParams.get("proximo");
  const { url, desafio } = iniciarLoginGoogle();
  (await cookies()).set(
    COOKIE_GOOGLE,
    JSON.stringify({
      ...desafio,
      proximo: proximo ? caminhoSeguro(proximo) : null,
      vender: request.nextUrl.searchParams.get("vender") === "1",
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // "lax" é o que deixa o cookie voltar no redirecionamento do Google para o callback.
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: 10 * 60,
    },
  );
  return Response.redirect(url, 303);
}
