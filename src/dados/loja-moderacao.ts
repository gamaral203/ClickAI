// Loja própria e pastas (docs/arquitetura.md, "Loja própria" e "Galeria e busca"). Como no
// resto da camada de dados, quem edita passa o id de quem está logado e a checagem de dono
// fica aqui.

import "server-only";

import { connection } from "next/server";

import { eventos, fotografos, fotos, lojas, pastas } from "./exemplo/banco";
import type { Evento, Fotografo, Loja, Pasta } from "./tipos";

function eventoDoDono(eventoId: string, fotografoId: string): Evento | undefined {
  return eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
}

// ---------------------------------------------------------------- Loja própria

export type DadosLoja = Pick<
  Loja,
  "nome" | "descricao" | "corPrimaria" | "corSecundaria" | "subdominio" | "gaId" | "gtmId" | "ativa"
>;

export async function buscarLojaDoFotografo(fotografoId: string): Promise<Loja | null> {
  const loja = lojas.find((l) => l.fotografoId === fotografoId);
  return loja ? structuredClone(loja) : null;
}

/** O subdomínio já é de outra loja? (`lojas(subdominio)` é único.) */
export async function subdominioEmUso(subdominio: string, fotografoId: string) {
  return lojas.some((l) => l.subdominio === subdominio && l.fotografoId !== fotografoId);
}

/** Cria ou atualiza a loja do fotógrafo (uma por fotógrafo). */
export async function salvarLoja(fotografoId: string, dados: DadosLoja): Promise<Loja> {
  const existente = lojas.find((l) => l.fotografoId === fotografoId);
  if (existente) {
    Object.assign(existente, dados);
    return structuredClone(existente);
  }
  const loja: Loja = {
    id: crypto.randomUUID(),
    fotografoId,
    logo: null,
    dominioProprio: null,
    dominioVerificado: false,
    ...dados,
  };
  lojas.push(loja);
  return structuredClone(loja);
}

export type LojaPublica = Pick<
  Loja,
  "nome" | "descricao" | "logo" | "corPrimaria" | "corSecundaria" | "subdominio" | "gaId" | "gtmId"
> & { fotografo: Pick<Fotografo, "id" | "nomePublico" | "bio" | "redesSociais"> };

/** Loja ativa pelo subdomínio, só com o que a página pública mostra; `null` se não existe. */
export async function buscarLojaPublica(subdominio: string): Promise<LojaPublica | null> {
  // Lida a cada requisição: a loja muda quando o fotógrafo salva no painel.
  await connection();
  const loja = lojas.find((l) => l.subdominio === subdominio && l.ativa);
  const conta = loja && fotografos.find((f) => f.id === loja.fotografoId);
  if (!loja || !conta) return null;
  return structuredClone({
    nome: loja.nome,
    descricao: loja.descricao,
    logo: loja.logo,
    corPrimaria: loja.corPrimaria,
    corSecundaria: loja.corSecundaria,
    subdominio: loja.subdominio,
    gaId: loja.gaId,
    gtmId: loja.gtmId,
    fotografo: {
      id: conta.id,
      nomePublico: conta.nomePublico,
      bio: conta.bio,
      redesSociais: conta.redesSociais,
    },
  });
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
