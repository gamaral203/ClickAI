import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
// A rota lê a sessão; o resto do módulo (contaDoPainel) continua o de verdade.
const sessao = vi.hoisted(() => ({ usuario: null as unknown }));
vi.mock("@/servicos/sessao", async (original) => ({
  ...(await original<typeof import("@/servicos/sessao")>()),
  usuarioAtual: async () => sessao.usuario,
}));
// O Rekognition fica simulado: cada evento devolve as fotos e semelhanças combinadas no teste, e
// a simulação guarda uma cópia dos bytes recebidos (para conferir que chegaram e que nada mais os
// guardou).
const provedor = vi.hoisted(() => ({
  porEvento: new Map<string, { fotoIds: string[]; semelhancas: Record<string, number> }>(),
  chamadas: [] as { eventoId: string; bytes: Uint8Array; recebido: Uint8Array }[],
  falhar: false,
}));
vi.mock("@/lib/reconhecimento", async (original) => ({
  ...(await original<typeof import("@/lib/reconhecimento")>()),
  buscarFotosPorSelfie: async (eventoId: string, imagem: Uint8Array) => {
    provedor.chamadas.push({ eventoId, bytes: Uint8Array.from(imagem), recebido: imagem });
    if (provedor.falhar) throw new Error("Falha na busca facial");
    const achado = provedor.porEvento.get(eventoId) ?? { fotoIds: [], semelhancas: {} };
    return { ...achado, rostoIds: [] };
  },
}));

import { POST as rotaDaBusca } from "@/app/api/painel/busca-por-rosto/route";
import {
  buscarUsuario,
  criarContaDeFotografoSeNaoExistir,
  criarEvento,
  criarUsuario,
  type Usuario,
} from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { gerarHashSenha } from "@/lib/senha";
import { sql } from "drizzle-orm";

import { BUSCA_ROSTO_MAX_EVENTOS, buscarPorRostoNoPainel } from "./busca-por-rosto";

// Busca por rosto no painel (docs/CLAUDE.md: a imagem nunca é gravada; docs/arquitetura.md,
// "Busca por rosto no painel").

/** Um JPEG mínimo (só a assinatura importa para a rota) com um marcador para achar no banco. */
const MARCADOR = "ROSTO-DE-TESTE-NAO-GRAVAR";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(MARCADOR), 0xff]);

let dataBase = Date.UTC(2026, 0, 1);
async function novoEvento(fotografoId: string, titulo: string, publicado = true) {
  // Datas crescentes: o último criado é o mais recente.
  dataBase += 24 * 3_600_000;
  const evento = await criarEvento(fotografoId, {
    categoriaId: categorias[0].id,
    inicioEm: new Date(dataBase).toISOString(),
    fimEm: null,
    local: "Parque",
    cidade: "São Paulo",
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
    slug: `rosto-${randomUUID().slice(0, 8)}`,
  });
  if (publicado) {
    const banco = await obterBanco();
    await banco
      .update(t.eventos)
      .set({ status: "publicado" })
      .where(sql`${t.eventos.id} = ${evento.id}`);
  }
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
  await banco.insert(t.fotos).values({
    id,
    eventoId,
    enviadaPor,
    chaveOriginal: `originais/${enviadaPor}/${eventoId}/${id}.jpg`,
    urlPrevia: `previas/${id}.jpg`,
    urlMiniatura: `miniaturas/${id}.jpg`,
    nomeArquivo: `Rosto ${String(++ordem).padStart(3, "0")}.JPG`,
    largura: 3000,
    altura: 2000,
    ordem,
    status: "pronta",
    liberarEm: new Date(Date.now() - 60_000),
    ...extra,
  });
  return id;
}

async function fotografoNovo(nome: string) {
  const usuario = await criarUsuario({
    nome,
    email: `${randomUUID()}@teste.com`,
    senhaHash: gerarHashSenha("senha-de-teste-123"),
    papel: "fotografo",
    emailConfirmado: true,
  });
  const conta = await criarContaDeFotografoSeNaoExistir({
    usuarioId: usuario.id,
    nomePublico: nome,
    slug: `${nome.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}`,
  });
  return { usuario: (await buscarUsuario(usuario.id))!, conta: conta! };
}

