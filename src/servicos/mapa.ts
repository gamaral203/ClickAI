// Configuração do Google Maps para as telas (docs/arquitetura.md, "Local no mapa"). Só no
// servidor: lê a chave e o nonce da CSP desta requisição e passa os dois ao componente do mapa.
// Sem a chave, devolve `null` e as telas ficam como antes (sem botão de mapa nem mapa).

import "server-only";

import { headers } from "next/headers";

import type { ConfigMapa } from "@/lib/mapa";

export async function configDoMapa(): Promise<ConfigMapa | null> {
  const chave = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!chave) return null;
  return {
    chave,
    // O proxy.ts põe o nonce no cabeçalho x-nonce; o script do Google precisa dele para rodar.
    nonce: (await headers()).get("x-nonce"),
    // O marcador avançado exige um Map ID; sem um próprio, vale o de demonstração do Google.
    idDoMapa: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID",
  };
}
