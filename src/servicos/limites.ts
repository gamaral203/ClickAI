import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { limparTentativas, registrarTentativa } from "@/dados";

// Limites de tentativas (docs/riscos.md: senha por força bruta, cadastro em massa, custo da busca
// facial, spam de e-mail e abuso de URL assinada). A contagem fica no banco (tabela
// `tentativas`), para valer entre todos os servidores da Vercel: um contador na memória de cada
// função não seguraria nada. A chave é um HMAC de regra + IP (ou id do usuário, ou e-mail):
// nem o IP nem o e-mail ficam gravados. Nada do conteúdo da requisição entra na chave (a selfie
// da busca facial, por exemplo, nunca passa por aqui).

const MINUTO = 60 * 1000;

const REGRAS = {
  /** Por e-mail: quem tenta adivinhar a senha de uma conta. */
  login_email: { limite: 8, janelaMs: 15 * MINUTO },
  /** Por IP: quem testa muitas contas do mesmo lugar. */
  login_ip: { limite: 30, janelaMs: 15 * MINUTO },
  cadastro_ip: { limite: 5, janelaMs: 60 * MINUTO },
  /** Reenvio do e-mail de confirmação, por usuário (cada reenvio manda um e-mail pelo Resend). */
  email_confirmacao_usuario: { limite: 3, janelaMs: 60 * MINUTO },
  /** Busca por selfie, por IP: cada busca custa uma chamada ao provedor de reconhecimento. */
  busca_facial_ip: { limite: 10, janelaMs: 10 * MINUTO },
  /** Senha de evento protegido, por IP e evento (força bruta). */
  senha_evento_ip: { limite: 8, janelaMs: 15 * MINUTO },
  /**
   * Pedidos criados por IP. Cada pedido gera uma cobrança no Mercado Pago e e-mails (lembrete do
   * Pix, carrinho abandonado) para o endereço digitado: sem limite, viraria canal de spam.
   */
  checkout_ip: { limite: 20, janelaMs: 60 * MINUTO },
  /** Denúncias por IP (cada uma confirma o recebimento por e-mail ao denunciante). */
  denuncia_ip: { limite: 5, janelaMs: 60 * MINUTO },
  /**
   * Lotes de URLs assinadas de envio (até 25 fotos cada) por fotógrafo. 300 lotes em 10 minutos
   * são 7.500 fotos: folga para um evento grande, mas segura um script descontrolado.
   */
  url_envio_usuario: { limite: 300, janelaMs: 10 * MINUTO },
  /**
   * URLs assinadas de download por IP. 600 em 10 minutos cobre quem baixa um pacote grande foto
   * a foto, mas não quem tenta varrer ids ou tokens.
   */
  url_download_ip: { limite: 600, janelaMs: 10 * MINUTO },
} as const;

export type Regra = keyof typeof REGRAS;

/** IP de quem fez a requisição (a Vercel preenche x-forwarded-for e x-real-ip). */
export async function ipDaRequisicao() {
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
 * Conta uma tentativa da regra para o valor (IP, id do usuário...) e devolve `true` se passou do
 * limite na janela. A tentativa recusada não entra na contagem.
 */
export async function limiteAtingido(regra: Regra, valor: string): Promise<boolean> {
  const { limite, janelaMs } = REGRAS[regra];
  const { bloqueado } = await registrarTentativa(chave(regra, valor), limite, janelaMs);
  return bloqueado;
}

/** Mesmo que limiteAtingido, pelo IP da requisição atual (com um complemento opcional). */
export async function limiteDoIpAtingido(regra: Regra, complemento = ""): Promise<boolean> {
  const ip = await ipDaRequisicao();
  return limiteAtingido(regra, complemento ? `${ip}:${complemento}` : ip);
}

/**
 * Conta uma tentativa de login. Devolve `true` se passou do limite: aí a ação recusa sem nem
 * conferir a senha.
 */
export async function loginBloqueado(email: string): Promise<boolean> {
  const [porEmail, porIp] = await Promise.all([
    limiteAtingido("login_email", email),
    limiteDoIpAtingido("login_ip"),
  ]);
  return porEmail || porIp;
}

/** Login certo zera as tentativas daquele e-mail. */
export async function loginDeuCerto(email: string) {
  await limparTentativas(chave("login_email", email));
}

export async function cadastroBloqueado(): Promise<boolean> {
  return limiteDoIpAtingido("cadastro_ip");
}
