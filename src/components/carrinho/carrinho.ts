"use client";

import { useSyncExternalStore } from "react";

// Carrinho no navegador (docs/arquitetura.md, "Compra e pagamento"). Guarda só os ids dos
// itens: preço, nome e disponibilidade vêm sempre do servidor, que recalcula tudo.

const CHAVE = "clicouai:carrinho";
const EVENTO_MUDANCA = "clicouai:carrinho-mudou";
/** Limite de itens; o servidor aplica o mesmo limite. */
export const MAXIMO_ITENS = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VAZIO: readonly string[] = Object.freeze([]);

let cache: { bruto: string | null; ids: readonly string[] } = { bruto: null, ids: VAZIO };

function ler(): readonly string[] {
  let bruto: string | null = null;
  try {
    bruto = localStorage.getItem(CHAVE);
  } catch {
    return VAZIO;
  }
  // Mesma referência enquanto nada mudar, como o useSyncExternalStore exige.
  if (bruto === cache.bruto) return cache.ids;
  let ids: readonly string[] = VAZIO;
  try {
    const valor: unknown = bruto ? JSON.parse(bruto) : [];
    if (Array.isArray(valor)) {
      ids = [
        ...new Set(valor.filter((v): v is string => typeof v === "string" && UUID.test(v))),
      ].slice(0, MAXIMO_ITENS);
    }
  } catch {
    // Conteúdo corrompido: trata como carrinho vazio.
  }
  cache = { bruto, ids };
  return ids;
}

function gravar(ids: readonly string[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(ids.slice(0, MAXIMO_ITENS)));
  } catch {
    // Navegação anônima com armazenamento bloqueado: o carrinho só não persiste.
  }
  window.dispatchEvent(new Event(EVENTO_MUDANCA));
}

function assinar(aoMudar: () => void) {
  const naOutraAba = (e: StorageEvent) => {
    if (e.key === CHAVE) aoMudar();
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
  return useSyncExternalStore(assinar, ler, () => VAZIO);
}

export function adicionarAoCarrinho(id: string) {
  const ids = ler();
  if (ids.includes(id) || ids.length >= MAXIMO_ITENS) return;
  gravar([...ids, id]);
}

export function removerDoCarrinho(id: string) {
  gravar(ler().filter((i) => i !== id));
}

/** Mantém só os ids informados (usado para tirar itens que deixaram de estar à venda). */
export function manterNoCarrinho(ids: readonly string[]) {
  const manter = new Set(ids);
  gravar(ler().filter((i) => manter.has(i)));
}

export function esvaziarCarrinho() {
  gravar([]);
}
