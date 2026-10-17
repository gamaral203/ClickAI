import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import {
  CAMINHO_COOKIE_DRIVE,
  concluirConexaoDrive,
  conexaoDriveConfigurada,
  COOKIE_DRIVE,
  stateDriveValido,
} from "@/servicos/conexao-drive";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { exigirGestor } from "@/servicos/sessao";

const TELA = "/admin/armazenamento";

/**
 * Volta do Google: confere o `state` com o cookie (uso único) e com o gestor logado, troca o
 * código, grava a credencial cifrada e cria a pasta raiz. O erro volta à tela só como um código
 * curto; código e tokens nunca vão a log nem à URL.
 */
export async function GET(request: NextRequest) {
  const loja = await cookies();
  const salvo = loja.get(COOKIE_DRIVE)?.value;
  // O state é de uso único: some antes de qualquer outra coisa.
  loja.delete({ name: COOKIE_DRIVE, path: CAMINHO_COOKIE_DRIVE });

  // Gestores passam pela manutenção; a chamada fica para a rota seguir a regra das APIs.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;

  const gestor = await exigirGestor(TELA);
  const voltar = (consulta: string) =>
    Response.redirect(new URL(`${TELA}?${consulta}`, request.url), 303);

  if (!conexaoDriveConfigurada()) return voltar("erro=nao_configurado");
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  // State diferente: a volta não começou neste navegador, para este gestor, nos últimos 10 min.
  if (!stateDriveValido(state, salvo, gestor.id)) return voltar("erro=state");
  // O gestor recusou no Google (access_denied) ou o Google devolveu outro erro.
  if (params.get("error")) return voltar("erro=negado");
  const code = params.get("code");
  if (!code) return voltar("erro=state");

  const erro = await concluirConexaoDrive(code, gestor.id);
  return voltar(erro ? `erro=${erro}` : "ok=conectado");
}
