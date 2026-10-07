"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "./globals.css";

// Erro que derrubou até o layout raiz: registra no Sentry e mostra uma página mínima, com o
// próprio <html>, porque o layout não chegou a renderizar.
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">Algo deu errado</h1>
        <p className="max-w-md text-muted-foreground">
          Já fomos avisados do problema. Tente de novo; se continuar, volte daqui a pouco.
        </p>
        <button
          type="button"
          onClick={reset}
          className="h-11 rounded-lg bg-primary px-5 font-medium text-primary-foreground"
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
