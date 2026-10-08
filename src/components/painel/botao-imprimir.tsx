"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Abre a impressão do navegador, onde se escolhe "Salvar como PDF". */
export function BotaoImprimir() {
  return (
    <Button size="touch" onClick={() => window.print()} className="print:hidden">
      <Download aria-hidden="true" data-icon="inline-start" />
      Baixar PDF
    </Button>
  );
}
