import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { limparTentativas, registrarTentativa } from "@/dados";

// Limite de tentativas de login e cadastro (docs/riscos.md: senha por força bruta e cadastro em
// massa). A contagem fica no banco, para valer entre todos os servidores da Vercel. A chave é um
// HMAC de ação + IP (e e-mail): nem o IP nem o e-mail ficam gravados.

const MINUTO = 60 * 1000;

const REGRAS = {
  /** Por e-mail: quem tenta adivinhar a senha de uma conta. */
  login_email: { limite: 8, janelaMs: 15 * MINUTO },
  /** Por IP: quem testa muitas contas do mesmo lugar. */
  login_ip: { limite: 30, janelaMs: 15 * MINUTO },
  cadastro_ip: { limite: 5, janelaMs: 60 * MINUTO },
} as const;

type Regra = keyof typeof REGRAS;

async function ipDaRequisicao() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function chave(regra: Regra, valor: string) {
  // Sem APP_SECRET (só em desenvolvimento), um segredo fixo basta: a chave só precisa não
  // revelar o IP nem o e-mail de quem tentou.
  const segredo = process.env.APP_SECRET ?? "desenvolvimento";
  return createHmac("sha256", segredo).update(`${regra}:${valor.toLowerCase()}`).digest("hex");
}

/**
 * Conta uma tentativa de login. Devolve `true` se passou do limite: aí a ação recusa sem nem
 * conferir a senha.
 */
export async function loginBloqueado(email: string): Promise<boolean> {
  const ip = await ipDaRequisicao();
  const [porEmail, porIp] = await Promise.all([
    registrarTentativa(
      chave("login_email", email),
      REGRAS.login_email.limite,
      REGRAS.login_email.janelaMs,
    ),
    registrarTentativa(chave("login_ip", ip), REGRAS.login_ip.limite, REGRAS.login_ip.janelaMs),
  ]);
  return porEmail.bloqueado || porIp.bloqueado;
}

/** Login certo zera as tentativas daquele e-mail. */
export async function loginDeuCerto(email: string) {
  await limparTentativas(chave("login_email", email));
}

export async function cadastroBloqueado(): Promise<boolean> {
  const ip = await ipDaRequisicao();
  const { bloqueado } = await registrarTentativa(
    chave("cadastro_ip", ip),
    REGRAS.cadastro_ip.limite,
    REGRAS.cadastro_ip.janelaMs,
  );
  return bloqueado;
}
