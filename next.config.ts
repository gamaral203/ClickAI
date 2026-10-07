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

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Já é o padrão do Next.js; fica explícito para ninguém ligar sem querer.
  productionBrowserSourceMaps: false,
  images: {
    // As prévias e miniaturas já são geradas otimizadas no upload e servidas pela CDN da
    // Cloudflare; o otimizador da Vercel só aumentaria a conta (docs/riscos.md, Custos).
    unoptimized: true,
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
