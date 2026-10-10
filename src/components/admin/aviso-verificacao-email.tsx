import { connection } from "next/server";
import { TriangleAlert } from "lucide-react";

import { verificacaoPorEmailAtiva } from "@/servicos/codigo-login";
import { usuarioAtual } from "@/servicos/sessao";

/**
 * Aviso no topo da gestão enquanto o código por e-mail dos gestores está desligado (produção sem
 * o Resend: src/servicos/codigo-login.ts). Lê as variáveis a cada requisição e só aparece para o
 * gestor logado. Chamar dentro de <Suspense>.
 */
export async function AvisoVerificacaoEmail() {
  await connection();
  if (verificacaoPorEmailAtiva()) return null;
  const usuario = await usuarioAtual();
  if (usuario?.papel !== "admin") return null;
  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
      <p>
        <strong>Verificação por e-mail dos gestores inativa:</strong> configure RESEND_API_KEY e
        EMAIL_REMETENTE. Até lá, os gestores entram só com a senha (e o app autenticador, se
        ligado).
      </p>
    </div>
  );
}
