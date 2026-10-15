import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
// A rota lê a sessão; o teste escolhe quem está logado.
const sessao = vi.hoisted(() => ({ usuario: null as unknown }));
vi.mock("@/servicos/sessao", async (original) => ({
  ...(await original<typeof import("@/servicos/sessao")>()),
  usuarioAtual: async () => sessao.usuario,
}));

import { GET as rotaDeDownload } from "@/app/api/download/[itemId]/route";
import { buscarUsuario, criarEvento, criarUsuario, type Usuario } from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { reiniciarClienteR2 } from "@/lib/r2";
import { gerarHashSenha } from "@/lib/senha";

import { autorizarDownload } from "./downloads";
import { linkDoPedido, linkParaRecuperar } from "./mensagens";

// IDOR no download do original (docs/CLAUDE.md, regra 1; docs/riscos.md, "trocar o id na URL"):
// só item de pedido PAGO, de quem tem o token do pedido (ou o link assinado dele) ou é o cliente
// logado dono do pedido. Trocar o itemId, o token ou o cliente não abre nada; a resposta da rota
// é a mesma para todo motivo de recusa (não revela se o item existe).

const [lia] = fotografos;

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};
const antes = { ...process.env };
const HOST_ORIGINAIS = "fotos-originais.conta-teste.r2.cloudflarestorage.com";

type StatusPedido = (typeof t.statusPedido.enumValues)[number];

let evento: Awaited<ReturnType<typeof criarEvento>>;
let ordem = 0;

async function novaFoto(chaveOriginal?: string) {
  const banco = await obterBanco();
  const id = randomUUID();
  await banco.insert(t.fotos).values({
    id,
    eventoId: evento.id,
    enviadaPor: lia.id,
    chaveOriginal: chaveOriginal ?? `originais/${lia.id}/${evento.id}/${id}.jpg`,
    urlPrevia: `previas/${lia.id}/${evento.id}/${id}-v4.webp`,
    urlMiniatura: `miniaturas/${lia.id}/${evento.id}/${id}-v4.webp`,
    nomeArquivo: `IMG_${++ordem}.JPG`,
    largura: 3000,
    altura: 2000,
    tamanhoBytes: 5_000_000,
    ordem,
    status: "pronta",
    liberarEm: new Date(Date.now() - 60_000),
  });
  return id;
}

/** Pedido com um item da foto, gravado direto no banco; devolve o token do link. */
async function novoPedido(
  fotoId: string,
  extra: Partial<typeof t.pedidos.$inferInsert> & { status?: StatusPedido } = {},
) {
  const banco = await obterBanco();
  const token = randomUUID() + randomUUID();
  const [pedido] = await banco
    .insert(t.pedidos)
    .values({
      emailComprador: `${randomUUID()}@teste.com`,
      nomeComprador: "Comprador",
      tokenAcessoHash: createHash("sha256").update(token).digest("hex"),
      subtotalCentavos: 1500,
      descontoCentavos: 0,
      totalCentavos: 1500,
      metodo: "pix",
      status: "pago",
      expiraEm: new Date(Date.now() + 3_600_000),
      ...extra,
    })
    .returning();
  const [item] = await banco
    .insert(t.itensPedido)
    .values({
      pedidoId: pedido.id,
      fotoId,
      fotografoId: lia.id,
      precoCentavos: 1500,
      descontoCentavos: 0,
      valorFotografoCentavos: 1500,
      valorDonoEventoCentavos: 0,
    })
    .returning();
  return { pedidoId: pedido.id, itemId: item.id, token };
}

async function clienteNovo() {
  return criarUsuario({
    nome: "Cliente",
    email: `${randomUUID()}@teste.com`,
    senhaHash: gerarHashSenha("senha-de-teste-123"),
    papel: "cliente",
    emailConfirmado: true,
  });
}

function chamarRota(itemId: string, token: string | null, ip = "198.51.100.10") {
  const url = new URL(`http://localhost/api/download/${itemId}`);
  if (token) url.searchParams.set("token", token);
  return rotaDeDownload(new NextRequest(url, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ itemId }),
  } as RouteContext<"/api/download/[itemId]">);
}

beforeAll(async () => {
  Object.assign(process.env, R2);
  reiniciarClienteR2();
  evento = await criarEvento(lia.id, {
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
    titulo: "Evento do IDOR",
    slug: `idor-${randomUUID().slice(0, 8)}`,
  });
});

afterEach(() => {
  sessao.usuario = null;
  vi.unstubAllEnvs();
});

afterAll(() => {
  process.env = antes;
  reiniciarClienteR2();
});

