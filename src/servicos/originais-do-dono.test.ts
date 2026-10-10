import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarContaDoFotografo,
  buscarUsuario,
  criarContaDeFotografoSeNaoExistir,
  criarEvento,
  criarUsuario,
  lotesDoDonoRegistrados,
  type Usuario,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { codigoAtual } from "@/lib/mfa";
import { reiniciarClienteR2 } from "@/lib/r2";
import { gerarHashSenha } from "@/lib/senha";

import { limiteAtingido } from "./limites";
import { confirmarCadastroMfa, iniciarCadastroMfa } from "./mfa";
import {
  liberarOriginais,
  loteDeOriginais,
  nomeDoOriginal,
  ORIGINAIS_POR_LOTE,
  resumoParaODono,
  type ItemParaBaixar,
} from "./originais-do-dono";

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

const BASE_EVENTO = {
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
  fotosSoAposBusca: false,
  liberacao: "automatica",
  liberadoEm: null,
  filtroHorario: false,
  listarNaoIdentificadas: false,
  ordenacao: "envio",
} as const;

async function novoEvento(fotografoId: string, titulo = "Evento dos originais") {
  return criarEvento(fotografoId, {
    ...BASE_EVENTO,
    titulo,
    slug: `originais-${randomUUID().slice(0, 8)}`,
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
      tamanhoBytes: 5_000_000,
      ordem,
      status: "pronta",
      ...extra,
    })
    .returning();
  return foto;
}