async function colaborar(eventoId: string, fotografoId: string, aceito: boolean) {
  const banco = await obterBanco();
  await banco.insert(t.colaboradores).values({
    eventoId,
    fotografoId,
    comissaoDonoPct: 20,
    aceitoEm: aceito ? new Date() : null,
  });
}

function pedido(campos: Record<string, string>, imagem: Uint8Array | null = JPEG) {
  const corpo = new FormData();
  for (const [k, v] of Object.entries(campos)) corpo.set(k, v);
  if (imagem) corpo.set("foto", new Blob([imagem as BlobPart], { type: "image/jpeg" }), "r.jpg");
  return new NextRequest("http://localhost:3000/api/painel/busca-por-rosto", {
    method: "POST",
    body: corpo,
    headers: { origin: "http://localhost:3000", host: "localhost:3000" },
  });
}

let dona: Awaited<ReturnType<typeof fotografoNovo>>;
let colab: Awaited<ReturnType<typeof fotografoNovo>>;
let estranho: Awaited<ReturnType<typeof fotografoNovo>>;
let eventoDaDona: Awaited<ReturnType<typeof novoEvento>>;
let eventoAlheio: Awaited<ReturnType<typeof novoEvento>>;
let eventoConvitePendente: Awaited<ReturnType<typeof novoEvento>>;
const f: Record<string, string> = {};

beforeAll(async () => {
  dona = await fotografoNovo("Dona Rosto");
  colab = await fotografoNovo("Colab Rosto");
  estranho = await fotografoNovo("Estranho Rosto");
  eventoDaDona = await novoEvento(dona.conta.id, "Maratona da Dona");
  eventoAlheio = await novoEvento(estranho.conta.id, "Evento de outro");
  eventoConvitePendente = await novoEvento(estranho.conta.id, "Convite pendente");
  await colaborar(eventoDaDona.id, colab.conta.id, true);
  await colaborar(eventoConvitePendente.id, colab.conta.id, false);

  f.daDona = await novaFoto(eventoDaDona.id, dona.conta.id);
  f.daDonaFechada = await novaFoto(eventoDaDona.id, dona.conta.id, { liberarEm: null });
  f.daDonaExcluida = await novaFoto(eventoDaDona.id, dona.conta.id, { excluidaEm: new Date() });
  f.doColab = await novaFoto(eventoDaDona.id, colab.conta.id);
  f.alheia = await novaFoto(eventoAlheio.id, estranho.conta.id);
  provedor.porEvento.set(eventoDaDona.id, {
    fotoIds: [f.daDona, f.daDonaFechada, f.daDonaExcluida, f.doColab, f.alheia],
    semelhancas: { [f.daDona]: 99.2, [f.doColab]: 91, [f.daDonaFechada]: 98 },
  });
  provedor.porEvento.set(eventoAlheio.id, { fotoIds: [f.alheia], semelhancas: {} });
});

afterEach(() => {
  provedor.chamadas = [];
  provedor.falhar = false;
  sessao.usuario = null;
});

