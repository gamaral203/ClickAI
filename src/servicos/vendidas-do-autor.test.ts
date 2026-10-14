import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarUsuario,
  criarContaDeFotografoSeNaoExistir,
  criarEvento,
  criarUsuario,
  listarVendidasDoAutor,
  lotesDoDonoRegistrados,
  type Usuario,
} from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { codigoAtual } from "@/lib/mfa";
import { reiniciarClienteR2 } from "@/lib/r2";
import { gerarHashSenha } from "@/lib/senha";

import { confirmarCadastroMfa, iniciarCadastroMfa } from "./mfa";
import {
  liberarOriginaisDoAutor,
  liberarVendidasDoAutor,
  loteDeVendidasDoAutor,
  originalIndividual,
  resumoVendidasParaOAutor,
  type ItemParaBaixar,
} from "./originais-do-dono";

// Aba Fotos vendidas (docs/CLAUDE.md, exceção do autor): todas as fotos que o fotógrafo ENVIOU e
// foram vendidas em pedido pago, de qualquer evento, com download em lote conferido foto a foto.

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};
const antes = { ...process.env };

async function novoEvento(fotografoId: string, titulo: string) {
  return criarEvento(fotografoId, {
    categoriaId: categorias[0].id,
    inicioEm: "2026-11-01T08:00:00-03:00",
    fimEm: "2026-11-01T12:00:00-03:00",
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
    slug: `vendidas-${randomUUID().slice(0, 8)}`,
  });
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
    nomeArquivo: `Foto ${String(++ordem).padStart(3, "0")}.JPG`,
    largura: 3000,
    altura: 2000,
    tamanhoBytes: 1_000_000,
    ordem,
    status: "pronta",
    ...extra,
  });
  return id;
}

type StatusPedido = (typeof t.statusPedido.enumValues)[number];
async function venda(
  fotoId: string,
  autorId: string,
  status: StatusPedido,
  extra: { email?: string; nome?: string; pagoEm?: Date; valor?: number } = {},
) {
  const banco = await obterBanco();
  const [pedido] = await banco
    .insert(t.pedidos)
    .values({
      emailComprador: extra.email ?? "comprador@teste.com",
      nomeComprador: extra.nome ?? "Comprador",
      subtotalCentavos: 1500,
      descontoCentavos: 0,
      totalCentavos: 1500,
      metodo: "pix",
      status,
      pagoEm: status === "pago" ? (extra.pagoEm ?? new Date()) : null,
      expiraEm: new Date(Date.now() + 3_600_000),
    })
    .returning();
  await banco.insert(t.itensPedido).values({
    pedidoId: pedido.id,
    fotoId,
    fotografoId: autorId,
    precoCentavos: 1500,
    descontoCentavos: 0,
    valorFotografoCentavos: extra.valor ?? 1500,
    valorDonoEventoCentavos: 1500 - (extra.valor ?? 1500),
  });
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
  return { usuario, conta: conta! };
}

/** Todos os itens do lote geral, como o navegador pede. */
async function baixarTudo(usuario: Usuario, filtro: object = {}) {
  const liberado = await liberarVendidasDoAutor(usuario, undefined);
  if (!liberado.ok) throw new Error(liberado.erro);
  const itens: ItemParaBaixar[] = [];
  let depois: string | null = null;
  do {
    const lote = await loteDeVendidasDoAutor(
      usuario,
      { filtro, liberacao: liberado.liberacao, depois },
      "203.0.113.7",
    );
    if (!lote.ok) throw new Error(lote.erro);
    itens.push(...lote.itens);
    depois = lote.proximo;
  } while (depois);
  return { itens, liberacao: liberado.liberacao };
}

let dono: Awaited<ReturnType<typeof fotografoNovo>>;
let colaborador: Awaited<ReturnType<typeof fotografoNovo>>;
let eventoDoDono: Awaited<ReturnType<typeof novoEvento>>;
let outroEventoDoDono: Awaited<ReturnType<typeof novoEvento>>;
const f: Record<string, string> = {};

