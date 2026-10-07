"use client";

import { useSyncExternalStore } from "react";

// Carrinho no navegador (docs/arquitetura.md, "Compra e pagamento"). Guarda só os ids dos
// itens e os tokens dos pacotes escolhidos: preço, desconto e disponibilidade vêm sempre do
// servidor, que recalcula tudo e confere a assinatura de cada pacote.

const CHAVE = "clicouai:carrinho";
const CHAVE_PACOTES = "clicouai:pacotes";
const EVENTO_MUDANCA = "clicouai:carrinho-mudou";
/** Limite de itens; o servidor aplica o mesmo limite. */
export const MAXIMO_ITENS = 200;
const MAXIMO_PACOTES = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PacoteNoCarrinho = { eventoId: string; token: string };

/**
 * Lista guardada no localStorage, lida com validação e com a mesma referência enquanto nada
 * mudar, como o useSyncExternalStore exige.
 */
function lista<T>(chave: string, valido: (v: unknown) => v is T, limite: number) {
  const vazio: readonly T[] = Object.freeze([]);
  let cache: { bruto: string | null; valores: readonly T[] } = { bruto: null, valores: vazio };

  function ler(): readonly T[] {
    let bruto: string | null = null;
    try {
      bruto = localStorage.getItem(chave);
    } catch {
      return vazio;
    }
    if (bruto === cache.bruto) return cache.valores;
    let valores: readonly T[] = vazio;
    try {
      const valor: unknown = bruto ? JSON.parse(bruto) : [];
      if (Array.isArray(valor)) valores = valor.filter(valido).slice(0, limite);
    } catch {
      // Conteúdo corrompido: trata como vazio.
    }
    cache = { bruto, valores };
    return valores;
  }

  function gravar(valores: readonly T[]) {
    try {
      localStorage.setItem(chave, JSON.stringify(valores.slice(0, limite)));
    } catch {
      // Navegação anônima com armazenamento bloqueado: o carrinho só não persiste.
    }
    window.dispatchEvent(new Event(EVENTO_MUDANCA));
  }

  return { ler, gravar, vazio };
}

const itens = lista(CHAVE, (v): v is string => typeof v === "string" && UUID.test(v), MAXIMO_ITENS);
const pacotes = lista(
  CHAVE_PACOTES,
  (v): v is PacoteNoCarrinho =>
    typeof v === "object" &&
    v !== null &&
    typeof (v as PacoteNoCarrinho).eventoId === "string" &&
    UUID.test((v as PacoteNoCarrinho).eventoId) &&
    typeof (v as PacoteNoCarrinho).token === "string" &&
    (v as PacoteNoCarrinho).token.length <= 20_000,
  MAXIMO_PACOTES,
);

function assinar(aoMudar: () => void) {
  const naOutraAba = (e: StorageEvent) => {
    if (e.key === CHAVE || e.key === CHAVE_PACOTES) aoMudar();
  };
  window.addEventListener("storage", naOutraAba);
  window.addEventListener(EVENTO_MUDANCA, aoMudar);
  return () => {
    window.removeEventListener("storage", naOutraAba);
    window.removeEventListener(EVENTO_MUDANCA, aoMudar);
  };
}

/** Ids no carrinho. No servidor e antes da hidratação, é sempre vazio. */
export function useCarrinho() {
  return useSyncExternalStore(assinar, itens.ler, () => itens.vazio);
}

/** Pacotes escolhidos (tokens da busca). No servidor, sempre vazio. */
export function usePacotes() {
  return useSyncExternalStore(assinar, pacotes.ler, () => pacotes.vazio);
}

export function adicionarAoCarrinho(id: string) {
  const ids = itens.ler();
  if (ids.includes(id) || ids.length >= MAXIMO_ITENS) return;
  itens.gravar([...ids, id]);
}

export function removerDoCarrinho(id: string) {
  itens.gravar(itens.ler().filter((i) => i !== id));
}

/** Mantém só os ids informados (usado para tirar itens que deixaram de estar à venda). */
export function manterNoCarrinho(ids: readonly string[]) {
  const manter = new Set(ids);
  itens.gravar(itens.ler().filter((i) => manter.has(i)));
}

/** Põe todas as fotos do pacote no carrinho e guarda o token que dá o preço do pacote. */
export function escolherPacote(eventoId: string, token: string, fotoIds: readonly string[]) {
  const atuais = itens.ler();
  const novos = fotoIds.filter((id) => !atuais.includes(id));
  itens.gravar([...atuais, ...novos]);
  pacotes.gravar([...pacotes.ler().filter((p) => p.eventoId !== eventoId), { eventoId, token }]);
}

/** Tira o pacote do evento; as fotos continuam no carrinho, com o preço normal. */
export function removerPacote(eventoId: string) {
  pacotes.gravar(pacotes.ler().filter((p) => p.eventoId !== eventoId));
}

/** Descarta os pacotes que o servidor recusou (venceram ou ficaram incompletos). */
export function descartarPacotes(eventoIds: readonly string[]) {
  const fora = new Set(eventoIds);
  pacotes.gravar(pacotes.ler().filter((p) => !fora.has(p.eventoId)));
}

export function esvaziarCarrinho() {
  itens.gravar([]);
  pacotes.gravar([]);
}