async function contarLinhas() {
  const banco = await obterBanco();
  const tabelas = await banco.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const linhas = "rows" in tabelas ? tabelas.rows : tabelas;
  const contagem: Record<string, number> = {};
  for (const { tablename } of linhas as { tablename: string }[]) {
    const r = await banco.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from "public"."${tablename}"`),
    );
    const rr = ("rows" in r ? r.rows : r) as { n: number }[];
    contagem[tablename] = Number(rr[0].n);
  }
  return contagem;
}

describe("busca por rosto: escopo conferido no servidor", () => {
  it("o dono busca no próprio evento e recebe as dele separadas das de outros autores", async () => {
    const r = await buscarPorRostoNoPainel(
      dona.usuario,
      { tipo: "evento", eventoId: eventoDaDona.id },
      JPEG.slice(),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.grupos).toHaveLength(1);
    const [grupo] = r.grupos;
    // As dele: inclui a ainda não liberada (é o trabalho dele), nunca a excluída.
    expect(new Set(grupo.minhas.map((x) => x.id))).toEqual(new Set([f.daDona, f.daDonaFechada]));
    expect(grupo.minhas.find((x) => x.id === f.daDona)).toMatchObject({
      semelhanca: "alta",
      liberada: true,
      propria: true,
    });
    expect(grupo.minhas.find((x) => x.id === f.daDonaFechada)?.liberada).toBe(false);
    // As de outro autor: só a prévia pública (com marca), com o nome do autor; sem original.
    expect(grupo.deOutros.map((x) => x.id)).toEqual([f.doColab]);
    expect(grupo.deOutros[0]).toMatchObject({
      semelhanca: "media",
      propria: false,
      autorNome: "Colab Rosto",
    });
    for (const foto of [...grupo.minhas, ...grupo.deOutros]) {
      expect(JSON.stringify(foto)).not.toContain("originais/");
    }
    // Id de outro evento devolvido pelo provedor não entra.
    expect(JSON.stringify(r)).not.toContain(f.alheia);
  });

  it("o colaborador com convite aceito busca no evento; as fotos fechadas da dona não aparecem", async () => {
    const r = await buscarPorRostoNoPainel(
      colab.usuario,
      { tipo: "evento", eventoId: eventoDaDona.id },
      JPEG.slice(),
    );
    if (!r.ok) throw new Error(r.motivo);
    const [grupo] = r.grupos;
    expect(grupo.minhas.map((x) => x.id)).toEqual([f.doColab]);
    expect(grupo.deOutros.map((x) => x.id)).toEqual([f.daDona]);
    expect(grupo.evento.donoNome).toBe("Dona Rosto");
  });

  it("recusa evento de outro fotógrafo e convite não aceito, sem chamar o provedor", async () => {
    for (const [usuario, eventoId] of [
      [dona.usuario, eventoAlheio.id],
      [colab.usuario, eventoConvitePendente.id],
      [colab.usuario, randomUUID()],
    ] as [Usuario, string][]) {
      expect(
        await buscarPorRostoNoPainel(usuario, { tipo: "evento", eventoId }, JPEG.slice()),
      ).toEqual({ ok: false, motivo: "escopo" });
    }
    expect(provedor.chamadas).toHaveLength(0);
  });

  it("'meus eventos recentes' consulta só os permitidos, até o limite", async () => {
    const muitos = await fotografoNovo("Muitos Eventos");
    const criados = [];
    for (let i = 0; i < BUSCA_ROSTO_MAX_EVENTOS + 2; i++) {
      criados.push(await novoEvento(muitos.conta.id, `Evento ${i}`));
    }
    const r = await buscarPorRostoNoPainel(muitos.usuario, { tipo: "recentes" }, JPEG.slice());
    expect(r).toMatchObject({ ok: true, eventosConsultados: BUSCA_ROSTO_MAX_EVENTOS });
    const consultados = provedor.chamadas.map((c) => c.eventoId);
    // Os mais recentes (os últimos criados) e nenhum evento de outra pessoa.
    expect(new Set(consultados)).toEqual(
      new Set(criados.slice(-BUSCA_ROSTO_MAX_EVENTOS).map((e) => e.id)),
    );
  });

  it("cliente e visitante não buscam", async () => {
    const cliente = await criarUsuario({
      nome: "Cliente",
      email: `${randomUUID()}@teste.com`,
      senhaHash: gerarHashSenha("senha-de-teste-123"),
      papel: "cliente",
      emailConfirmado: true,
    });
    expect(await buscarPorRostoNoPainel(cliente, { tipo: "recentes" }, JPEG.slice())).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
    expect(await buscarPorRostoNoPainel(null, { tipo: "recentes" }, JPEG.slice())).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
  });

  it("limita a 30 buscas por hora por usuário", async () => {
    const apressado = await fotografoNovo("Apressado");
    const evento = await novoEvento(apressado.conta.id, "Evento do apressado");
    const escopo = { tipo: "evento" as const, eventoId: evento.id };
    for (let i = 0; i < 30; i++) {
      expect((await buscarPorRostoNoPainel(apressado.usuario, escopo, JPEG.slice())).ok).toBe(true);
    }
    expect(await buscarPorRostoNoPainel(apressado.usuario, escopo, JPEG.slice())).toEqual({
      ok: false,
      motivo: "limite",
    });
  });
});

describe("busca por rosto: a imagem nunca é gravada", () => {
  it("vai só ao provedor; nada novo no banco além do limite e do contador anônimo", async () => {
    sessao.usuario = dona.usuario;
    const logs: string[] = [];
    const espioes = (["log", "info", "warn", "error"] as const).map((nivel) =>
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        logs.push(
          args.map((a) => (a instanceof Uint8Array ? `[bytes ${a.length}]` : String(a))).join(" "),
        );
      }),
    );
    const antes = await contarLinhas();
    expect(antes.fotos).toBeGreaterThan(0);
    expect(Object.keys(antes).length).toBeGreaterThan(20);

    const resposta = await rotaDaBusca(
      pedido({ escopo: "evento", eventoId: eventoDaDona.id, autorizacao: "sim" }),
    );
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const corpo = (await resposta.json()) as { grupos: unknown[] };
    expect(corpo.grupos).toHaveLength(1);

    // O provedor recebeu os bytes enviados; no fim da requisição, eles foram zerados.
    expect(provedor.chamadas).toHaveLength(1);
    expect(provedor.chamadas[0].bytes).toEqual(JPEG);
    expect(provedor.chamadas[0].recebido.every((b) => b === 0)).toBe(true);

    // Só mudam a contagem do limite (`tentativas`, um HMAC do usuário) e o contador anônimo.
    const depois = await contarLinhas();
    const mudaram = Object.keys(depois).filter((k) => depois[k] !== antes[k]);
    expect(mudaram.length).toBeGreaterThan(0);
    expect(mudaram.every((k) => ["tentativas", "contadores_uso"].includes(k))).toBe(true);
    const banco = await obterBanco();
    const contadores = await banco.select().from(t.contadoresUso);
    expect(contadores.some((c) => c.chave === "busca_rosto_painel")).toBe(true);
    expect(JSON.stringify(contadores)).not.toContain(MARCADOR);
    const tentativas = await banco.select().from(t.tentativas);
    expect(JSON.stringify(tentativas)).not.toContain(MARCADOR);

    // Nem log.
    expect(logs.join("\n")).not.toContain(MARCADOR);
    for (const e of espioes) e.mockRestore();
  });

  it("na falha do provedor, o log tem só o nome do erro", async () => {
    sessao.usuario = dona.usuario;
    provedor.falhar = true;
    const erros: unknown[][] = [];
    const espiao = vi.spyOn(console, "error").mockImplementation((...a) => void erros.push(a));
    const resposta = await rotaDaBusca(
      pedido({ escopo: "evento", eventoId: eventoDaDona.id, autorizacao: "sim" }),
    );
    expect(resposta.status).toBe(502);
    expect(erros.flat().every((a) => typeof a === "string")).toBe(true);
    expect(JSON.stringify(erros)).not.toContain(MARCADOR);
    espiao.mockRestore();
  });

  it("a rota recusa sem sessão, sem a autorização, fora do site e com arquivo que não é imagem", async () => {
    expect((await rotaDaBusca(pedido({ escopo: "recentes", autorizacao: "sim" }))).status).toBe(
      401,
    );
    sessao.usuario = dona.usuario;
    expect((await rotaDaBusca(pedido({ escopo: "recentes" }))).status).toBe(400);
    expect(
      (
        await rotaDaBusca(
          pedido({ escopo: "recentes", autorizacao: "sim" }, new TextEncoder().encode("texto")),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await rotaDaBusca(
          pedido({ escopo: "evento", eventoId: eventoAlheio.id, autorizacao: "sim" }),
        )
      ).status,
    ).toBe(404);
    const deFora = new NextRequest("http://localhost:3000/api/painel/busca-por-rosto", {
      method: "POST",
      body: new FormData(),
      headers: { origin: "https://outro-site.com", host: "localhost:3000" },
    });
    expect((await rotaDaBusca(deFora)).status).toBe(403);
    expect(provedor.chamadas).toHaveLength(0);
  });
});
