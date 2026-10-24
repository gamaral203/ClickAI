import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarUsuario,
  criarEvento,
  criarUsuario,
  downloadsDaGestaoRegistrados,
  eventoDaGestao,
  fotosEncontradas,
  ligarVerificacaoPorEmail,
  listarEventosDaGestao,
  listarFotosDaGestao,
  type Usuario,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { reiniciarClienteR2 } from "@/lib/r2";
import { filtroDoAlvo } from "@/lib/selecao-da-gestao";
import { gerarHashSenha } from "@/lib/senha";

import { limiteAtingido } from "./limites";
import { liberarOriginais } from "./originais-do-dono";
import {
  liberarOriginaisDaGestao,
  loteDeOriginaisDaGestao,
  originalIndividualDaGestao,
  segmentoDoCaminho,
} from "./originais-da-gestao";
import { codigoDeAcaoEnviado } from "./testes/codigo-email";

const [lia, pedro] = fotografos;

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};
const antes = { ...process.env };

const MARCA = `gestao${randomUUID().slice(0, 6)}`;

async function novoEvento(
  fotografoId: string,
  titulo: string,
  status: (typeof t.statusEvento.enumValues)[number] = "publicado",
) {
  const evento = await criarEvento(fotografoId, {
    categoriaId: categorias[0].id,
    inicioEm: "2026-11-01T08:00:00-03:00",
    fimEm: "2026-11-01T12:00:00-03:00",
    local: "Parque",
    cidade: "Cidade Teste",
    estado: "SP",
    precoFotoCentavos: 1500,
    precoVideoCentavos: 3000,
    visibilidade: "publico",
    listado: true,
    liberacao: "automatica",
    liberadoEm: null,
    filtroHorario: false,
    listarNaoIdentificadas: false,
    ordenacao: "envio",
    titulo,
    slug: `${MARCA}-${randomUUID().slice(0, 8)}`,
  });
  const banco = await obterBanco();
  await banco.update(t.eventos).set({ status }).where(eq(t.eventos.id, evento.id));
  return evento;
}

let ordem = 0;
async function novaFoto(
  eventoId: string,
  enviadaPor: string,
  extra: Partial<typeof t.fotos.$inferInsert> = {},
) {
  const banco = await obterBanco();
  const id = randomUUID();
  const [foto] = await banco
    .insert(t.fotos)
    .values({
      id,
      eventoId,
      enviadaPor,
      chaveOriginal: `originais/${enviadaPor}/${eventoId}/${id}.jpg`,
      urlPrevia: `previas/${id}.jpg`,
      urlMiniatura: `miniaturas/${id}.jpg`,
      nomeArquivo: `IMG_${String(++ordem).padStart(4, "0")}.JPG`,
      largura: 3000,
      altura: 2000,
      tamanhoBytes: 1_000,
      ordem,
      status: "pronta",
      ...extra,
    })
    .returning();
  return foto;
}

async function usuarioNovo(papel: "cliente" | "admin" | "fotografo") {
  return criarUsuario({
    nome: `Pessoa ${papel}`,
    email: `${randomUUID()}@teste.com`,
    senhaHash: gerarHashSenha("senha-de-teste-123"),
    papel,
    emailConfirmado: true,
  });
}

let gestor: Usuario;
let evento: Awaited<ReturnType<typeof novoEvento>>;
const pastas: Record<string, string> = {};
const f: Record<string, string> = {};

async function liberar(usuario: Usuario) {
  const r = await liberarOriginaisDaGestao(usuario, undefined);
  if (!r.ok) throw new Error(r.erro);
  return r.liberacao;
}

