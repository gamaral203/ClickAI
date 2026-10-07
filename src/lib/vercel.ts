import "server-only";

// Domínio próprio das lojas pela API de domínios da Vercel (docs/arquitetura.md, "Loja
// própria"). https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project
// Sem VERCEL_TOKEN e VERCEL_PROJECT_ID, funciona em modo simulado: conecta sem falar com a
// Vercel e, fora de produção, "verifica" na hora, para testar o fluxo.

const API = "https://api.vercel.com";

type ConfigVercel = { token: string; projeto: string; time: string | null };

function config(): ConfigVercel | null {
  const token = process.env.VERCEL_TOKEN;
  const projeto = process.env.VERCEL_PROJECT_ID;
  if (!token || !projeto) return null;
  return { token, projeto, time: process.env.VERCEL_TEAM_ID || null };
}

export function vercelConfigurada() {
  return config() !== null;
}

/** Registro DNS que a Vercel pede para provar que o domínio é de quem conectou. */
export type DesafioDns = { tipo: string; nome: string; valor: string };

export type SituacaoDominio = { verificado: boolean; desafios: DesafioDns[] };

export type ErroDominio = "em_uso" | "invalido" | "indisponivel";

type RespostaDominio = {
  verified?: boolean;
  verification?: { type: string; domain: string; value: string }[];
};

async function chamar(cfg: ConfigVercel, metodo: string, caminho: string, corpo?: object) {
  const url = new URL(`${API}${caminho}`);
  if (cfg.time) url.searchParams.set("teamId", cfg.time);
  return fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

function situacao(dados: RespostaDominio): SituacaoDominio {
  return {
    verificado: dados.verified === true,
    desafios: (dados.verification ?? []).map((v) => ({
      tipo: v.type,
      nome: v.domain,
      valor: v.value,
    })),
  };
}

/** Adiciona o domínio ao projeto da Vercel. */
export async function conectarDominio(
  dominio: string,
): Promise<{ ok: true; situacao: SituacaoDominio } | { ok: false; erro: ErroDominio }> {
  const cfg = config();
  if (!cfg) return { ok: true, situacao: { verificado: false, desafios: [] } };
  const resposta = await chamar(cfg, "POST", `/v10/projects/${cfg.projeto}/domains`, {
    name: dominio,
  }).catch(() => null);
  if (!resposta) return { ok: false, erro: "indisponivel" };
  if (resposta.status === 409) return { ok: false, erro: "em_uso" };
  if (resposta.status === 400) return { ok: false, erro: "invalido" };
  if (!resposta.ok) {
    console.error("Vercel recusou o domínio", resposta.status);
    return { ok: false, erro: "indisponivel" };
  }
  return { ok: true, situacao: situacao((await resposta.json()) as RespostaDominio) };
}

/** Pede à Vercel para conferir o DNS do domínio já conectado. */
export async function verificarDominio(dominio: string): Promise<SituacaoDominio | null> {
  const cfg = config();
  if (!cfg) {
    // Simulado: em desenvolvimento, verifica na hora; em produção, nunca sem a Vercel.
    return { verificado: process.env.NODE_ENV !== "production", desafios: [] };
  }
  const resposta = await chamar(
    cfg,
    "POST",
    `/v9/projects/${cfg.projeto}/domains/${encodeURIComponent(dominio)}/verify`,
  ).catch(() => null);
  if (!resposta) return null;
  const dados = (await resposta.json().catch(() => ({}))) as RespostaDominio;
  // Ainda sem o DNS certo, a Vercel responde erro: o domínio continua não verificado.
  return resposta.ok ? situacao(dados) : { verificado: false, desafios: situacao(dados).desafios };
}

/** Tira o domínio do projeto. Domínio que já não estava lá conta como removido. */
export async function desconectarDominio(dominio: string): Promise<boolean> {
  const cfg = config();
  if (!cfg) return true;
  const resposta = await chamar(
    cfg,
    "DELETE",
    `/v9/projects/${cfg.projeto}/domains/${encodeURIComponent(dominio)}`,
  ).catch(() => null);
  return Boolean(resposta && (resposta.ok || resposta.status === 404));
}
