// Loja própria e denúncias (docs/arquitetura.md, "Loja própria", "Denúncia" e
// "Galeria e busca"; as pastas ficam em ./pastas.ts). Como no resto da camada de dados, quem edita passa o id de quem está
// logado e a checagem de dono fica aqui.

import "server-only";

import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlDaPrevia, urlPublica } from "@/lib/url-publica";

import { paraDenuncia, paraLoja } from "./mapas";
import type { Denuncia, Evento, Fotografo, Loja, StatusDenuncia } from "./tipos";

// ---------------------------------------------------------------- Loja própria

export type DadosLoja = Pick<
  Loja,
  "nome" | "descricao" | "corPrimaria" | "corSecundaria" | "subdominio" | "gaId" | "gtmId" | "ativa"
>;

export async function buscarLojaDoFotografo(fotografoId: string): Promise<Loja | null> {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.lojas).where(eq(t.lojas.fotografoId, fotografoId));
  return linha ? paraLoja(linha) : null;
}

/** O subdomínio já é de outra loja? (`lojas(subdominio)` é único.) */
export async function subdominioEmUso(subdominio: string, fotografoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.lojas.id })
    .from(t.lojas)
    .where(and(eq(t.lojas.subdominio, subdominio), ne(t.lojas.fotografoId, fotografoId)));
  return linha !== undefined;
}

/** Cria ou atualiza a loja do fotógrafo (uma por fotógrafo). */
export async function salvarLoja(fotografoId: string, dados: DadosLoja): Promise<Loja> {
  const banco = await obterBanco();
  const [linha] = await banco
    .insert(t.lojas)
    .values({ fotografoId, ...dados })
    .onConflictDoUpdate({ target: t.lojas.fotografoId, set: dados })
    .returning();
  return paraLoja(linha);
}

export type LojaPublica = Pick<
  Loja,
  "nome" | "descricao" | "logo" | "corPrimaria" | "corSecundaria" | "subdominio" | "gaId" | "gtmId"
> & {
  fotografo: Pick<
    Fotografo,
    "id" | "nomePublico" | "slug" | "bio" | "redesSociais" | "capa" | "fotoPerfil" | "avatar"
  >;
};

async function lojaPublica(condicao: ReturnType<typeof and>): Promise<LojaPublica | null> {
  // Lida a cada requisição: a loja muda quando o fotógrafo salva no painel.
  await connection();
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ loja: t.lojas, fotografo: t.fotografos })
    .from(t.lojas)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.lojas.fotografoId))
    .where(condicao);
  if (!linha) return null;
  const { loja, fotografo } = linha;
  return {
    nome: loja.nome,
    descricao: loja.descricao,
    logo: loja.logo,
    corPrimaria: loja.corPrimaria,
    corSecundaria: loja.corSecundaria,
    subdominio: loja.subdominio,
    gaId: loja.gaId,
    gtmId: loja.gtmId,
    fotografo: {
      id: fotografo.id,
      nomePublico: fotografo.nomePublico,
      slug: fotografo.slug,
      bio: fotografo.bio,
      redesSociais: fotografo.redesSociais,
      capa: fotografo.capa ? urlPublica(fotografo.capa) : null,
      fotoPerfil: fotografo.fotoPerfil ? urlPublica(fotografo.fotoPerfil) : null,
      avatar: fotografo.avatar,
    },
  };
}

/** Loja ativa pelo subdomínio, só com o que a página pública mostra; `null` se não existe. */
export async function buscarLojaPublica(subdominio: string): Promise<LojaPublica | null> {
  return lojaPublica(and(eq(t.lojas.subdominio, subdominio), eq(t.lojas.ativa, true)));
}

/** Loja ativa pelo domínio próprio, só depois de verificado; `null` se não existe. */
export async function buscarLojaPublicaPorDominio(dominio: string): Promise<LojaPublica | null> {
  return lojaPublica(
    and(
      eq(t.lojas.dominioProprio, dominio),
      eq(t.lojas.dominioVerificado, true),
      eq(t.lojas.ativa, true),
    ),
  );
}

/** O domínio já é de outra loja? (`lojas(dominio_proprio)` é único.) */
export async function dominioEmUso(dominio: string, fotografoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.lojas.id })
    .from(t.lojas)
    .where(and(eq(t.lojas.dominioProprio, dominio), ne(t.lojas.fotografoId, fotografoId)));
  return linha !== undefined;
}

/**
 * Domínio próprio da loja do fotógrafo: muda o domínio (sempre começa não verificado) ou tira
 * (`null`). Devolve `false` se o fotógrafo ainda não tem loja.
 */
export async function definirDominioDaLoja(fotografoId: string, dominio: string | null) {
  const banco = await obterBanco();
  const atualizadas = await banco
    .update(t.lojas)
    .set({ dominioProprio: dominio, dominioVerificado: false })
    .where(eq(t.lojas.fotografoId, fotografoId))
    .returning({ id: t.lojas.id });
  return atualizadas.length > 0;
}

/** Marca o domínio como verificado, só se ainda for o mesmo (o fotógrafo pode ter trocado). */
export async function marcarDominioVerificado(
  fotografoId: string,
  dominio: string,
  verificado: boolean,
) {
  const banco = await obterBanco();
  const atualizadas = await banco
    .update(t.lojas)
    .set({ dominioVerificado: verificado })
    .where(and(eq(t.lojas.fotografoId, fotografoId), eq(t.lojas.dominioProprio, dominio)))
    .returning({ id: t.lojas.id });
  return atualizadas.length > 0;
}