beforeAll(async () => {
  Object.assign(process.env, R2);
  reiniciarClienteR2();
  gestor = await usuarioNovo("admin");
  evento = await novoEvento(lia.id, "Corrida da gestão", "rascunho");
  const banco = await obterBanco();
  await banco.insert(t.colaboradores).values({
    eventoId: evento.id,
    fotografoId: pedro.id,
    comissaoDonoPct: 20,
    aceitoEm: new Date(),
  });
  const [largada] = await banco
    .insert(t.pastas)
    .values({ eventoId: evento.id, nome: "Largada Ação", ordem: 1 })
    .returning();
  const [bateria] = await banco
    .insert(t.pastas)
    .values({ eventoId: evento.id, nome: "Bateria 1", ordem: 1, pastaPaiId: largada.id })
    .returning();
  const [chegada] = await banco
    .insert(t.pastas)
    .values({ eventoId: evento.id, nome: "Chegada", ordem: 2 })
    .returning();
  pastas.largada = largada.id;
  pastas.bateria = bateria.id;
  pastas.chegada = chegada.id;

  f.liaLargada = (await novaFoto(evento.id, lia.id, { pastaId: largada.id })).id;
  f.liaBateria = (await novaFoto(evento.id, lia.id, { pastaId: bateria.id })).id;
  f.pedroChegada = (await novaFoto(evento.id, pedro.id, { pastaId: chegada.id })).id;
  f.pedroSemPasta = (await novaFoto(evento.id, pedro.id)).id;
  f.liaExcluida = (
    await novaFoto(evento.id, lia.id, { pastaId: bateria.id, excluidaEm: new Date() })
  ).id;
  f.liaProcessando = (await novaFoto(evento.id, lia.id, { status: "processando" })).id;
});

afterAll(() => {
  process.env = antes;
  reiniciarClienteR2();
});

describe("gestão: lista de eventos", () => {
  it("mostra eventos de todos os fotógrafos em qualquer status", async () => {
    const extras = {
      publicado: await novoEvento(pedro.id, "Evento publicado", "publicado"),
      arquivado: await novoEvento(lia.id, "Evento arquivado", "arquivado"),
      revisao: await novoEvento(pedro.id, "Evento em revisão", "revisao"),
    };
    const { eventos, total } = await listarEventosDaGestao({ busca: MARCA }, 1, 50);
    expect(total).toBe(4);
    expect(new Set(eventos.map((e) => e.status))).toEqual(
      new Set(["rascunho", "publicado", "arquivado", "revisao"]),
    );
    expect(new Set(eventos.map((e) => e.fotografoId))).toEqual(new Set([lia.id, pedro.id]));
    const doTeste = eventos.find((e) => e.id === evento.id)!;
    // Prontas e não excluídas (a excluída e a em processamento não contam).
    expect(doTeste.totalFotos).toBe(4);

    const soArquivado = await listarEventosDaGestao({ busca: MARCA, status: "arquivado" }, 1, 50);
    expect(soArquivado.eventos.map((e) => e.id)).toEqual([extras.arquivado.id]);
    const porFotografo = await listarEventosDaGestao({ busca: pedro.nomePublico }, 1, 500);
    expect(porFotografo.eventos.some((e) => e.id === extras.revisao.id)).toBe(true);
    const foraDaData = await listarEventosDaGestao({ busca: MARCA, de: "2027-01-01" }, 1, 50);
    expect(foraDaData.total).toBe(0);
    const pagina2 = await listarEventosDaGestao({ busca: MARCA }, 2, 3);
    expect(pagina2.eventos).toHaveLength(1);
  });

  it("detalhe com autores (dono e colaborador) e a árvore de pastas", async () => {
    const detalhe = await eventoDaGestao(evento.id);
    expect(detalhe?.autores.map((a) => [a.id, a.dono])).toEqual([
      [lia.id, true],
      [pedro.id, false],
    ]);
    expect(detalhe?.pastas.map((p) => p.caminho)).toEqual([
      "Largada Ação",
      "Largada Ação › Bateria 1",
      "Chegada",
    ]);
    expect(detalhe?.totalExcluidas).toBe(1);
    expect(await eventoDaGestao(randomUUID())).toBeNull();
  });
});

const ids = (fotos: { id: string }[]) => fotos.map((x) => x.id).sort();

