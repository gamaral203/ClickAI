/**
 * Resultado da busca por selfie lembrado na aba (sessionStorage), por evento: recarregar a página
 * ou voltar da página de uma foto mostra as mesmas fotos sem pedir outra selfie nem pagar outra
 * chamada ao reconhecimento facial.
 *
 * Só o resultado: as fotos encontradas (os mesmos dados públicos que a busca já mostra, com as
 * prévias e miniaturas com marca d'água), a oferta do pacote e o horário. NUNCA a selfie nem
 * nada tirado dela (docs/CLAUDE.md): nem os bytes, nem a semelhança, nem a posição do rosto em
 * cada foto (por isso, na volta, as fotos aparecem inteiras, sem o zoom no rosto). O resultado
 * vence em VALIDADE_DA_BUSCA_MS; depois disso, nova busca. Sem sessionStorage (modo privado
 * restrito, cota cheia), nada é lembrado e a busca funciona como antes.
 */

import type { Foto } from "@/dados/tipos";
import type { OfertaPacote } from "@/servicos/pacotes";

/** Por quanto tempo o resultado vale na aba. */
export const VALIDADE_DA_BUSCA_MS = 30 * 60 * 1000;
/** Acima disso (milhares de fotos encontradas), não guarda: a cota da aba é de poucos MB. */
const TAMANHO_MAXIMO = 2_000_000;
const PREFIXO = "clicouai:busca-selfie:";

export type ResultadoGuardado = {
  fotos: Foto[];
  pacote: OfertaPacote | null;
  /** Quando a busca foi feita (ms). */
  em: number;
};

type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function armazenamento(): Armazenamento | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const chave = (slug: string) => PREFIXO + slug;

function fotoValida(f: unknown): f is Foto {
  if (!f || typeof f !== "object") return false;
  const foto = f as Record<string, unknown>;
  return (
    typeof foto.id === "string" &&
    typeof foto.eventoId === "string" &&
    typeof foto.urlPrevia === "string" &&
    typeof foto.urlMiniatura === "string"
  );
}

/** Resultado ainda válido da última busca por selfie neste evento, nesta aba. */
export function lerResultado(
  slug: string,
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
): ResultadoGuardado | null {
  try {
    const bruto = guarda?.getItem(chave(slug));
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as Partial<ResultadoGuardado>;
    const valido =
      typeof dados?.em === "number" &&
      Array.isArray(dados.fotos) &&
      dados.fotos.every(fotoValida) &&
      (dados.pacote === null || typeof dados.pacote === "object");
    if (!valido || agora - dados.em! > VALIDADE_DA_BUSCA_MS || dados.em! > agora + 60_000) {
      guarda?.removeItem(chave(slug));
      return null;
    }
    return { fotos: dados.fotos!, pacote: dados.pacote ?? null, em: dados.em! };
  } catch {
    return null;
  }
}

/**
 * Guarda o resultado da busca. Recebe só as fotos e o pacote: o que mais vier junto (a posição
 * do rosto, por exemplo) fica de fora.
 */
export function guardarResultado(
  slug: string,
  resultado: { fotos: Foto[]; pacote: OfertaPacote | null },
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
) {
  try {
    const texto = JSON.stringify({ fotos: resultado.fotos, pacote: resultado.pacote, em: agora });
    if (texto.length > TAMANHO_MAXIMO) {
      guarda?.removeItem(chave(slug));
      return;
    }
    guarda?.setItem(chave(slug), texto);
  } catch {
    // Sem espaço ou sem sessionStorage: a busca só não é lembrada.
  }
}

export function esquecerResultado(slug: string, guarda: Armazenamento | null = armazenamento()) {
  try {
    guarda?.removeItem(chave(slug));
  } catch {}
}
