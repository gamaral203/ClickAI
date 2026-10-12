import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
// A rota lê o IP dos cabeçalhos da requisição.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
// A rota lê a sessão; o resto do módulo (contaDoPainel) continua o de verdade.
const sessao = vi.hoisted(() => ({ usuario: null as unknown }));
vi.mock("@/servicos/sessao", async (original) => ({
  ...(await original<typeof import("@/servicos/sessao")>()),
  usuarioAtual: async () => sessao.usuario,
}));

import { GET as rotaDoOriginal } from "@/app/api/painel/original/[fotoId]/route";
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
  liberarOriginaisDoAutor,
  loteDeOriginais,
  originalIndividual,
} from "./originais-do-dono";

// "Baixar original" de uma foto pelo AUTOR dela (docs/CLAUDE.md, exceção do autor): dono do
// evento ou colaborador, sempre só nas fotos que ele mesmo enviou.

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

async function novoEvento(fotografoId: string, titulo = "Evento do original") {
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
    slug: `original-${randomUUID().slice(0, 8)}`,
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
      nomeArquivo: `Chegada ${String(++ordem).padStart(3, "0")}.JPG`,
      largura: 3000,
      altura: 2000,
      tamanhoBytes: 5_000_000,
      ordem,
      status: "pronta",
      ...extra,
    })
    .returning();
  return foto.id;
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

async function fotografoNovo(nome: string) {
  const usuario = await usuarioNovo("fotografo");
  const conta = await criarContaDeFotografoSeNaoExistir({
    usuarioId: usuario.id,
    nomePublico: nome,
    slug: `${nome.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}`,
  });
  return { usuario, conta: conta! };
}

/** Libera e baixa, como o botão faz. */
async function baixarComoAutor(usuario: Usuario | null, eventoId: string, fotoId: string) {
  const liberado = await liberarOriginaisDoAutor(usuario, eventoId, undefined);
  const liberacao = liberado.ok ? liberado.liberacao : "x".repeat(40);
  return originalIndividual(usuario, { fotoId, liberacao }, "203.0.113.7");
}

async function chamarRota(fotoId: string, liberacao: string | null, formato?: "json") {
  const url = new URL(`http://localhost/api/painel/original/${fotoId}`);
  if (liberacao) url.searchParams.set("liberacao", liberacao);
  if (formato) url.searchParams.set("formato", formato);
  return rotaDoOriginal(new NextRequest(url), {
    params: Promise.resolve({ fotoId }),
  } as RouteContext<"/api/painel/original/[fotoId]">);
}

let usuarioLia: Usuario;
let usuarioPedro: Usuario;
let evento: Awaited<ReturnType<typeof novoEvento>>;
const f: Record<string, string> = {};

beforeAll(async () => {
  Object.assign(process.env, R2);
  reiniciarClienteR2();
  usuarioLia = (await buscarUsuario(lia.usuarioId))!;
  usuarioPedro = (await buscarUsuario(pedro.usuarioId))!;
  evento = await novoEvento(lia.id);
  const banco = await obterBanco();
  // Pedro colabora no evento da Lia (convite aceito).
  await banco.insert(t.colaboradores).values({
    eventoId: evento.id,
    fotografoId: pedro.id,
    comissaoDonoPct: 20,
    aceitoEm: new Date(),
  });
  f.lia = await novaFoto(evento.id, lia.id);
  f.liaExcluida = await novaFoto(evento.id, lia.id, { excluidaEm: new Date() });
  f.liaProcessando = await novaFoto(evento.id, lia.id, { status: "processando" });
  f.pedro = await novaFoto(evento.id, pedro.id);
});

afterAll(() => {
  process.env = antes;
  reiniciarClienteR2();
});

