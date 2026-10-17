import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import {
  CAMINHO_COOKIE_DRIVE,
  conexaoDriveConfigurada,
  COOKIE_DRIVE,
  iniciarConexaoDrive,
  VALIDADE_STATE_MS,
} from "@/servicos/conexao-drive";
import { limiteAtingido } from "@/servicos/limites";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { exigirGestor } from "@/servicos/sessao";

const TELA = "/admin/armazenamento";

/**
 * Começa a conexão da conta do Google Drive (protótipo de originais). Só gestor; o `state`
 * assinado, ligado ao gestor, vai num cookie HttpOnly curto e precisa voltar igual no callback.
 */
export async function GET(request: NextRequest) {
  // Gestores passam pela manutenção; a chamada fica para a rota seguir a regra das APIs.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const gestor = await exigirGestor(TELA);
  const voltar = (erro: string) =>
    Response.redirect(new URL(`${TELA}?erro=${erro}`, request.url), 303);

  if (!conexaoDriveConfigurada()) return voltar("nao_configurado");
  if (await limiteAtingido("drive_conexao_usuario", gestor.id)) return voltar("limite");

  const { url, state } = iniciarConexaoDrive(gestor.id);
  (await cookies()).set(COOKIE_DRIVE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" é o que deixa o cookie voltar no redirecionamento do Google para o callback.
    sameSite: "lax",
    path: CAMINHO_COOKIE_DRIVE,
    maxAge: VALIDADE_STATE_MS / 1000,
  });
  return Response.redirect(url, 303);
}
