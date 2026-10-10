"use server";

import { z } from "zod";

import { LIMITES_MAPA, MENSAGEM_BUSCA_INDISPONIVEL, type LugarNoMapa } from "@/lib/mapa";
import { limiteDoIpAtingido } from "@/servicos/limites";
import { nominatim } from "@/servicos/nominatim";
import { exigirFotografo } from "@/servicos/sessao";

// Busca de endereço do "Escolher no mapa" (docs/arquitetura.md, "Local no mapa"). O navegador
// chama estas ações; só o servidor fala com o Nominatim (src/servicos/nominatim.ts).

type Resposta<T> = { ok: true; valor: T } | { ok: false; erro: string };

const consultaSchema = z.string().trim().min(3).max(LIMITES_MAPA.consulta);
const pontoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

async function podeConsultar(): Promise<string | null> {
  await exigirFotografo("/painel/eventos");
  if (await limiteDoIpAtingido("mapa_ip")) {
    return "Muitas buscas seguidas. Espere alguns minutos, ou marque o ponto no mapa.";
  }
  return null;
}

/** Até 6 lugares no Brasil para o texto digitado (Enter ou "Buscar"; nunca a cada tecla). */
export async function buscarEnderecoAcao(consulta: string): Promise<Resposta<LugarNoMapa[]>> {
  const texto = consultaSchema.safeParse(consulta);
  if (!texto.success) return { ok: false, erro: "Digite pelo menos 3 letras para buscar." };
  const bloqueio = await podeConsultar();
  if (bloqueio) return { ok: false, erro: bloqueio };
  try {
    return { ok: true, valor: await nominatim.buscarLugares(texto.data) };
  } catch (erro) {
    console.warn("[mapa] busca falhou", erro instanceof Error ? erro.message : erro);
    return { ok: false, erro: MENSAGEM_BUSCA_INDISPONIVEL };
  }
}

/** Endereço do ponto marcado ou arrastado no mapa; `null` se não houver endereço ali. */
export async function enderecoDoPontoAcao(
  latitude: number,
  longitude: number,
): Promise<Resposta<LugarNoMapa | null>> {
  const ponto = pontoSchema.safeParse({ latitude, longitude });
  if (!ponto.success) return { ok: false, erro: MENSAGEM_BUSCA_INDISPONIVEL };
  const bloqueio = await podeConsultar();
  if (bloqueio) return { ok: false, erro: bloqueio };
  try {
    const { latitude: lat, longitude: lng } = ponto.data;
    return { ok: true, valor: await nominatim.lugarNoPonto(lat, lng) };
  } catch (erro) {
    console.warn("[mapa] endereço do ponto falhou", erro instanceof Error ? erro.message : erro);
    return { ok: false, erro: MENSAGEM_BUSCA_INDISPONIVEL };
  }
}