describe("original individual: o autor baixa", () => {
  it("o dono baixa a própria foto por URL assinada de 15 min, como anexo e com nome legível", async () => {
    const resultado = await baixarComoAutor(usuarioLia, evento.id, f.lia);
    if (!resultado.ok) throw new Error(resultado.motivo);
    expect(resultado.exemplo).toBe(false);
    const url = new URL(resultado.url);
    expect(url.hostname).toBe("fotos-originais.conta-teste.r2.cloudflarestorage.com");
    expect(url.pathname).toContain(`/originais/${lia.id}/${evento.id}/${f.lia}.jpg`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("response-content-disposition")).toMatch(
      new RegExp(`^attachment; filename="Chegada_\\d{3}_${f.lia.slice(0, 8)}\\.jpg"`),
    );
  });

  it("o dono também baixa a foto que excluiu; a que ainda não ficou pronta, não", async () => {
    expect((await baixarComoAutor(usuarioLia, evento.id, f.liaExcluida)).ok).toBe(true);
    expect(await baixarComoAutor(usuarioLia, evento.id, f.liaProcessando)).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
  });

  it("o colaborador baixa a própria foto e é recusado na do dono", async () => {
    expect((await baixarComoAutor(usuarioPedro, evento.id, f.pedro)).ok).toBe(true);
    expect(await baixarComoAutor(usuarioPedro, evento.id, f.lia)).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
    // Nem com a liberação da Lia (ela é presa ao usuário).
    const daLia = await liberarOriginaisDoAutor(usuarioLia, evento.id, undefined);
    if (!daLia.ok) throw new Error();
    expect(
      await originalIndividual(usuarioPedro, { fotoId: f.pedro, liberacao: daLia.liberacao }, null),
    ).toEqual({ ok: false, motivo: "liberacao" });
  });

  it("o dono é recusado na foto do colaborador, individual e no lote de vendidas", async () => {
    expect(await baixarComoAutor(usuarioLia, evento.id, f.pedro)).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
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
        status: "pago",
        expiraEm: new Date(Date.now() + 3_600_000),
      })
      .returning();
    await banco.insert(t.itensPedido).values({
      pedidoId: pedido.id,
      fotoId: f.pedro,
      fotografoId: pedro.id,
      precoCentavos: 1500,
      descontoCentavos: 0,
      valorFotografoCentavos: 1500,
      valorDonoEventoCentavos: 0,
    });
    const liberado = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!liberado.ok) throw new Error();
    const lote = await loteDeOriginais(
      usuarioLia,
      { eventoId: evento.id, modo: "vendidas", liberacao: liberado.liberacao, ids: [f.pedro] },
      null,
    );
    expect(lote).toMatchObject({ ok: true, itens: [] });
  });

  it("gestor, cliente, outro fotógrafo e visitante: recusados", async () => {
    const gestor = await usuarioNovo("admin");
    const cliente = await usuarioNovo("cliente");
    const { usuario: outro } = await fotografoNovo("Outro");
    for (const quem of [gestor, cliente, outro, null]) {
      expect((await liberarOriginaisDoAutor(quem, evento.id, undefined)).ok).toBe(false);
      for (const foto of [f.lia, f.pedro]) {
        expect(
          await originalIndividual(quem, { fotoId: foto, liberacao: "x".repeat(40) }, null),
        ).toEqual({ ok: false, motivo: "nao_encontrado" });
      }
    }
    // O gestor baixa só o que enviou pela própria conta de fotógrafo.
    const contaDoGestor = await buscarContaDoFotografo(gestor.id);
    expect(contaDoGestor).not.toBeNull();
    const doGestor = await novoEvento(contaDoGestor!.id, "Evento do gestor");
    const fotoDoGestor = await novaFoto(doGestor.id, contaDoGestor!.id);
    expect((await baixarComoAutor(gestor, doGestor.id, fotoDoGestor)).ok).toBe(true);
  });

  it("liberação ausente, adulterada ou de outro evento não vale", async () => {
    const outroEvento = await novoEvento(lia.id, "Outro evento da Lia");
    await novaFoto(outroEvento.id, lia.id);
    const deOutro = await liberarOriginaisDoAutor(usuarioLia, outroEvento.id, undefined);
    const doEvento = await liberarOriginaisDoAutor(usuarioLia, evento.id, undefined);
    if (!deOutro.ok || !doEvento.ok) throw new Error();
    for (const liberacao of [null, "curta", deOutro.liberacao, `${doEvento.liberacao}x`]) {
      expect(await originalIndividual(usuarioLia, { fotoId: f.lia, liberacao }, null)).toEqual({
        ok: false,
        motivo: "liberacao",
      });
    }
    // A liberação do lote do dono serve também para a foto individual (mesmo evento).
    const doLote = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!doLote.ok) throw new Error();
    expect(
      (await originalIndividual(usuarioLia, { fotoId: f.lia, liberacao: doLote.liberacao }, null))
        .ok,
    ).toBe(true);
  });

  it("registra cada foto na auditoria com o modo individual, sem URL", async () => {
    const doEvento = await novoEvento(lia.id, "Evento auditado");
    const foto = await novaFoto(doEvento.id, lia.id);
    expect((await baixarComoAutor(usuarioLia, doEvento.id, foto)).ok).toBe(true);
    const [registro] = await lotesDoDonoRegistrados(doEvento.id);
    expect(registro).toMatchObject({
      eventoId: doEvento.id,
      fotografoId: lia.id,
      usuarioId: usuarioLia.id,
      modo: "individual",
      quantidade: 1,
      ip: "203.0.113.7",
    });
    expect(JSON.stringify(registro)).not.toMatch(/X-Amz|originais\//);
    // Recusa não registra nada.
    await baixarComoAutor(usuarioPedro, doEvento.id, foto);
    expect(await lotesDoDonoRegistrados(doEvento.id)).toHaveLength(1);
  });

  it("recusa além de 60 originais em 10 minutos por usuário", async () => {
    const { usuario, conta } = await fotografoNovo("Apressado");
    const doEvento = await novoEvento(conta.id, "Evento apressado");
    const foto = await novaFoto(doEvento.id, conta.id);
    const liberado = await liberarOriginaisDoAutor(usuario, doEvento.id, undefined);
    if (!liberado.ok) throw new Error();
    const pedido = { fotoId: foto, liberacao: liberado.liberacao };
    // 59 já baixados; o 60º ainda passa, o 61º não.
    for (let i = 0; i < 59; i++) await limiteAtingido("original_autor_usuario", usuario.id);
    expect((await originalIndividual(usuario, pedido, null)).ok).toBe(true);
    expect(await originalIndividual(usuario, pedido, null)).toEqual({
      ok: false,
      motivo: "limite",
    });
  });

  it("com a verificação em duas etapas ligada, pede o código para liberar", async () => {
    const { usuario, conta } = await fotografoNovo("Com MFA");
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
    const doEvento = await novoEvento(conta.id, "Evento com MFA");
    const foto = await novaFoto(doEvento.id, conta.id);

    expect(await liberarOriginaisDoAutor(comMfa, doEvento.id, undefined)).toMatchObject({
      ok: false,
      pedeCodigo: true,
    });
    expect(await liberarOriginaisDoAutor(comMfa, doEvento.id, "000000")).toMatchObject({
      ok: false,
    });
    const liberado = await liberarOriginaisDoAutor(comMfa, doEvento.id, codigoAtual(segredo));
    if (!liberado.ok) throw new Error(liberado.erro);
    expect(
      (await originalIndividual(comMfa, { fotoId: foto, liberacao: liberado.liberacao }, null)).ok,
    ).toBe(true);
  });
});