describe("download do original: só pedido pago do próprio cliente", () => {
  it("item pago com o token do próprio pedido: URL assinada de 15 min do bucket privado", async () => {
    const fotoId = await novaFoto();
    const { itemId, token } = await novoPedido(fotoId);
    const original = await autorizarDownload(itemId, { token }, "203.0.113.1");
    expect(original?.tipo).toBe("r2");
    const url = new URL(original!.url);
    expect(url.hostname).toBe(HOST_ORIGINAIS);
    expect(url.pathname).toBe(`/originais/${lia.id}/${evento.id}/${fotoId}.jpg`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^attachment;/);
    // Nunca o bucket público.
    expect(original!.url).not.toContain("pub-teste.r2.dev");
    expect(original!.url).not.toContain("fotos-publicas");
    // O download fica registrado.
    const banco = await obterBanco();
    const registros = await banco
      .select()
      .from(t.downloads)
      .where(eq(t.downloads.itemPedidoId, itemId));
    expect(registros).toHaveLength(1);
  });

  it("o link assinado do próprio pedido (e-mail/WhatsApp) também vale", async () => {
    const { itemId, pedidoId } = await novoPedido(await novaFoto());
    const token = new URL(linkDoPedido(pedidoId)).searchParams.get("token")!;
    expect((await autorizarDownload(itemId, { token }, null))?.tipo).toBe("r2");
  });

  it("pedido pendente, expirado, cancelado, estornado ou contestado não baixa", async () => {
    for (const status of [
      "pendente",
      "expirado",
      "cancelado",
      "estornado",
      "contestado",
    ] as const) {
      const { itemId, token } = await novoPedido(await novaFoto(), { status });
      expect(await autorizarDownload(itemId, { token }, null), status).toBeNull();
    }
  });

  it("pago, mas com reembolso pedido ou acesso vencido, não baixa", async () => {
    const reembolso = await novoPedido(await novaFoto(), { reembolsoSolicitadoEm: new Date() });
    expect(await autorizarDownload(reembolso.itemId, { token: reembolso.token }, null)).toBeNull();
    const vencido = await novoPedido(await novaFoto(), {
      acessoExpiraEm: new Date(Date.now() - 1000),
    });
    expect(await autorizarDownload(vencido.itemId, { token: vencido.token }, null)).toBeNull();
  });

  it("trocar o itemId: o token do meu pedido não abre o item pago de outro pedido", async () => {
    const fotoComprada = await novaFoto();
    const meu = await novoPedido(fotoComprada);
    const deOutro = await novoPedido(await novaFoto());
    // Mesmo a mesma foto, comprada por outra pessoa: o item é do pedido, não da foto.
    const mesmaFoto = await novoPedido(fotoComprada);
    expect(await autorizarDownload(deOutro.itemId, { token: meu.token }, null)).toBeNull();
    expect(await autorizarDownload(mesmaFoto.itemId, { token: meu.token }, null)).toBeNull();
    // Nem pelo link assinado do meu pedido.
    const meuLink = new URL(linkDoPedido(meu.pedidoId)).searchParams.get("token")!;
    expect(await autorizarDownload(deOutro.itemId, { token: meuLink }, null)).toBeNull();
    // Item inexistente.
    expect(await autorizarDownload(randomUUID(), { token: meu.token }, null)).toBeNull();
  });

  it("token errado, vazio, adulterado ou de outro propósito não baixa", async () => {
    const { itemId, pedidoId, token } = await novoPedido(await novaFoto());
    const recuperar = new URL(linkParaRecuperar(pedidoId)).searchParams.get("token")!;
    const link = new URL(linkDoPedido(pedidoId)).searchParams.get("token")!;
    for (const errado of [
      null,
      "",
      "x".repeat(40),
      `${token}x`,
      token.slice(0, -1),
      // Link de recuperar o carrinho do mesmo pedido: assinado, mas para outra coisa.
      recuperar,
      `${link.slice(0, -2)}AA`,
    ]) {
      expect(await autorizarDownload(itemId, { token: errado }, null)).toBeNull();
    }
  });

  it("cliente logado: baixa o item do próprio pedido, nunca o de outro cliente", async () => {
    const dono = await clienteNovo();
    const outro = await clienteNovo();
    const { itemId } = await novoPedido(await novaFoto(), { clienteId: dono.id });
    expect((await autorizarDownload(itemId, { clienteId: dono.id }, null))?.tipo).toBe("r2");
    expect(await autorizarDownload(itemId, { clienteId: outro.id }, null)).toBeNull();
    expect(await autorizarDownload(itemId, {}, null)).toBeNull();
    // Pedido de convidado (sem cliente) não abre para qualquer logado.
    const convidado = await novoPedido(await novaFoto());
    expect(await autorizarDownload(convidado.itemId, { clienteId: outro.id }, null)).toBeNull();
  });

  it("foto ainda em envio (envios/) ou sem original não baixa, mesmo paga", async () => {
    const emEnvio = await novaFoto(`envios/${lia.id}/${evento.id}/${randomUUID()}.jpg`);
    const a = await novoPedido(emEnvio);
    expect(await autorizarDownload(a.itemId, { token: a.token }, null)).toBeNull();
    const banco = await obterBanco();
    const semOriginal = await novaFoto();
    await banco.update(t.fotos).set({ chaveOriginal: null }).where(eq(t.fotos.id, semOriginal));
    const b = await novoPedido(semOriginal);
    expect(await autorizarDownload(b.itemId, { token: b.token }, null)).toBeNull();
  });

  it("original de exemplo (URL externa) só baixa fora da produção", async () => {
    const exemplo = await novaFoto("https://picsum.photos/seed/x/2400/1600.jpg");
    const { itemId, token } = await novoPedido(exemplo);
    expect((await autorizarDownload(itemId, { token }, null))?.tipo).toBe("exemplo");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await autorizarDownload(itemId, { token }, null)).toBeNull();
  });

  it("excluída depois da venda: quem comprou continua baixando", async () => {
    const fotoId = await novaFoto();
    const { itemId, token } = await novoPedido(fotoId);
    const banco = await obterBanco();
    await banco.update(t.fotos).set({ excluidaEm: new Date() }).where(eq(t.fotos.id, fotoId));
    expect((await autorizarDownload(itemId, { token }, null))?.tipo).toBe("r2");
  });
});