describe("gestão: fotos e filtros", () => {
  it("pasta de cima inclui as subpastas; subpasta só ela; 'sem' as soltas", async () => {
    const largada = await listarFotosDaGestao(evento.id, { pastaId: pastas.largada }, 1, 48);
    expect(ids(largada.fotos)).toEqual([f.liaLargada, f.liaBateria].sort());
    const bateria = await listarFotosDaGestao(evento.id, { pastaId: pastas.bateria }, 1, 48);
    expect(ids(bateria.fotos)).toEqual([f.liaBateria]);
    const sem = await listarFotosDaGestao(evento.id, { pastaId: "sem" }, 1, 48);
    expect(ids(sem.fotos)).toEqual([f.pedroSemPasta]);
    // Pasta de outro evento: nada, em vez de ignorar o filtro.
    const outra = await listarFotosDaGestao(evento.id, { pastaId: randomUUID() }, 1, 48);
    expect(outra.total).toBe(0);
  });

  it("filtro por autor", async () => {
    const doPedro = await listarFotosDaGestao(evento.id, { autorId: pedro.id }, 1, 48);
    expect(ids(doPedro.fotos)).toEqual([f.pedroChegada, f.pedroSemPasta].sort());
  });

  it("excluídas só com o filtro, e marcadas", async () => {
    const sem = await listarFotosDaGestao(evento.id, {}, 1, 48);
    expect(ids(sem.fotos)).not.toContain(f.liaExcluida);
    expect(ids(sem.fotos)).not.toContain(f.liaProcessando);
    const com = await listarFotosDaGestao(evento.id, { excluidas: true }, 1, 48);
    expect(com.fotos.find((x) => x.id === f.liaExcluida)?.excluida).toBe(true);
    // A miniatura é sempre a prévia protegida (nunca o original).
    expect(com.fotos.every((x) => !x.urlMiniatura.includes("originais/"))).toBe(true);
  });
});

