import * as Sentry from "@sentry/nextjs";

// Liga o Sentry no servidor (docs/tarefas.md, Fase 10). Sem SENTRY_DSN, fica desligado.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

/** Erros de renderização, Server Actions e rotas vão para o Sentry. */
export const onRequestError = Sentry.captureRequestError;