describe("rota /api/download/[itemId]", () => {
  it("pago e com o token certo: 302 para a URL assinada do bucket privado, sem cache", async () => {
    const { itemId, token } = await novoPedido(await novaFoto());
    const resposta = await chamarRota(itemId, token);
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    const destino = new URL(resposta.headers.get("location")!);
    expect(destino.hostname).toBe(HOST_ORIGINAIS);
    expect(destino.searchParams.get("X-Amz-Expires")).toBe("900");
  });

  it("toda recusa dá o mesmo 404, sem Location (não revela se o item existe)", async () => {
    const pago = await novoPedido(await novaFoto());
    const pendente = await novoPedido(await novaFoto(), { status: "pendente" });
    const dono = await clienteNovo();
    const doCliente = await novoPedido(await novaFoto(), { clienteId: dono.id });
    const outro: Usuario = (await buscarUsuario((await clienteNovo()).id))!;

    const casos: [string, string | null][] = [
      [pago.itemId, "x".repeat(40)], // token errado
      [pago.itemId, null], // sem token e sem sessão
      [pendente.itemId, pendente.token], // não pago
      [randomUUID(), pago.token], // item que não existe
      [doCliente.itemId, pago.token], // item de outro pedido com o meu token
      ["nao-e-uuid", pago.token], // id malformado
    ];
    const corpos = new Set<string>();
    for (const [itemId, token] of casos) {
      const resposta = await chamarRota(itemId, token);
      expect(resposta.status, `${itemId} ${token}`).toBe(404);
      expect(resposta.headers.get("location")).toBeNull();
      expect(resposta.headers.get("cache-control")).toBe("no-store");
      corpos.add(await resposta.text());
    }
    // Logado como outro cliente: também 404.
    sessao.usuario = outro;
    const deOutroCliente = await chamarRota(doCliente.itemId, null);
    expect(deOutroCliente.status).toBe(404);
    corpos.add(await deOutroCliente.text());
    expect([...corpos]).toEqual(["Download indisponível."]);

    // O dono logado, sem token, baixa.
    sessao.usuario = (await buscarUsuario(dono.id))!;
    expect((await chamarRota(doCliente.itemId, null)).status).toBe(302);
  });

  it("varrer ids por um IP esbarra no limite de URLs assinadas (429)", async () => {
    const { itemId, token } = await novoPedido(await novaFoto());
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    const { limiteAtingido } = await import("./limites");
    // 599 já contadas para este IP; a 600ª ainda passa, a 601ª não.
    for (let i = 0; i < 599; i++) await limiteAtingido("url_download_ip", ip);
    expect((await chamarRota(itemId, token, ip)).status).toBe(302);
    const bloqueada = await chamarRota(itemId, token, ip);
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get("location")).toBeNull();
  });
});
