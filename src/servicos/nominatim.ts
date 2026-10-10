// Busca de endereços no Nominatim (OpenStreetMap), só pelo servidor (docs/arquitetura.md,
// "Local no mapa"). O navegador nunca fala com o Nominatim: assim a CSP não libera nada em
// connect-src e dá para cumprir a política de uso dele
// (https://operations.osmfoundation.org/policies/nominatim/):
// - identificação pelo User-Agent (e o Referer com o APP_URL);
// - no máximo 1 requisição por segundo (fila por servidor, com folga de 100 ms);
// - nada de autocomplete: a tela só busca no Enter ou no botão "Buscar";
// - cache das respostas por 10 minutos (consultas repetidas não saem do servidor).
// O limite por IP (tabela `tentativas`) fica na Server Action (src/app/(fotografo)/painel/
// eventos/mapa-acoes.ts). A fila é por instância da função: com várias instâncias ao mesmo
// tempo o ritmo pode passar de 1/s por instantes; se o uso crescer, trocar por um provedor pago
// ou um Nominatim próprio (docs/deploy.md, item 9).

import "server-only";

import { lugarDoNominatim, type LugarNoMapa, type ResultadoNominatim } from "@/lib/mapa";

const BASE = "https://nominatim.openstreetmap.org";
export const USER_AGENT = "ClicouAI/1.0 (contato@clicouai.com)";

/** O Nominatim não respondeu, recusou (429, 5xx) ou a fila está cheia. */
export class NominatimIndisponivel extends Error {
  constructor(motivo: string) {
    super(`Nominatim indisponível: ${motivo}`);
    this.name = "NominatimIndisponivel";
  }
}

type Opcoes = {
  fetch?: typeof fetch;
  /** Intervalo mínimo entre duas requisições ao Nominatim. */
  intervaloMs?: number;
  cacheMs?: number;
  /** Requisições esperando a vez além desta quantidade são recusadas na hora. */
  filaMaxima?: number;
  tempoLimiteMs?: number;
  agora?: () => number;
};

export function clienteNominatim({
  fetch: buscar = (...args) => fetch(...args),
  intervaloMs = 1100,
  cacheMs = 10 * 60 * 1000,
  filaMaxima = 8,
  tempoLimiteMs = 8000,
  agora = Date.now,
}: Opcoes = {}) {
  const cache = new Map<string, { expira: number; valor: unknown }>();
  let fila: Promise<void> = Promise.resolve();
  let esperando = 0;
  let ultima = -Infinity;

  /** Espera a vez na fila: uma requisição por intervalo. */
  function aguardarVez(): Promise<void> {
    if (esperando >= filaMaxima) return Promise.reject(new NominatimIndisponivel("fila cheia"));
    esperando++;
    const vez = fila.then(async () => {
      const espera = ultima + intervaloMs - agora();
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      ultima = agora();
    });
    fila = vez.finally(() => {
      esperando--;
    });
    return vez;
  }

  async function consultar(caminho: string, parametros: Record<string, string>) {
    const url = `${BASE}${caminho}?${new URLSearchParams(parametros)}`;
    const guardado = cache.get(url);
    if (guardado && guardado.expira > agora()) return guardado.valor;

    await aguardarVez();
    let resposta: Response;
    try {
      resposta = await buscar(url, {
        headers: {
          "User-Agent": USER_AGENT,
          ...(process.env.APP_URL ? { Referer: process.env.APP_URL } : {}),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(tempoLimiteMs),
        cache: "no-store",
      });
    } catch {
      throw new NominatimIndisponivel("sem resposta");
    }
    if (!resposta.ok) throw new NominatimIndisponivel(`HTTP ${resposta.status}`);
    const valor: unknown = await resposta.json().catch(() => {
      throw new NominatimIndisponivel("resposta inválida");
    });
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(url, { expira: agora() + cacheMs, valor });
    return valor;
  }

  const comuns = { format: "jsonv2", addressdetails: "1", "accept-language": "pt-BR" };

  return {
    /** Até 6 lugares no Brasil para o texto digitado. */
    async buscarLugares(consulta: string): Promise<LugarNoMapa[]> {
      const resposta = await consultar("/search", {
        ...comuns,
        q: consulta.trim().replace(/\s+/g, " "),
        countrycodes: "br",
        limit: "6",
      });
      if (!Array.isArray(resposta)) return [];
      return (resposta as ResultadoNominatim[])
        .map(lugarDoNominatim)
        .filter((l): l is LugarNoMapa => l !== null);
    },

    /** Endereço de um ponto (reverso); `null` se não houver nada ali (mar, por exemplo). */
    async lugarNoPonto(latitude: number, longitude: number): Promise<LugarNoMapa | null> {
      // 6 casas (~10 cm) bastam e deixam o cache servir o mesmo ponto.
      const resposta = await consultar("/reverse", {
        ...comuns,
        lat: latitude.toFixed(6),
        lon: longitude.toFixed(6),
        zoom: "18",
      });
      if (!resposta || typeof resposta !== "object" || "error" in resposta) return null;
      const lugar = lugarDoNominatim(resposta as ResultadoNominatim);
      // O ponto marcado vale mais que o centro do lugar devolvido.
      return lugar && { ...lugar, latitude, longitude };
    },
  };
}

/** Cliente do servidor (uma fila e um cache por instância). */
export const nominatim = clienteNominatim();
