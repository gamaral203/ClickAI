"use client";

import { useEffect } from "react";

type Metrica =
  | { tipo: "visita_evento"; eventoId: string }
  | { tipo: "visita_foto"; fotoId: string }
  | { tipo: "carrinho"; fotoId: string };

/**
 * Envia a métrica sem segurar a página (sendBeacon). Visitas contam uma vez por aba: a mesma
 * pessoa recarregando não infla o número.
 */
export function enviarMetrica(metrica: Metrica) {
  const chave = `metrica:${JSON.stringify(metrica)}`;
  try {
    if (metrica.tipo !== "carrinho") {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    }
  } catch {
    // Sem sessionStorage (modo privado restrito): conta mesmo assim.
  }
  const corpo = new Blob([JSON.stringify(metrica)], { type: "application/json" });
  if (!navigator.sendBeacon?.("/api/metricas", corpo)) {
    void fetch("/api/metricas", { method: "POST", body: corpo, keepalive: true }).catch(() => {});
  }
}

/** Coloque na página para contar a visita. Não desenha nada. */
export function RegistrarVisita(props: { eventoId: string } | { fotoId: string }) {
  const ehEvento = "eventoId" in props;
  const id = ehEvento ? props.eventoId : props.fotoId;
  useEffect(() => {
    enviarMetrica(
      ehEvento ? { tipo: "visita_evento", eventoId: id } : { tipo: "visita_foto", fotoId: id },
    );
  }, [ehEvento, id]);
  return null;
}
