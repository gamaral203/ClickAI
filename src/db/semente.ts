// Semente do banco: as categorias, os dados de exemplo da Parte A (eventos, fotos, fotógrafos,
// descontos, loja) e os gestores da variável GESTORES. No PGlite (local e testes) roda a cada
// início; no Supabase, uma vez, pelo `npm run db:migrar`, só se o banco estiver vazio.
//
// Na produção da Vercel, só as categorias: os dados de exemplo entram só com SEMEAR_EXEMPLOS=1,
// e mesmo assim sem contas de exemplo com a senha pública (README). Lá os fotógrafos de exemplo
// ficam sem senha e com e-mail em `.invalid` (domínio reservado, que ninguém recebe nem confirma
// no Google), então ninguém entra neles; a cliente e o gestor de exemplo não são criados.

import { sql } from "drizzle-orm";

import { lerGestores } from "@/dados/exemplo/gestores";
import { omitir } from "@/dados/mapas";
import * as exemplo from "@/dados/exemplo/dados";
import { usuariosDeExemplo } from "@/dados/exemplo/usuarios";

import { emProducao } from "./conexao";

import type { Banco } from "./index";
import * as t from "./schema";

const data = (iso: string | null) => (iso ? new Date(iso) : null);

/** Insere em lotes: listas grandes (fotos, rostos) passam do limite de parâmetros do Postgres. */
async function emLotes<T>(lista: T[], inserir: (lote: T[]) => Promise<unknown>, tamanho = 200) {
  for (let i = 0; i < lista.length; i += tamanho) await inserir(lista.slice(i, i + tamanho));
}

export async function bancoVazio(banco: Banco) {
  const [{ total }] = await banco.select({ total: sql<number>`count(*)::int` }).from(t.categorias);
  return total === 0;
}

/** Dados de exemplo na semente: sempre fora da produção; nela, só com SEMEAR_EXEMPLOS=1. */
function semearExemplos() {
  return !emProducao() || process.env.SEMEAR_EXEMPLOS === "1";
}

/** Usuários de exemplo. Na produção, só os donos dos fotógrafos, sem login possível. */
function usuariosDaSemente() {
  const producao = emProducao();
  const usuarios = usuariosDeExemplo(!producao);
  if (!producao) return usuarios;
  const donos = new Set(exemplo.fotografos.map((f) => f.usuarioId));
  return usuarios
    .filter((u) => donos.has(u.id))
    .map((u) => ({ ...u, email: u.email.replace(/@.*$/, "@exemplo.invalid"), senhaHash: null }));
}

export async function semear(banco: Banco) {
  if (!(await bancoVazio(banco))) return;

  if (!semearExemplos()) {
    await banco.insert(t.categorias).values(exemplo.categorias);
    return;
  }

  await banco.insert(t.usuarios).values(
    usuariosDaSemente().map((u) => ({
      ...u,
      emailConfirmadoEm: data(u.emailConfirmadoEm),
      criadoEm: new Date(u.criadoEm),
      excluidoEm: data(u.excluidoEm ?? null),
    })),
  );
  await banco
    .insert(t.fotografos)
    .values(
      exemplo.fotografos.map((f) => ({
        ...f,
        documentoTrocadoEm: data(f.documentoTrocadoEm ?? null),
      })),
    );
  await banco.insert(t.categorias).values(exemplo.categorias);
  await banco.insert(t.eventos).values(
    exemplo.eventos.map((e) => ({
      ...e,
      inicioEm: new Date(e.inicioEm),
      fimEm: new Date(e.fimEm),
      liberadoEm: data(e.liberadoEm),
      senhaHash: exemplo.senhasEventos.get(e.id) ?? null,
    })),
  );
  await banco.insert(t.pastas).values(exemplo.pastas);
  await banco.insert(t.colaboradores).values(exemplo.colaboradores);
  await emLotes(exemplo.fotos, (lote) =>
    banco.insert(t.fotos).values(
      lote.map((f) => ({
        ...f,
        chaveOriginal: exemplo.urlOriginalDeExemplo(f),
        capturadaEm: data(f.capturadaEm),
        criadoEm: new Date(f.criadoEm),
        excluidaEm: data(f.excluidaEm),
      })),
    ),
  );
  await emLotes(exemplo.numeros, (lote) => banco.insert(t.numeros).values(lote));
  await emLotes(exemplo.rostos, (lote) =>
    banco
      .insert(t.rostos)
      .values(lote.map((r) => ({ fotoId: r.fotoId, rostoIdProvedor: r.rostoId }))),
  );
  await banco.insert(t.faixasDesconto).values(exemplo.faixasDesconto);
  await banco
    .insert(t.pacotes)
    .values(exemplo.pacotes.map((p) => ({ ...p, expiraEm: data(p.expiraEm) })));
  await banco.insert(t.cupons).values(
    exemplo.cupons.map((c) => ({
      ...omitir(c, "eventoIds"),
      inicioEm: new Date(c.inicioEm),
      expiraEm: data(c.expiraEm),
    })),
  );
  const cuponsEventos = exemplo.cupons.flatMap((c) =>
    c.eventoIds.map((eventoId) => ({ cupomId: c.id, eventoId })),
  );
  if (cuponsEventos.length > 0) await banco.insert(t.cuponsEventos).values(cuponsEventos);
  await banco.insert(t.lojas).values(exemplo.lojas);
}

/**
 * Cria ou atualiza os gestores de GESTORES (e-mail, nome e hash da senha). Roda a cada início do
 * servidor: trocar a senha na Vercel vale no próximo deploy.
 */
export async function sincronizarGestores(banco: Banco) {
  for (const g of lerGestores(process.env.GESTORES)) {
    await banco
      .insert(t.usuarios)
      .values({
        id: g.id,
        nome: g.nome,
        email: g.email,
        papel: "admin",
        senhaHash: g.senhaHash,
        // A hora vem do banco: ler o relógio aqui quebraria a pré-renderização do Next.
        emailConfirmadoEm: sql`now()`,
      })
      .onConflictDoUpdate({
        target: t.usuarios.email,
        set: { nome: g.nome, papel: "admin", senhaHash: g.senhaHash },
      });
  }
}
