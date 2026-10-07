// Pastas dos eventos (docs/arquitetura.md, "Galeria e busca"). Como no resto da camada de
// dados, quem edita passa o id de quem está logado e a checagem de dono fica aqui.

import "server-only";

import { eventos, fotos, pastas } from "./exemplo/banco";
import type { Evento, Pasta } from "./tipos";

function eventoDoDono(eventoId: string, fotografoId: string): Evento | undefined {
  return eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
}

// ---------------------------------------------------------------- Pastas

export type PastaComTotal = Pasta & { totalItens: number };

function itensNaPasta(pastaId: string) {
  return fotos.filter((f) => f.pastaId === pastaId && f.excluidaEm === null).length;
}

/** Pastas de um evento do fotógrafo, na ordem, com quantos itens têm. */
export async function listarPastasDoPainel(
  eventoId: string,
  fotografoId: string,
): Promise<PastaComTotal[] | null> {
  if (!eventoDoDono(eventoId, fotografoId)) return null;
  return pastas
    .filter((p) => p.eventoId === eventoId)
    .sort((a, b) => a.ordem - b.ordem)
    .map((p) => ({ ...structuredClone(p), totalItens: itensNaPasta(p.id) }));
}

export async function criarPasta(eventoId: string, fotografoId: string, nome: string) {
  if (!eventoDoDono(eventoId, fotografoId)) return null;
  const ultima = Math.max(0, ...pastas.filter((p) => p.eventoId === eventoId).map((p) => p.ordem));
  const pasta: Pasta = { id: crypto.randomUUID(), eventoId, nome, ordem: ultima + 1 };
  pastas.push(pasta);
  return structuredClone(pasta);
}

function pastaDoDono(pastaId: string, fotografoId: string) {
  const pasta = pastas.find((p) => p.id === pastaId);
  return pasta && eventoDoDono(pasta.eventoId, fotografoId) ? pasta : undefined;
}

export async function renomearPasta(pastaId: string, fotografoId: string, nome: string) {
  const pasta = pastaDoDono(pastaId, fotografoId);
  if (!pasta) return false;
  pasta.nome = nome;
  return true;
}

/** Apaga a pasta; os itens dela continuam no evento, sem pasta. */
export async function excluirPasta(pastaId: string, fotografoId: string) {
  const pasta = pastaDoDono(pastaId, fotografoId);
  if (!pasta) return false;
  for (const f of fotos) if (f.pastaId === pastaId) f.pastaId = null;
  pastas.splice(pastas.indexOf(pasta), 1);
  return true;
}

/** Move itens de um evento do fotógrafo para uma pasta do mesmo evento (ou para nenhuma). */
export async function moverItensParaPasta(
  fotoIds: string[],
  pastaId: string | null,
  fotografoId: string,
): Promise<boolean> {
  const alvo = new Set(fotoIds);
  const itens = fotos.filter((f) => alvo.has(f.id) && f.excluidaEm === null);
  if (itens.length !== alvo.size || itens.length === 0) return false;
  const eventoId = itens[0].eventoId;
  if (!itens.every((f) => f.eventoId === eventoId) || !eventoDoDono(eventoId, fotografoId)) {
    return false;
  }
  if (pastaId !== null && pastas.find((p) => p.id === pastaId)?.eventoId !== eventoId) return false;
  for (const f of itens) f.pastaId = pastaId;
  return true;
}