// ---------------------------------------------------------------- Denúncias

export type DadosDenuncia = Omit<Denuncia, "id" | "status" | "decididaPor" | "criadoEm">;

export async function criarDenuncia(dados: DadosDenuncia): Promise<Denuncia> {
  const banco = await obterBanco();
  const [linha] = await banco.insert(t.denuncias).values(dados).returning();
  return paraDenuncia(linha);
}

export type DenunciaDoAdmin = Denuncia & {
  evento: Pick<Evento, "id" | "titulo" | "slug" | "status">;
  donoNome: string;
  /** E-mail da conta do dono do evento, para os avisos. */
  donoEmail: string | null;
  foto: { id: string; urlMiniatura: string; excluida: boolean; autorEmail: string | null } | null;
};

async function paraAdmin(linhas: (typeof t.denuncias.$inferSelect)[]): Promise<DenunciaDoAdmin[]> {
  if (linhas.length === 0) return [];
  const banco = await obterBanco();
  const eventoIds = [...new Set(linhas.map((d) => d.eventoId))];
  const fotoIds = linhas.flatMap((d) => (d.fotoId ? [d.fotoId] : []));
  const [eventos, fotos, contas] = await Promise.all([
    banco
      .select({
        id: t.eventos.id,
        titulo: t.eventos.titulo,
        slug: t.eventos.slug,
        status: t.eventos.status,
        donoId: t.eventos.fotografoId,
      })
      .from(t.eventos)
      .where(inArray(t.eventos.id, eventoIds)),
    fotoIds.length > 0
      ? banco
          .select({
            id: t.fotos.id,
            urlMiniatura: t.fotos.urlMiniatura,
            excluidaEm: t.fotos.excluidaEm,
            autorId: t.fotos.enviadaPor,
          })
          .from(t.fotos)
          .where(inArray(t.fotos.id, fotoIds))
      : [],
    banco
      .select({ id: t.fotografos.id, nome: t.fotografos.nomePublico, email: t.usuarios.email })
      .from(t.fotografos)
      .innerJoin(t.usuarios, eq(t.usuarios.id, t.fotografos.usuarioId)),
  ]);
  return linhas.flatMap((d) => {
    const evento = eventos.find((e) => e.id === d.eventoId);
    if (!evento) return [];
    const dono = contas.find((c) => c.id === evento.donoId);
    const foto = d.fotoId ? fotos.find((f) => f.id === d.fotoId) : undefined;
    const autor = foto && contas.find((c) => c.id === foto.autorId);
    return [
      {
        ...paraDenuncia(d),
        evento: { id: evento.id, titulo: evento.titulo, slug: evento.slug, status: evento.status },
        donoNome: dono?.nome ?? "",
        donoEmail: dono?.email ?? null,
        foto: foto
          ? {
              id: foto.id,
              urlMiniatura: urlDaPrevia(foto.urlMiniatura),
              excluida: foto.excluidaEm !== null,
              // Foto de colaborador: o autor também é avisado.
              autorEmail: foto.autorId !== evento.donoId ? (autor?.email ?? null) : null,
            }
          : null,
      },
    ];
  });
}

/** Denúncias da mais recente para a mais antiga, opcionalmente só de um status. */
export async function listarDenuncias(status?: StatusDenuncia): Promise<DenunciaDoAdmin[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.denuncias)
    .where(status ? eq(t.denuncias.status, status) : undefined)
    .orderBy(desc(t.denuncias.criadoEm));
  return paraAdmin(linhas);
}

export async function buscarDenuncia(id: string): Promise<DenunciaDoAdmin | null> {
  const banco = await obterBanco();
  const linhas = await banco.select().from(t.denuncias).where(eq(t.denuncias.id, id));
  return (await paraAdmin(linhas))[0] ?? null;
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
  const banco = await obterBanco();
  const atualizadas = await banco
    .update(t.denuncias)
    .set({ status: para, ...(decididaPor ? { decididaPor } : {}) })
    .where(and(eq(t.denuncias.id, id), inArray(t.denuncias.status, de)))
    .returning({ id: t.denuncias.id });
  return atualizadas.length > 0;
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
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.eventos)
    .set({ status: para })
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.status, de)))
    .returning({ id: t.eventos.id });
  return atualizados.length > 0;
}

/** Tira a foto da galeria (exclusão lógica): quem já comprou continua baixando. */
export async function excluirFotoPelaEquipe(fotoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const atualizadas = await banco
    .update(t.fotos)
    .set({ excluidaEm: new Date() })
    .where(and(eq(t.fotos.id, fotoId), isNull(t.fotos.excluidaEm)))
    .returning({ id: t.fotos.id });
  return atualizadas.length > 0;
}

/** O item existe, não foi excluído e é deste evento? (Para denunciar uma foto.) */
export async function fotoEhDoEvento(fotoId: string, eventoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.fotos.id })
    .from(t.fotos)
    .where(and(eq(t.fotos.id, fotoId), eq(t.fotos.eventoId, eventoId), isNull(t.fotos.excluidaEm)));
  return linha !== undefined;
}