beforeAll(async () => {
  Object.assign(process.env, R2);
  reiniciarClienteR2();
  dono = await fotografoNovo("Dona Vendidas");
  colaborador = await fotografoNovo("Colab Vendidas");
  eventoDoDono = await novoEvento(dono.conta.id, "Corrida da Dona");
  outroEventoDoDono = await novoEvento(dono.conta.id, "Festa da Dona");
  const banco = await obterBanco();
  await banco.insert(t.colaboradores).values({
    eventoId: eventoDoDono.id,
    fotografoId: colaborador.conta.id,
    comissaoDonoPct: 20,
    aceitoEm: new Date(),
  });

  f.paga = await novaFoto(eventoDoDono.id, dono.conta.id);
  f.pagaOutroEvento = await novaFoto(outroEventoDoDono.id, dono.conta.id);
  f.pendente = await novaFoto(eventoDoDono.id, dono.conta.id);
  f.expirada = await novaFoto(eventoDoDono.id, dono.conta.id);
  f.estornada = await novaFoto(eventoDoDono.id, dono.conta.id);
  f.semVenda = await novaFoto(eventoDoDono.id, dono.conta.id);
  f.excluidaDepois = await novaFoto(eventoDoDono.id, dono.conta.id, { excluidaEm: new Date() });
  f.doColaborador = await novaFoto(eventoDoDono.id, colaborador.conta.id);

  await venda(f.paga, dono.conta.id, "pago", {
    email: "joana.silva@exemplo.com",
    nome: "Joana Silva",
    pagoEm: new Date("2026-10-01T15:00:00-03:00"),
  });
  // A mesma foto vendida duas vezes: duas linhas na lista, um arquivo no lote.
  await venda(f.paga, dono.conta.id, "pago", { nome: "Bruno", email: "bruno@teste.com" });
  await venda(f.pagaOutroEvento, dono.conta.id, "pago", {
    nome: "Carla",
    email: "carla@teste.com",
    pagoEm: new Date("2026-09-10T10:00:00-03:00"),
  });
  await venda(f.pendente, dono.conta.id, "pendente");
  await venda(f.expirada, dono.conta.id, "expirado");
  await venda(f.estornada, dono.conta.id, "estornado");
  await venda(f.excluidaDepois, dono.conta.id, "pago");
  // Foto do colaborador vendida no evento da dona: 80% para ele, 20% para ela.
  await venda(f.doColaborador, colaborador.conta.id, "pago", { valor: 1200 });
});

afterAll(() => {
  process.env = antes;
  reiniciarClienteR2();
});

describe("fotos vendidas: o que aparece", () => {
  it("só fotos do próprio autor em pedido pago, de todos os eventos, incluindo a excluída", async () => {
    const { vendas, total } = await listarVendidasDoAutor(dono.conta.id, {}, 1, 48);
    const fotos = new Set(vendas.map((v) => v.fotoId));
    expect(total).toBe(4);
    expect(fotos).toEqual(new Set([f.paga, f.pagaOutroEvento, f.excluidaDepois]));
    for (const fora of [f.pendente, f.expirada, f.estornada, f.semVenda, f.doColaborador]) {
      expect(fotos.has(fora)).toBe(false);
    }
    expect(vendas.find((v) => v.fotoId === f.excluidaDepois)?.excluida).toBe(true);
    // Da venda mais recente para a mais antiga.
    const datas = vendas.map((v) => v.vendidaEm);
    expect([...datas].sort().reverse()).toEqual(datas);
  });

  it("a foto do colaborador vendida no evento do dono aparece só para o colaborador", async () => {
    const doDono = await listarVendidasDoAutor(dono.conta.id, {}, 1, 48);
    expect(doDono.vendas.some((v) => v.fotoId === f.doColaborador)).toBe(false);
    const doColab = await listarVendidasDoAutor(colaborador.conta.id, {}, 1, 48);
    expect(doColab.vendas.map((v) => v.fotoId)).toEqual([f.doColaborador]);
    // A parte dele, não o preço inteiro.
    expect(doColab.vendas[0].valorCentavos).toBe(1200);
  });

  it("mostra o e-mail inteiro do comprador e filtra por comprador, evento e período", async () => {
    const porNome = await listarVendidasDoAutor(dono.conta.id, { comprador: "joana" }, 1, 48);
    expect(porNome.vendas).toHaveLength(1);
    expect(porNome.vendas[0].compradorNome).toBe("Joana Silva");
    expect(porNome.vendas[0].compradorEmail).toBe("joana.silva@exemplo.com");

    const porEmail = await listarVendidasDoAutor(
      dono.conta.id,
      { comprador: "joana.silva@exemplo.com" },
      1,
      48,
    );
    expect(porEmail.vendas.map((v) => v.compradorNome)).toEqual(["Joana Silva"]);

    const porEvento = await listarVendidasDoAutor(
      dono.conta.id,
      { eventoId: outroEventoDoDono.id },
      1,
      48,
    );
    expect(porEvento.vendas.map((v) => v.fotoId)).toEqual([f.pagaOutroEvento]);

    const porPeriodo = await listarVendidasDoAutor(
      dono.conta.id,
      { de: "2026-09-10", ate: "2026-09-10" },
      1,
      48,
    );
    expect(porPeriodo.vendas.map((v) => v.fotoId)).toEqual([f.pagaOutroEvento]);

    // Curingas do LIKE são procurados como texto.
    const curinga = await listarVendidasDoAutor(dono.conta.id, { comprador: "%" }, 1, 48);
    expect(curinga.total).toBe(0);
  });

  it("pagina sem repetir", async () => {
    const p1 = await listarVendidasDoAutor(dono.conta.id, {}, 1, 3);
    const p2 = await listarVendidasDoAutor(dono.conta.id, {}, 2, 3);
    expect(p1.vendas).toHaveLength(3);
    expect(p2.vendas).toHaveLength(1);
    const itens = [...p1.vendas, ...p2.vendas].map((v) => v.itemId);
    expect(new Set(itens).size).toBe(4);
  });
});