type StatusPedido = (typeof t.statusPedido.enumValues)[number];
async function venda(fotoId: string, autorId: string, status: StatusPedido) {
  const banco = await obterBanco();
  const [pedido] = await banco
    .insert(t.pedidos)
    .values({
      emailComprador: "comprador@teste.com",
      nomeComprador: "Comprador",
      subtotalCentavos: 1500,
      descontoCentavos: 0,
      totalCentavos: 1500,
      metodo: "pix",
      status,
      expiraEm: new Date(Date.now() + 3_600_000),
    })
    .returning();
  await banco.insert(t.itensPedido).values({
    pedidoId: pedido.id,
    fotoId,
    fotografoId: autorId,
    precoCentavos: 1500,
    descontoCentavos: 0,
    valorFotografoCentavos: 1500,
    valorDonoEventoCentavos: 0,
  });
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

/** Todos os itens do modo, lote a lote, como o navegador pede. */
async function todos(usuario: Usuario, eventoId: string, modo: "vendidas" | "minhas") {
  const liberado = await liberarOriginais(usuario, eventoId, undefined);
  if (!liberado.ok) throw new Error(liberado.erro);
  const itens: ItemParaBaixar[] = [];
  const tamanhos: number[] = [];
  let depois: string | null = null;
  do {
    const lote = await loteDeOriginais(
      usuario,
      { eventoId, modo, liberacao: liberado.liberacao, depois },
      "203.0.113.7",
    );
    if (!lote.ok) throw new Error(lote.erro);
    itens.push(...lote.itens);
    tamanhos.push(lote.itens.length);
    depois = lote.proximo;
  } while (depois);
  return { itens, tamanhos, liberacao: liberado.liberacao };
}

let usuarioLia: Usuario;
let usuarioPedro: Usuario;
let evento: Awaited<ReturnType<typeof novoEvento>>;
let outroEvento: Awaited<ReturnType<typeof novoEvento>>;
const f: Record<string, string> = {};

beforeAll(async () => {
  Object.assign(process.env, R2);
  reiniciarClienteR2();
  usuarioLia = (await buscarUsuario(lia.usuarioId))!;
  usuarioPedro = (await buscarUsuario(pedro.usuarioId))!;
  evento = await novoEvento(lia.id);
  outroEvento = await novoEvento(lia.id, "Outro evento da Lia");
  const banco = await obterBanco();
  // Pedro colabora no evento (convite aceito).
  await banco.insert(t.colaboradores).values({
    eventoId: evento.id,
    fotografoId: pedro.id,
    comissaoDonoPct: 20,
    aceitoEm: new Date(),
  });

  f.liaPaga = (await novaFoto(evento.id, lia.id)).id;
  f.liaPagaDuasVezes = (await novaFoto(evento.id, lia.id)).id;
  f.liaPendente = (await novaFoto(evento.id, lia.id)).id;
  f.liaCancelada = (await novaFoto(evento.id, lia.id)).id;
  f.liaEstornada = (await novaFoto(evento.id, lia.id)).id;
  f.liaContestada = (await novaFoto(evento.id, lia.id)).id;
  f.liaSemVenda = (await novaFoto(evento.id, lia.id)).id;
  f.liaExcluidaVendida = (await novaFoto(evento.id, lia.id, { excluidaEm: new Date() })).id;
  f.liaProcessando = (await novaFoto(evento.id, lia.id, { status: "processando" })).id;
  f.pedroPaga = (await novaFoto(evento.id, pedro.id)).id;
  f.pedroSemVenda = (await novaFoto(evento.id, pedro.id)).id;
  f.outroEventoPaga = (await novaFoto(outroEvento.id, lia.id)).id;

  await venda(f.liaPaga, lia.id, "pago");
  await venda(f.liaPagaDuasVezes, lia.id, "pago");
  await venda(f.liaPagaDuasVezes, lia.id, "pago");
  await venda(f.liaPendente, lia.id, "pendente");
  await venda(f.liaCancelada, lia.id, "cancelado");
  await venda(f.liaEstornada, lia.id, "estornado");
  await venda(f.liaContestada, lia.id, "contestado");
  await venda(f.liaExcluidaVendida, lia.id, "pago");
  await venda(f.pedroPaga, pedro.id, "pago");
  await venda(f.outroEventoPaga, lia.id, "pago");
});

afterAll(() => {
  process.env = antes;
  reiniciarClienteR2();
});

describe("originais do dono: o que entra", () => {
  it("(a) vendidas: só pedidos pagos, inclusive as do colaborador e as excluídas, sem repetir", async () => {
    const { itens } = await todos(usuarioLia, evento.id, "vendidas");
    expect(itens.map((i) => i.id).sort()).toEqual(
      [f.liaPaga, f.liaPagaDuasVezes, f.liaExcluidaVendida, f.pedroPaga].sort(),
    );
    // Pendente, cancelado, estornado e contestado não entram; foto de outro evento também não.
    for (const fora of [
      f.liaPendente,
      f.liaCancelada,
      f.liaEstornada,
      f.liaContestada,
      f.outroEventoPaga,
    ]) {
      expect(itens.some((i) => i.id === fora)).toBe(false);
    }
  });

  it("(b) minhas: tudo o que o dono enviou e está pronto, com as excluídas marcadas", async () => {
    const { itens } = await todos(usuarioLia, evento.id, "minhas");
    const ids = itens.map((i) => i.id);
    expect(ids).toContain(f.liaSemVenda);
    expect(ids).toContain(f.liaPendente);
    expect(ids).toContain(f.liaExcluidaVendida);
    // Fotos do colaborador, ainda em processamento e de outro evento ficam de fora.
    expect(ids).not.toContain(f.pedroPaga);
    expect(ids).not.toContain(f.pedroSemVenda);
    expect(ids).not.toContain(f.liaProcessando);
    expect(ids).not.toContain(f.outroEventoPaga);
    expect(itens.find((i) => i.id === f.liaExcluidaVendida)?.excluida).toBe(true);
    expect(itens.find((i) => i.id === f.liaSemVenda)?.excluida).toBe(false);
  });

  it("resumo das duas opções para a tela", async () => {
    const resumo = await resumoParaODono(usuarioLia, evento.id);
    expect(resumo?.vendidas).toEqual({ quantidade: 4, bytes: 20_000_000, excluidas: 0 });
    expect(resumo?.minhas.quantidade).toBe(8);
    expect(resumo?.minhas.excluidas).toBe(1);
  });

  it("entrega URL assinada de GET de 15 min, como anexo e com nome legível e único", async () => {
    const { itens } = await todos(usuarioLia, evento.id, "minhas");
    const item = itens.find((i) => i.id === f.liaSemVenda)!;
    const url = new URL(item.url);
    expect(url.hostname).toBe("fotos-originais.conta-teste.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("response-content-disposition")).toMatch(
      /^attachment; filename="IMG_\d{4}_[0-9a-f]{8}\.jpg"/,
    );
    expect(new Set(itens.map((i) => i.nome)).size).toBe(itens.length);
    expect(
      nomeDoOriginal({ id: "abcdef12-0000", nomeArquivo: "Chegada Ação!.heic", chave: "x.jpg" }),
    ).toBe("Chegada_Acao_abcdef12.jpg");
  });

  it("pedir ids de outro evento ou fora da opção não devolve nada (sem IDOR)", async () => {
    const liberado = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!liberado.ok) throw new Error();
    const lote = await loteDeOriginais(
      usuarioLia,
      {
        eventoId: evento.id,
        modo: "vendidas",
        liberacao: liberado.liberacao,
        ids: [f.outroEventoPaga, f.liaPendente, f.liaPaga],
      },
      null,
    );
    expect(lote.ok && lote.itens.map((i) => i.id)).toEqual([f.liaPaga]);
  });

  it("registra cada lote (quem, evento, opção, quantos, IP), sem URL", async () => {
    await todos(usuarioLia, outroEvento.id, "vendidas");
    const [registro] = await lotesDoDonoRegistrados(outroEvento.id);
    expect(registro).toMatchObject({
      eventoId: outroEvento.id,
      fotografoId: lia.id,
      usuarioId: usuarioLia.id,
      modo: "vendidas",
      quantidade: 1,
      ip: "203.0.113.7",
    });
    expect(JSON.stringify(registro)).not.toMatch(/X-Amz|originais\//);
  });
});

describe("originais do dono: quem pode", () => {
  it("colaborador do evento é recusado, mesmo com a liberação do dono", async () => {
    expect(await liberarOriginais(usuarioPedro, evento.id, undefined)).toMatchObject({
      ok: false,
    });
    expect(await resumoParaODono(usuarioPedro, evento.id)).toBeNull();
    const daLia = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!daLia.ok) throw new Error();
    const lote = await loteDeOriginais(
      usuarioPedro,
      { eventoId: evento.id, modo: "vendidas", liberacao: daLia.liberacao },
      null,
    );
    expect(lote).toMatchObject({ ok: false, motivo: "nao_encontrado" });
  });

  it("gestor (com a própria conta de fotógrafo), outro fotógrafo, cliente e visitante: recusados", async () => {
    const gestor = await usuarioNovo("admin");
    const cliente = await usuarioNovo("cliente");
    const outro = await usuarioNovo("fotografo");
    await criarContaDeFotografoSeNaoExistir({
      usuarioId: outro.id,
      nomePublico: "Outro",
      slug: `outro-${randomUUID().slice(0, 8)}`,
    });
    for (const quem of [gestor, cliente, outro, null]) {
      expect((await liberarOriginais(quem, evento.id, undefined)).ok).toBe(false);
      expect(await resumoParaODono(quem, evento.id)).toBeNull();
      const lote = await loteDeOriginais(
        quem,
        { eventoId: evento.id, modo: "minhas", liberacao: "x".repeat(40) },
        null,
      );
      expect(lote).toMatchObject({ ok: false, motivo: "nao_encontrado" });
    }
    // O gestor usa o painel com a própria conta de fotógrafo (criada no primeiro acesso):
    // baixa só o evento que essa conta criou.
    const contaDoGestor = await buscarContaDoFotografo(gestor.id);
    expect(contaDoGestor).not.toBeNull();
    const doGestor = await novoEvento(contaDoGestor!.id, "Evento do gestor");
    expect((await liberarOriginais(gestor, doGestor.id, undefined)).ok).toBe(true);
  });

  it("liberação de outro evento, de outra pessoa ou adulterada não vale", async () => {
    const deOutroEvento = await liberarOriginais(usuarioLia, outroEvento.id, undefined);
    if (!deOutroEvento.ok) throw new Error();
    for (const liberacao of [deOutroEvento.liberacao, `${deOutroEvento.liberacao}x`]) {
      const lote = await loteDeOriginais(
        usuarioLia,
        { eventoId: evento.id, modo: "minhas", liberacao },
        null,
      );
      expect(lote).toMatchObject({ ok: false, motivo: "liberacao" });
    }
  });

  it("com a verificação em duas etapas ligada, pede o código para liberar", async () => {
    const usuario = await usuarioNovo("fotografo");
    const conta = await criarContaDeFotografoSeNaoExistir({
      usuarioId: usuario.id,
      nomePublico: "Com MFA",
      slug: `mfa-${randomUUID().slice(0, 8)}`,
    });
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
    expect(comMfa.mfaAtivo).toBe(true);
    const doEvento = await novoEvento(conta!.id, "Evento com MFA");

    expect(await liberarOriginais(comMfa, doEvento.id, undefined)).toMatchObject({
      ok: false,
      pedeCodigo: true,
    });
    expect(await liberarOriginais(comMfa, doEvento.id, "000000")).toMatchObject({ ok: false });
    expect((await liberarOriginais(comMfa, doEvento.id, codigoAtual(segredo))).ok).toBe(true);
  });
});

