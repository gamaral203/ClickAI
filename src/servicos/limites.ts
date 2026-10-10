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
  /**
   * Cadastros por IP. Não pode ser baixo: na operadora de celular (CGNAT) e no Wi-Fi de um
   * evento, muita gente sai pelo mesmo IP, e com 5 por hora o sexto corredor a criar conta via
   * "Muitos cadastros seguidos daqui". 20 por hora ainda segura a criação de contas em massa.
   */
  cadastro_ip: { limite: 20, janelaMs: 60 * MINUTO },
  /**
   * Códigos de confirmação do e-mail enviados por e-mail de destino (cadastro, reenvio e login de
   * conta não confirmada; cada um manda um e-mail pelo Resend). Além disso, o reenvio espera 60
   * segundos (src/servicos/confirmacao-email.ts).
   */
  codigo_email_envio_email: { limite: 5, janelaMs: 60 * MINUTO },
  /** Códigos de confirmação enviados por IP: contagem própria, separada da do cadastro. */
  codigo_email_envio_ip: { limite: 20, janelaMs: 60 * MINUTO },
  /**
   * Códigos de confirmação digitados por IP. Cada código já aceita só 5 tentativas; este limite
   * segura quem tenta adivinhar códigos de muitos e-mails do mesmo lugar.
   */
  codigo_email_conferencia_ip: { limite: 30, janelaMs: 15 * MINUTO },
  /**
   * Códigos de acesso do gestor enviados por conta (login e reenvios; cada um manda um e-mail).
   * Além disso, cada login pendente aceita só 3 reenvios, com 60 segundos de espera entre eles
   * (src/servicos/codigo-login.ts).
   */
  codigo_login_envio_usuario: { limite: 10, janelaMs: 60 * MINUTO },
  /** Códigos de acesso do gestor enviados por IP. */
  codigo_login_envio_ip: { limite: 20, janelaMs: 60 * MINUTO },
  /**
   * Códigos digitados na segunda etapa do login (/entrar/codigo), por IP: do e-mail do gestor ou
   * do app autenticador. Cada código do e-mail já aceita só 5 tentativas.
   */
  codigo_login_conferencia_ip: { limite: 30, janelaMs: 15 * MINUTO },
  /** "Esqueci a senha" por e-mail de destino (cada pedido pode mandar um e-mail). */
  esqueci_senha_email: { limite: 3, janelaMs: 60 * MINUTO },
  /** "Esqueci a senha" por IP. */
  esqueci_senha_ip: { limite: 10, janelaMs: 60 * MINUTO },
  /** Senhas novas enviadas com um link de redefinição, por IP (força bruta no token). */
  redefinir_senha_ip: { limite: 20, janelaMs: 15 * MINUTO },
  /** Busca por selfie, por IP: cada busca custa uma chamada ao provedor de reconhecimento. */
  busca_facial_ip: { limite: 10, janelaMs: 10 * MINUTO },
  /** Senha de evento protegido, por IP e evento (força bruta). */
  senha_evento_ip: { limite: 8, janelaMs: 15 * MINUTO },
  /**
   * Pedidos criados por IP. Cada pedido gera uma cobrança no Mercado Pago e e-mails (lembrete do
   * Pix, carrinho abandonado) para o endereço digitado: sem limite, viraria canal de spam.
   */
  checkout_ip: { limite: 20, janelaMs: 60 * MINUTO },
  /**
   * Tentativas de pagamento com cartão por IP. Segura o "teste de cartão" (quem tem cartões
   * roubados e usa o checkout para descobrir quais passam), que gera chargeback e pode fazer o
   * Mercado Pago bloquear a conta.
   */
  cartao_ip: { limite: 10, janelaMs: 60 * MINUTO },
  /** QR Codes Pix gerados de novo na página do pedido, por IP (cada um chama o Mercado Pago). */
  pix_ip: { limite: 30, janelaMs: 60 * MINUTO },
  /** Denúncias por IP (cada uma confirma o recebimento por e-mail ao denunciante). */
  denuncia_ip: { limite: 5, janelaMs: 60 * MINUTO },
  /** Pedidos de remoção de foto (LGPD) por IP; cada um também confirma por e-mail. */
  remocao_ip: { limite: 5, janelaMs: 60 * MINUTO },
  /**
   * Lotes de URLs assinadas de envio (até 50 fotos cada, FOTOS_POR_LOTE) por fotógrafo. Não
   * limita quantas fotos o evento tem: 300 lotes em 10 minutos são 15.000 fotos, mais do que
   * qualquer conexão sobe nesse tempo, mas segura um script descontrolado.
   */
  url_envio_usuario: { limite: 300, janelaMs: 10 * MINUTO },
  /**
   * URLs assinadas de download por IP. 600 em 10 minutos cobre quem baixa um pacote grande foto
   * a foto, mas não quem tenta varrer ids ou tokens.
   */
  url_download_ip: { limite: 600, janelaMs: 10 * MINUTO },
  /**
   * Códigos da verificação em duas etapas, por usuário (login, saque, troca de CPF/CNPJ). O
   * código tem 6 dígitos: 6 tentativas a cada 15 minutos deixam a chance de acertar no chute
   * perto de zero. Código certo zera a contagem.
   */
  mfa_usuario: { limite: 6, janelaMs: 15 * MINUTO },
  /**
   * Métricas (visitas e carrinhos) por IP. Cada uma grava no banco; o limite segura um script
   * inflando o painel de um fotógrafo.
   */
  metricas_ip: { limite: 300, janelaMs: 10 * MINUTO },
  /** Mensagens do chat de ajuda por usuário (cada uma avisa a gestão por e-mail e notificação). */
  suporte_usuario: { limite: 30, janelaMs: 60 * MINUTO },
  /** Sugestões de melhoria por usuário. */
  sugestao_usuario: { limite: 10, janelaMs: 60 * MINUTO },
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

/** Zera a contagem de uma regra para o valor (ex.: código certo da verificação em duas etapas). */
export async function zerarTentativas(regra: Regra, valor: string) {
  await limparTentativas(chave(regra, valor));
}