describe("fotos vendidas: download em lote", () => {
  it("entrega cada foto vendida uma vez, por URL assinada, e registra por evento", async () => {
    const usuario = (await buscarUsuario(dono.usuario.id))!;
    const resumo = await resumoVendidasParaOAutor(usuario, {});
    expect(resumo).toEqual({ quantidade: 3, bytes: 3_000_000 });

    const { itens } = await baixarTudo(usuario);
    expect(new Set(itens.map((i) => i.id))).toEqual(
      new Set([f.paga, f.pagaOutroEvento, f.excluidaDepois]),
    );
    expect(itens.find((i) => i.id === f.excluidaDepois)?.excluida).toBe(true);
    for (const item of itens) {
      expect(item.url).toContain("X-Amz-Expires=900");
      expect(item.url).toContain("fotos-originais");
    }
    expect(itens.find((i) => i.id === f.paga)?.nome).toMatch(/^vendidas-[\w-]+_Foto_\d+_/);

    const doEvento = await lotesDoDonoRegistrados(eventoDoDono.id);
    expect(doEvento[0]).toMatchObject({ modo: "vendidas_geral", quantidade: 2, ip: "203.0.113.7" });
    const doOutro = await lotesDoDonoRegistrados(outroEventoDoDono.id);
    expect(doOutro[0]).toMatchObject({ modo: "vendidas_geral", quantidade: 1 });
  });

  it("confere cada id no servidor: de outro autor, não vendida ou não paga não volta", async () => {
    const usuario = (await buscarUsuario(dono.usuario.id))!;
    const liberado = await liberarVendidasDoAutor(usuario, undefined);
    if (!liberado.ok) throw new Error(liberado.erro);
    const lote = await loteDeVendidasDoAutor(
      usuario,
      {
        liberacao: liberado.liberacao,
        ids: [f.paga, f.doColaborador, f.semVenda, f.pendente, f.estornada, randomUUID()],
      },
      null,
    );
    expect(lote.ok && lote.itens.map((i) => i.id)).toEqual([f.paga]);

    // O filtro do navegador não abre nada a mais: o evento de outro só devolve vazio.
    const outroFiltro = await loteDeVendidasDoAutor(
      usuario,
      { liberacao: liberado.liberacao, filtro: { eventoId: randomUUID() } },
      null,
    );
    expect(outroFiltro.ok && outroFiltro.itens).toEqual([]);
  });

  it("a liberação é da aba: a de um evento não vale aqui, e a daqui não vale num evento", async () => {
    const usuario = (await buscarUsuario(dono.usuario.id))!;
    const doEvento = await liberarOriginaisDoAutor(usuario, eventoDoDono.id, undefined);
    if (!doEvento.ok) throw new Error(doEvento.erro);
    expect(
      await loteDeVendidasDoAutor(usuario, { liberacao: doEvento.liberacao }, null),
    ).toMatchObject({ ok: false, motivo: "liberacao" });

    const geral = await liberarVendidasDoAutor(usuario, undefined);
    if (!geral.ok) throw new Error(geral.erro);
    expect(
      await originalIndividual(usuario, { fotoId: f.paga, liberacao: geral.liberacao }, null),
    ).toMatchObject({ ok: false, motivo: "liberacao" });

    // Liberação de outra pessoa não serve.
    const colab = (await buscarUsuario(colaborador.usuario.id))!;
    expect(await loteDeVendidasDoAutor(colab, { liberacao: geral.liberacao }, null)).toMatchObject({
      ok: false,
      motivo: "liberacao",
    });
  });

  it("sem conta de fotógrafo ou sem sessão, recusa", async () => {
    const cliente = await criarUsuario({
      nome: "Cliente",
      email: `${randomUUID()}@teste.com`,
      senhaHash: gerarHashSenha("senha-de-teste-123"),
      papel: "cliente",
      emailConfirmado: true,
    });
    expect(await liberarVendidasDoAutor(cliente, undefined)).toMatchObject({ ok: false });
    expect(await liberarVendidasDoAutor(null, undefined)).toMatchObject({ ok: false });
    expect(await resumoVendidasParaOAutor(cliente, {})).toBeNull();
    expect(await loteDeVendidasDoAutor(cliente, { liberacao: "x".repeat(40) }, null)).toMatchObject(
      { ok: false, motivo: "nao_encontrado" },
    );
  });

  it("com a verificação em duas etapas ligada, pede o código para liberar", async () => {
    const { usuario } = await fotografoNovo("Com MFA Vendidas");
    const cadastro = await iniciarCadastroMfa(usuario);
    const segredo = cadastro!.segredo.replace(/\s+/g, "");
    const agora = Date.now();
    const ativacao = await confirmarCadastroMfa(
      usuario.id,
      codigoAtual(segredo, agora - 30_000),
      agora,
    );
    expect(ativacao.ok).toBe(true);
    const comMfa = (await buscarUsuario(usuario.id))!;
    expect(await liberarVendidasDoAutor(comMfa, undefined)).toMatchObject({
      ok: false,
      pedeCodigo: true,
    });
    expect(await liberarVendidasDoAutor(comMfa, "000000")).toMatchObject({ ok: false });
    expect((await liberarVendidasDoAutor(comMfa, codigoAtual(segredo))).ok).toBe(true);
  });
});