describe("gestão: baixar originais", () => {
  it("gestor baixa o original de qualquer foto (de outro autor), registrado na auditoria", async () => {
    const liberacao = await liberar(gestor);
    const r = await originalIndividualDaGestao(
      gestor,
      { fotoId: f.pedroChegada, liberacao },
      "198.51.100.9",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const url = new URL(r.url);
    expect(url.hostname).toBe("fotos-originais.conta-teste.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    const [registro] = await downloadsDaGestaoRegistrados(evento.id);
    expect(registro).toMatchObject({
      gestorId: gestor.id,
      eventoId: evento.id,
      fotoId: f.pedroChegada,
      modo: "individual",
      quantidade: 1,
      ip: "198.51.100.9",
    });
    expect(JSON.stringify(registro)).not.toMatch(/X-Amz|originais\//);
    // Excluída também baixa; em processamento, não.
    expect(
      (await originalIndividualDaGestao(gestor, { fotoId: f.liaExcluida, liberacao }, null)).ok,
    ).toBe(true);
    expect(
      await originalIndividualDaGestao(gestor, { fotoId: f.liaProcessando, liberacao }, null),
    ).toMatchObject({ ok: false, motivo: "nao_encontrado" });
  });

  it("lote: todas do evento, com o caminho evento/pasta/subpasta e as excluídas separadas", async () => {
    const liberacao = await liberar(gestor);
    const lote = await loteDeOriginaisDaGestao(
      gestor,
      { eventoId: evento.id, filtro: { excluidas: true }, liberacao },
      "198.51.100.10",
    );
    if (!lote.ok) throw new Error(lote.erro);
    expect(ids(lote.itens)).toEqual(
      [f.liaLargada, f.liaBateria, f.pedroChegada, f.pedroSemPasta, f.liaExcluida].sort(),
    );
    const nome = (id: string) => lote.itens.find((i) => i.id === id)!.nome;
    const slug = segmentoDoCaminho(evento.slug, "evento");
    expect(nome(f.liaBateria)).toMatch(
      new RegExp(`^${slug}/Largada_Acao/Bateria_1/IMG_\\d{4}_[0-9a-f]{8}\\.jpg$`),
    );
    expect(nome(f.pedroSemPasta)).toMatch(new RegExp(`^${slug}/IMG_\\d{4}_[0-9a-f]{8}\\.jpg$`));
    expect(nome(f.liaExcluida)).toMatch(new RegExp(`^${slug}/excluidas/Largada_Acao/Bateria_1/`));
    const [registro] = await downloadsDaGestaoRegistrados(evento.id);
    expect(registro).toMatchObject({ modo: "lote", quantidade: 5, gestorId: gestor.id });

    // Selecionadas: ids de outro evento ou fora do filtro não voltam (sem IDOR).
    const outro = await novoEvento(lia.id, "Outro evento");
    const deFora = (await novaFoto(outro.id, lia.id)).id;
    const selecionadas = await loteDeOriginaisDaGestao(
      gestor,
      { eventoId: evento.id, filtro: {}, liberacao, ids: [deFora, f.liaExcluida, f.liaLargada] },
      null,
    );
    expect(selecionadas.ok && ids(selecionadas.itens)).toEqual([f.liaLargada]);
  });

  it("as encontradas pela busca por selfie entram no lote como selecionadas, mesmo fora do filtro da tela", async () => {
    // Evento publicado: a busca do cliente (fotosEncontradas, a mesma de /api/busca-facial)
    // devolve as fotos liberadas, de qualquer pasta.
    const publicado = await novoEvento(lia.id, "Evento com busca");
    const [pasta] = await (
      await obterBanco()
    )
      .insert(t.pastas)
      .values({ eventoId: publicado.id, nome: "Largada", ordem: 1 })
      .returning();
    const liberada = { liberarEm: new Date(Date.now() - 60_000) };
    const naPasta = (await novaFoto(publicado.id, lia.id, { ...liberada, pastaId: pasta.id })).id;
    const solta = (await novaFoto(publicado.id, pedro.id, liberada)).id;
    const outro = await novoEvento(lia.id, "Outro evento da busca");
    const deOutroEvento = (await novaFoto(outro.id, lia.id, liberada)).id;
    const encontradas = (await fotosEncontradas(publicado.id, [naPasta, solta])).map((x) => x.id);
    expect(new Set(encontradas)).toEqual(new Set([naPasta, solta]));

    // A tela estava filtrada pela pasta; as selecionadas vão sem o filtro de pasta.
    const daTela = { pastaId: pasta.id, excluidas: false };
    const liberacao = await liberar(gestor);
    const lote = await loteDeOriginaisDaGestao(
      gestor,
      {
        eventoId: publicado.id,
        filtro: filtroDoAlvo("selecionadas", daTela),
        liberacao,
        ids: [...encontradas, deOutroEvento],
      },
      "198.51.100.20",
    );
    if (!lote.ok) throw new Error(lote.erro);
    // Id de outro evento não volta; as URLs são as assinadas do R2, com auditoria.
    expect(ids(lote.itens)).toEqual([naPasta, solta].sort());
    for (const item of lote.itens) expect(item.url).toMatch(/X-Amz-Signature=/);
    const [registro] = await downloadsDaGestaoRegistrados(publicado.id);
    expect(registro).toMatchObject({ modo: "lote", quantidade: 2, gestorId: gestor.id });

    // Os mesmos ids não valem para quem não é gestor.
    const fotografo = (await buscarUsuario(lia.usuarioId))!;
    for (const usuario of [fotografo, await usuarioNovo("cliente"), null]) {
      expect(
        await loteDeOriginaisDaGestao(
          usuario,
          { eventoId: publicado.id, filtro: { excluidas: false }, liberacao, ids: encontradas },
          null,
        ),
      ).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    }
  });

  it("fotógrafo (dono ou não), cliente e anônimo são recusados", async () => {
    const cliente = await usuarioNovo("cliente");
    const usuarioLia = (await buscarUsuario(lia.usuarioId))!;
    const liberacaoDoGestor = await liberar(gestor);
    for (const quem of [usuarioLia, cliente, null]) {
      expect((await liberarOriginaisDaGestao(quem, undefined)).ok).toBe(false);
      expect(
        await originalIndividualDaGestao(
          quem,
          { fotoId: f.liaLargada, liberacao: liberacaoDoGestor },
          null,
        ),
      ).toMatchObject({ ok: false, motivo: "nao_encontrado" });
      expect(
        await loteDeOriginaisDaGestao(
          quem,
          { eventoId: evento.id, liberacao: liberacaoDoGestor },
          null,
        ),
      ).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    }
  });

  it("liberação do dono, de outro gestor ou adulterada não vale na gestão", async () => {
    const usuarioLia = (await buscarUsuario(lia.usuarioId))!;
    const doDono = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!doDono.ok) throw new Error();
    const outroGestor = await usuarioNovo("admin");
    const deOutro = await liberar(outroGestor);
    const minha = await liberar(gestor);
    for (const liberacao of [doDono.liberacao, deOutro, `${minha}x`]) {
      expect(
        await originalIndividualDaGestao(gestor, { fotoId: f.liaLargada, liberacao }, null),
      ).toMatchObject({ ok: false, motivo: "liberacao" });
      expect(
        await loteDeOriginaisDaGestao(gestor, { eventoId: evento.id, liberacao }, null),
      ).toMatchObject({ ok: false, motivo: "liberacao" });
    }
  });

  it("com a verificação em duas etapas ligada, pede o código", async () => {
    const comMfa = await usuarioNovo("admin");
    await ligarVerificacaoPorEmail(comMfa.id);
    const gestorMfa = (await buscarUsuario(comMfa.id))!;
    expect(gestorMfa.mfaAtivo).toBe(true);
    expect(await liberarOriginaisDaGestao(gestorMfa, undefined)).toMatchObject({
      ok: false,
      pedeCodigo: true,
    });
    expect(await liberarOriginaisDaGestao(gestorMfa, "000000")).toMatchObject({ ok: false });
    const codigo = await codigoDeAcaoEnviado(gestorMfa, "gestao_originais");
    expect((await liberarOriginaisDaGestao(gestorMfa, codigo)).ok).toBe(true);
  });

  it("limite: 300 originais individuais por hora e 120 lotes em 10 minutos por gestor", async () => {
    const apressado = await usuarioNovo("admin");
    const liberacao = await liberar(apressado);
    for (let i = 0; i < 299; i++) await limiteAtingido("original_gestao_usuario", apressado.id);
    expect(
      (await originalIndividualDaGestao(apressado, { fotoId: f.liaLargada, liberacao }, null)).ok,
    ).toBe(true);
    expect(
      await originalIndividualDaGestao(apressado, { fotoId: f.liaLargada, liberacao }, null),
    ).toMatchObject({ ok: false, motivo: "limite" });

    for (let i = 0; i < 119; i++) await limiteAtingido("originais_gestao_usuario", apressado.id);
    const pedido = { eventoId: evento.id, liberacao };
    expect((await loteDeOriginaisDaGestao(apressado, pedido, null)).ok).toBe(true);
    expect(await loteDeOriginaisDaGestao(apressado, pedido, null)).toMatchObject({
      ok: false,
      motivo: "limite",
    });
  });

  it("recusa pedido malformado e evento inexistente", async () => {
    const liberacao = await liberar(gestor);
    for (const entrada of [
      null,
      { eventoId: "x", liberacao },
      { eventoId: evento.id, liberacao, filtro: { pastaId: "../x" } },
      { eventoId: evento.id, liberacao, extra: 1 },
      { eventoId: evento.id, liberacao, ids: Array(51).fill(f.liaLargada) },
    ]) {
      expect(await loteDeOriginaisDaGestao(gestor, entrada, null)).toMatchObject({
        ok: false,
        motivo: "invalido",
      });
    }
    expect(
      await loteDeOriginaisDaGestao(gestor, { eventoId: randomUUID(), liberacao }, null),
    ).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    expect(
      await originalIndividualDaGestao(gestor, { fotoId: "nao-e-uuid", liberacao }, null),
    ).toMatchObject({ ok: false, motivo: "nao_encontrado" });
  });
});
