// Loja própria, denúncias e pastas (docs/arquitetura.md, "Loja própria", "Denúncia" e
// "Galeria e busca"). Como no resto da camada de dados, quem edita passa o id de quem está
// logado e a checagem de dono fica aqui.

import "server-only";

import { connection } from "next/server";

import { denuncias, eventos, fotografos, fotos, lojas, pastas } from "./exemplo/banco";
import { usuarios } from "./exemplo/usuarios";
import type { Denuncia, Evento, Fotografo, Loja, Pasta, StatusDenuncia } from "./tipos";

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

// ---------------------------------------------------------------- Denúncias

export type DadosDenuncia = Omit<Denuncia, "id" | "status" | "decididaPor" | "criadoEm">;

export async function criarDenuncia(dados: DadosDenuncia): Promise<Denuncia> {
  const denuncia: Denuncia = {
    ...structuredClone(dados),
    id: crypto.randomUUID(),
    status: "recebida",
    decididaPor: null,
    criadoEm: new Date().toISOString(),
  };
  denuncias.push(denuncia);
  return structuredClone(denuncia);
}

export type DenunciaDoAdmin = Denuncia & {
  evento: Pick<Evento, "id" | "titulo" | "slug" | "status">;
  donoNome: string;
  /** E-mail da conta do dono do evento, para os avisos. */
  donoEmail: string | null;
  foto: { id: string; urlMiniatura: string; excluida: boolean; autorEmail: string | null } | null;
};

function emailDoFotografo(fotografoId: string) {
  const conta = fotografos.find((f) => f.id === fotografoId);
  return (conta && usuarios.get(conta.usuarioId)?.email) ?? null;
}

function paraAdmin(d: Denuncia): DenunciaDoAdmin | null {
  const evento = eventos.find((e) => e.id === d.eventoId);
  if (!evento) return null;
  const foto = d.fotoId ? fotos.find((f) => f.id === d.fotoId) : undefined;
  return {
    ...structuredClone(d),
    evento: { id: evento.id, titulo: evento.titulo, slug: evento.slug, status: evento.status },
    donoNome: fotografos.find((f) => f.id === evento.fotografoId)?.nomePublico ?? "",
    donoEmail: emailDoFotografo(evento.fotografoId),
    foto: foto
      ? {
          id: foto.id,
          urlMiniatura: foto.urlMiniatura,
          excluida: foto.excluidaEm !== null,
          autorEmail:
            foto.enviadaPor !== evento.fotografoId ? emailDoFotografo(foto.enviadaPor) : null,
        }
      : null,
  };
}

/** Denúncias da mais recente para a mais antiga, opcionalmente só de um status. */
export async function listarDenuncias(status?: StatusDenuncia): Promise<DenunciaDoAdmin[]> {
  return denuncias
    .filter((d) => !status || d.status === status)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .flatMap((d) => paraAdmin(d) ?? []);
}

export async function buscarDenuncia(id: string): Promise<DenunciaDoAdmin | null> {
  const denuncia = denuncias.find((d) => d.id === id);
  return denuncia ? paraAdmin(denuncia) : null;
}

/**
 * Muda o status da denúncia só a partir de um dos status esperados (`… WHERE status IN …`):
 * duas pessoas da equipe decidindo ao mesmo tempo não decidem duas vezes.
 */
export async function mudarStatusDenuncia(
  id: string,
  de: StatusDenuncia[],
  para: StatusDenuncia,
  decididaPor: string | null,
): Promise<boolean> {
  const denuncia = denuncias.find((d) => d.id === id);
  if (!denuncia || !de.includes(denuncia.status)) return false;
  denuncia.status = para;
  if (decididaPor) denuncia.decididaPor = decididaPor;
  return true;
}

/**
 * Status do evento mudado pela equipe: só ela põe e tira o evento de `revisao`. Só muda a
 * partir do status esperado.
 */
export async function mudarStatusEventoPelaEquipe(
  eventoId: string,
  de: Evento["status"],
  para: Evento["status"],
): Promise<boolean> {
  const evento = eventos.find((e) => e.id === eventoId && e.status === de);
  if (!evento) return false;
  evento.status = para;
  return true;
}

/** Tira a foto da galeria (exclusão lógica): quem já comprou continua baixando. */
export async function excluirFotoPelaEquipe(fotoId: string): Promise<boolean> {
  const foto = fotos.find((f) => f.id === fotoId && f.excluidaEm === null);
  if (!foto) return false;
  foto.excluidaEm = new Date().toISOString();
  return true;
}

/** O item existe, não foi excluído e é deste evento? (Para denunciar uma foto.) */
export async function fotoEhDoEvento(fotoId: string, eventoId: string) {
  return fotos.some((f) => f.id === fotoId && f.eventoId === eventoId && f.excluidaEm === null);
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
