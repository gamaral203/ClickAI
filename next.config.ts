import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Headers de segurança aplicados a todas as rotas (ver docs/skills.md, vibe-code-security).
// A CSP completa de scripts (com nonce) fica para depois, quando os scripts do gateway e do
// Sentry estiverem definidos; por enquanto só as diretivas que não quebram nada.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** Domínio próprio do bucket público, se R2_URL_PUBLICA não for um r2.dev. */
function dominioPublicoDoR2() {
  try {
    const url = new URL(process.env.R2_URL_PUBLICA ?? "");
    if (url.hostname.endsWith(".r2.dev")) return [];
    return [{ protocol: "https" as const, hostname: url.hostname, pathname: "/**" }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // O PGlite (banco em memória do desenvolvimento e dos testes) carrega os próprios arquivos
  // WebAssembly do node_modules: não pode ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Já é o padrão do Next.js; fica explícito para ninguém ligar sem querer.
  productionBrowserSourceMaps: false,
  images: {
    // As prévias e miniaturas já são geradas otimizadas no upload e servidas pela CDN da
    // Cloudflare; o otimizador da Vercel só aumentaria a conta (docs/riscos.md, Custos).
    unoptimized: true,
    // Bucket público do R2 (prévias e miniaturas). O build não depende de R2_URL_PUBLICA: sem
    // ela, vale só o r2.dev.
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.dev", pathname: "/**" },
      ...dominioPublicoDoR2(),
    ],
  },
  // A marca d'água das prévias usa public/logo.png, lida do disco por src/servicos/imagens.ts
  // nas Server Actions de envio do painel; sem isto, o arquivo não vai para a função da Vercel.
  outputFileTracingIncludes: {
    "/painel/**": ["./public/logo.png"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Sentry: com SENTRY_AUTH_TOKEN (no deploy), envia os source maps ao Sentry e apaga os
// arquivos .map do build, para não ficarem públicos (productionBrowserSourceMaps segue false).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  telemetry: false,
});