describe("originais do dono: lotes e limite", () => {
  it("pagina em lotes de 50 pela ordem do id, sem repetir nem pular", async () => {
    const grande = await novoEvento(lia.id, "Evento grande");
    const criadas = new Set<string>();
    for (let i = 0; i < 2 * ORIGINAIS_POR_LOTE + 7; i++) {
      criadas.add((await novaFoto(grande.id, lia.id)).id);
    }
    const { itens, tamanhos } = await todos(usuarioLia, grande.id, "minhas");
    expect(tamanhos).toEqual([50, 50, 7]);
    expect(new Set(itens.map((i) => i.id))).toEqual(criadas);
    expect(itens.map((i) => i.id)).toEqual([...itens.map((i) => i.id)].sort());
  });

  it("recusa além de 120 lotes em 10 minutos por usuário", async () => {
    const usuario = await usuarioNovo("fotografo");
    const conta = await criarContaDeFotografoSeNaoExistir({
      usuarioId: usuario.id,
      nomePublico: "Apressada",
      slug: `apressada-${randomUUID().slice(0, 8)}`,
    });
    const doEvento = await novoEvento(conta!.id, "Evento apressado");
    await novaFoto(doEvento.id, conta!.id);
    const liberado = await liberarOriginais(usuario, doEvento.id, undefined);
    if (!liberado.ok) throw new Error();
    const pedido = { eventoId: doEvento.id, modo: "minhas", liberacao: liberado.liberacao };
    // 119 lotes já pedidos; o 120º ainda passa, o 121º não.
    for (let i = 0; i < 119; i++) await limiteAtingido("originais_dono_usuario", usuario.id);
    expect((await loteDeOriginais(usuario, pedido, null)).ok).toBe(true);
    expect(await loteDeOriginais(usuario, pedido, null)).toMatchObject({
      ok: false,
      motivo: "limite",
    });
  });

  it("recusa pedido malformado", async () => {
    for (const entrada of [
      null,
      { eventoId: "x", modo: "minhas", liberacao: "x".repeat(40) },
      { eventoId: evento.id, modo: "todas", liberacao: "x".repeat(40) },
      {
        eventoId: evento.id,
        modo: "minhas",
        liberacao: "x".repeat(40),
        ids: Array(51).fill(f.liaPaga),
      },
    ]) {
      expect(await loteDeOriginais(usuarioLia, entrada, null)).toMatchObject({
        ok: false,
        motivo: "invalido",
      });
    }
  });
});
