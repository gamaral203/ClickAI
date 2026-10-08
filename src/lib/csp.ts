// Content Security Policy do site (docs/arquitetura.md, "Segurança"; docs/riscos.md, script na
// loja própria). Montada a cada requisição pelo proxy.ts, com um nonce novo: só roda script que
// o próprio Next.js marcou com esse nonce, e o que esses scripts carregarem ('strict-dynamic').
// Um script injetado (XSS, HTML colado na loja) não tem o nonce e é bloqueado.
//
// Scripts de terceiros que o site usa e de onde eles falam:
// - Mercado Pago (Card Payment Brick): sdk.mercadopago.com, que carrega o resto de
//   http2.mlstatic.com e abre os campos do cartão em iframes do Mercado Pago/Mercado Livre;
// - Sentry no navegador: só envia eventos (connect-src para o host da DSN);
// - Google Analytics e Tag Manager das lojas, pelo ID (www.googletagmanager.com e
//   *.google-analytics.com). Tag "HTML personalizado" do GTM fica bloqueada de propósito: é o
//   mesmo que deixar o fotógrafo colar script na loja.
// Estilo continua com 'unsafe-inline': o site usa atributos style (cores da loja, barras de
// progresso) e o Brick injeta CSS; estilo não executa código.

const MERCADO_PAGO = [
  "https://*.mercadopago.com",
  "https://*.mercadopago.com.br",
  "https://*.mercadolibre.com",
  "https://*.mercadolivre.com",
  "https://*.mercadolivre.com.br",
  "https://http2.mlstatic.com",
];
const GOOGLE_ANALYTICS = [
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
];
/** Hosts de ingestão do Sentry (a DSN é do tipo https://chave@o123.ingest.us.sentry.io/456). */
const SENTRY_PADRAO = ["https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io"];

function hostDoSentry(dsn: string | undefined): string[] {
  if (!dsn) return [];
  try {
    return [`https://${new URL(dsn).host}`];
  } catch {
    return SENTRY_PADRAO;
  }
}

/** Nonce de 128 bits em base64, novo a cada requisição. */
export function gerarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function politicaDeSeguranca({
  nonce,
  desenvolvimento = false,
  https = false,
  sentryDsn,
}: {
  nonce: string;
  desenvolvimento?: boolean;
  /** Só com https a política pede para trocar http por https (em localhost quebraria). */
  https?: boolean;
  sentryDsn?: string;
}): string {
  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Com 'strict-dynamic', navegadores atuais ignoram a lista de hosts e 'self'; os hosts
    // ficam para navegadores antigos, que só entendem a lista.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https://sdk.mercadopago.com",
      "https://http2.mlstatic.com",
      "https://www.googletagmanager.com",
      // O React usa eval só em desenvolvimento, para montar as pilhas de erro do servidor.
      ...(desenvolvimento ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Fotos e prévias vêm do R2 (r2.dev ou domínio próprio), fotos de exemplo de outros hosts,
    // QR Code do Pix em data:, bandeiras do cartão do Mercado Pago e pixels do GA.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https://http2.mlstatic.com"],
    "connect-src": [
      "'self'",
      // Upload direto do navegador ao R2 por URL assinada.
      "https://*.r2.cloudflarestorage.com",
      ...MERCADO_PAGO,
      ...GOOGLE_ANALYTICS,
      ...hostDoSentry(sentryDsn),
      // Recarregamento ao vivo do next dev.
      ...(desenvolvimento ? ["ws:", "wss:"] : []),
    ],
    "frame-src": ["'self'", ...MERCADO_PAGO, "https://www.googletagmanager.com"],
    "media-src": ["'self'", "blob:", "https:"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const texto = Object.entries(diretivas).map(([nome, valores]) => `${nome} ${valores.join(" ")}`);
  if (https) texto.push("upgrade-insecure-requests");
  return texto.join("; ");
}
