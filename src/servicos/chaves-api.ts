// Chaves de acesso do plugin do Lightroom (docs/arquitetura.md, "Plugin do Lightroom"). O
// fotógrafo gera a chave em Painel > Lightroom e cola no plugin; o plugin manda a chave no
// cabeçalho `Authorization: Bearer clk_...` de cada chamada às rotas /api/plugin/*. A chave é
// mostrada uma vez só: o banco guarda só o SHA-256 dela.

import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { criarChaveApi, donoDaChaveApi, type DonoDaChave } from "@/dados/chaves-api";
import { limiteDoIpAtingido } from "@/servicos/limites";

const PREFIXO_DA_CHAVE = "clk_";
/** Começo da chave mostrado na lista do painel, para o fotógrafo saber qual é qual. */
const TAMANHO_DO_PREFIXO = 10;
/** "clk_" + 32 bytes em base64url (43 caracteres). */
const FORMATO_DA_CHAVE = /^clk_[A-Za-z0-9_-]{43}$/;

function hashDaChave(chave: string) {
  return createHash("sha256").update(chave).digest("hex");
}

/**
 * Gera uma chave nova para o fotógrafo. Devolve a chave inteira (mostrada uma vez só no painel)
 * ou `null` se ele já tem o máximo de chaves ativas.
 */
export async function gerarChaveApi(
  fotografoId: string,
  nome: string,
): Promise<{ id: string; chave: string } | null> {
  const chave = PREFIXO_DA_CHAVE + randomBytes(32).toString("base64url");
  const criada = await criarChaveApi({
    fotografoId,
    nome,
    prefixo: chave.slice(0, TAMANHO_DO_PREFIXO),
    segredoHash: hashDaChave(chave),
  });
  return criada ? { id: criada.id, chave } : null;
}

export type FalhaDoPlugin = { erro: string; status: 401 | 429 };

/**
 * Fotógrafo da chave enviada pelo plugin, ou o erro para responder. Conta a chamada no limite
 * por IP antes de conferir a chave (quem tenta chaves ao acaso para no limite).
 */
export async function donoDaRequisicao(request: Request): Promise<DonoDaChave | FalhaDoPlugin> {
  if (await limiteDoIpAtingido("plugin_ip")) {
    return {
      erro: "Muitas chamadas seguidas. Espere alguns minutos e tente de novo.",
      status: 429,
    };
  }
  const cabecalho = request.headers.get("authorization") ?? "";
  const chave = /^Bearer\s+(\S+)$/i.exec(cabecalho)?.[1] ?? "";
  if (!FORMATO_DA_CHAVE.test(chave)) {
    return {
      erro: "Chave de acesso ausente ou inválida. Gere uma no painel do ClicouAí.",
      status: 401,
    };
  }
  const dono = await donoDaChaveApi(hashDaChave(chave));
  if (!dono) {
    return {
      erro: "Esta chave não vale mais (foi apagada ou a conta mudou). Gere outra no painel do ClicouAí.",
      status: 401,
    };
  }
  return dono;
}
