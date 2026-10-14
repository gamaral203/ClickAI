import "server-only";

import type { DonoDaChave } from "@/dados/chaves-api";
import { donoDaRequisicao } from "@/servicos/chaves-api";

// Partes comuns das rotas do plugin do Lightroom (/api/plugin/*, docs/arquitetura.md, "Plugin do
// Lightroom"). O plugin não tem o cookie de sessão nem roda no navegador: entra pela chave de
// acesso no cabeçalho `Authorization`, por isso estas rotas não conferem a origem (não há
// cookie para um site de terceiros aproveitar).

/** Versão da API do plugin: o plugin confere e avisa o fotógrafo para atualizar se mudar. */
export const VERSAO_DA_API = 1;

export function resposta(dados: object, status = 200) {
  return Response.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}

/** Lê o corpo JSON (até `maximo` caracteres); `null` se não for JSON ou passar do tamanho. */
export async function corpoJson(request: Request, maximo: number): Promise<unknown> {
  const texto = await request.text().catch(() => "");
  if (texto.length > maximo) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Confere a chave e chama `fazer` com o fotógrafo dono dela, ou responde o erro. */
export async function comChave(
  request: Request,
  fazer: (dono: DonoDaChave) => Promise<Response>,
): Promise<Response> {
  const dono = await donoDaRequisicao(request);
  if ("erro" in dono) return resposta({ erro: dono.erro }, dono.status);
  return fazer(dono);
}