describe("rota /api/painel/original/[fotoId]", () => {
  it("responde 302 para a URL assinada do R2, sem cache", async () => {
    sessao.usuario = usuarioPedro;
    const liberado = await liberarOriginaisDoAutor(usuarioPedro, evento.id, undefined);
    if (!liberado.ok) throw new Error();
    const resposta = await chamarRota(f.pedro, liberado.liberacao);
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const destino = new URL(resposta.headers.get("location")!);
    expect(destino.hostname).toBe("fotos-originais.conta-teste.r2.cloudflarestorage.com");
    expect(destino.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(destino.searchParams.get("response-content-disposition")).toMatch(/^attachment;/);
    const [registro] = await lotesDoDonoRegistrados(evento.id);
    expect(registro).toMatchObject({ modo: "individual", ip: "203.0.113.9" });
  });

  it("recusa foto de outro autor, visitante e liberação ausente, sem redirecionar", async () => {
    const liberado = await liberarOriginaisDoAutor(usuarioPedro, evento.id, undefined);
    if (!liberado.ok) throw new Error();
    sessao.usuario = usuarioPedro;
    expect((await chamarRota(f.lia, liberado.liberacao)).status).toBe(404);
    expect((await chamarRota(f.pedro, null)).status).toBe(403);
    expect((await chamarRota("nao-e-uuid", liberado.liberacao)).status).toBe(404);
    sessao.usuario = null;
    const visitante = await chamarRota(f.pedro, liberado.liberacao);
    expect(visitante.status).toBe(404);
    expect(visitante.headers.get("location")).toBeNull();
  });

  it("com formato=json, devolve a URL assinada ou o erro em JSON, sem redirecionar", async () => {
    sessao.usuario = usuarioPedro;
    const liberado = await liberarOriginaisDoAutor(usuarioPedro, evento.id, undefined);
    if (!liberado.ok) throw new Error();
    const resposta = await chamarRota(f.pedro, liberado.liberacao, "json");
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(resposta.headers.get("location")).toBeNull();
    const { url } = (await resposta.json()) as { url: string };
    expect(new URL(url).hostname).toBe("fotos-originais.conta-teste.r2.cloudflarestorage.com");

    const semLiberacao = await chamarRota(f.pedro, null, "json");
    expect(semLiberacao.status).toBe(403);
    expect(await semLiberacao.json()).toEqual({
      erro: "A liberação do download venceu. Volte ao painel e clique em Baixar original de novo.",
    });
    const deOutro = await chamarRota(f.lia, liberado.liberacao, "json");
    expect(deOutro.status).toBe(404);
    expect(await deOutro.json()).toEqual({ erro: "Foto não encontrada." });
  });
});
