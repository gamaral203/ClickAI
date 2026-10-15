import { createHash, randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET as rotaComMoldura } from "@/app/api/compras/moldura/[itemId]/route";
import {
  criarContaDeFotografoSeNaoExistir,
  criarEvento,
  criarUsuario,
  formatosDeMoldura,
  moldurasDoEvento,
} from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { LIMITE_MOLDURA_BYTES, MEDIDAS_MOLDURA, type FormatoMoldura } from "@/lib/moldura";
import { gerarHashSenha } from "@/lib/senha";

import { limiteAtingido } from "./limites";
import {
  comporComMoldura,
  conferirMoldura,
  confirmarEnvioDeMoldura,
  fotoComMoldura,
  modeloDaMoldura,
  removerMolduraDoEvento,
  salvarMolduraSimulada,
} from "./molduras";

// Moldura do evento (docs/arquitetura.md, "Moldura do evento"): a conferência do PNG, a
// composição e, principalmente, que a foto com moldura segue a regra do original (só item de
// pedido PAGO do próprio cliente, ou de quem tem o link do pedido).

/** Original de exemplo (fora da produção, o servidor lê a URL); aqui o fetch é simulado. */
const ORIGINAL = "https://exemplo.test/original-moldura.jpg";
const VERMELHO = { r: 200, g: 30, b: 30 };
const AZUL = { r: 49, g: 92, b: 255 };

/**
 * Moldura de teste: faixa azul opaca em cima e embaixo (`faixa` px) e o meio transparente.
 * `alfa: false` grava sem canal alfa.
 */
async function molduraDeTeste(
  formato: FormatoMoldura,
  { faixa = 200, alfa = true }: { faixa?: number; alfa?: boolean } = {},
) {
  const { largura, altura } = MEDIDAS_MOLDURA[formato];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
    <rect width="${largura}" height="${faixa}" fill="rgb(49,92,255)"/>
    <rect y="${altura - faixa}" width="${largura}" height="${faixa}" fill="rgb(49,92,255)"/>
  </svg>`;
  const imagem = sharp(Buffer.from(svg));
  return alfa ? imagem.png().toBuffer() : imagem.flatten({ background: "#fff" }).png().toBuffer();
}

async function usuarioNovo(papel: "cliente" | "fotografo") {
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

async function novoEvento(fotografoId: string) {
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
    titulo: "Corrida com moldura",
    slug: `moldura-${randomUUID().slice(0, 8)}`,
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
    chaveOriginal: ORIGINAL,
    urlPrevia: `previas/${id}.webp`,
    urlMiniatura: `miniaturas/${id}.webp`,
    nomeArquivo: `Largada ${String(++ordem).padStart(3, "0")}.JPG`,
    largura: 1200,
    altura: 800,
    tamanhoBytes: 500_000,
    ordem,
    status: "pronta",
    ...extra,
  });
  return id;
}

type StatusPedido = (typeof t.statusPedido.enumValues)[number];

/** Pedido com um item da foto, gravado direto no banco; devolve o token do link. */
async function novoPedido(
  fotoId: string,
  fotografoId: string,
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
      fotografoId,
      precoCentavos: 1500,
      descontoCentavos: 0,
      valorFotografoCentavos: 1500,
      valorDonoEventoCentavos: 0,
    })
    .returning();
  return { itemId: item.id, token };
}

/** IP novo a cada chamada: o limite por IP não interfere nos outros testes. */
const ipNovo = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}-${randomUUID()}`;

let moldura: Buffer;

beforeAll(async () => {
  moldura = await molduraDeTeste("story");
});

beforeEach(async () => {
  // Um JPEG 1200×800 vermelho faz o papel do original.
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: VERMELHO },
  })
    .jpeg()
    .toBuffer();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === ORIGINAL
        ? new Response(new Uint8Array(original), { headers: { "Content-Type": "image/jpeg" } })
        : new Response(null, { status: 404 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessao.usuario = null;
});

/** Cor do pixel (x, y) de uma imagem. */
async function pixel(imagem: Buffer, x: number, y: number) {
  const { data, info } = await sharp(imagem).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function perto(cor: { r: number; g: number; b: number }, alvo: typeof cor) {
  return (
    Math.abs(cor.r - alvo.r) < 12 && Math.abs(cor.g - alvo.g) < 12 && Math.abs(cor.b - alvo.b) < 12
  );
}

describe("conferência da moldura enviada", () => {
  it("aceita PNG com transparência nas medidas do formato e regrava em PNG", async () => {
    const resultado = await conferirMoldura(moldura, "story");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const meta = await sharp(resultado.png).metadata();
    expect(meta).toMatchObject({ format: "png", width: 1080, height: 1920, hasAlpha: true });
  });

  it("recusa JPEG, mesmo com a extensão trocada", async () => {
    const jpeg = await sharp({
      create: { width: 1080, height: 1920, channels: 3, background: AZUL },
    })
      .jpeg()
      .toBuffer();
    const resultado = await conferirMoldura(jpeg, "story");
    expect(resultado).toEqual({ ok: false, erro: "A moldura precisa ser um arquivo PNG." });
  });

  it("recusa PNG sem canal alfa", async () => {
    const resultado = await conferirMoldura(
      await molduraDeTeste("story", { alfa: false }),
      "story",
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toMatch(/transparência/);
  });

  it("recusa medidas diferentes das do formato (story no lugar do feed)", async () => {
    const resultado = await conferirMoldura(moldura, "feed");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toMatch(/1080×1350/);
  });

  it("recusa arquivo acima de 5 MB", async () => {
    const grande = Buffer.concat([moldura, Buffer.alloc(LIMITE_MOLDURA_BYTES)]);
    const resultado = await conferirMoldura(grande, "story");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toMatch(/5 MB/);
  });

  it("recusa moldura quase toda opaca (sem a janela da foto)", async () => {
    const opaca = await molduraDeTeste("feed", { faixa: 670 });
    const resultado = await conferirMoldura(opaca, "feed");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toMatch(/área transparente/);
  });

  it("o modelo baixável de cada formato passa na própria conferência", async () => {
    for (const formato of ["story", "feed"] as const) {
      const modelo = await modeloDaMoldura(formato);
      expect((await conferirMoldura(modelo, formato)).ok).toBe(true);
    }
  });
});

describe("composição da foto com a moldura", () => {
  it("sai em JPEG na medida do formato, com a foto na área transparente e a arte por cima", async () => {
    const foto = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: VERMELHO },
    })
      .jpeg()
      .toBuffer();
    for (const formato of ["story", "feed"] as const) {
      const imagem = await comporComMoldura(foto, await molduraDeTeste(formato), formato);
      const meta = await sharp(imagem).metadata();
      const { largura, altura } = MEDIDAS_MOLDURA[formato];
      expect(meta).toMatchObject({ format: "jpeg", width: largura, height: altura });
      // Meio (transparente na moldura): a foto. Faixa de cima (opaca): a arte.
      expect(perto(await pixel(imagem, largura / 2, altura / 2), VERMELHO)).toBe(true);
      expect(perto(await pixel(imagem, largura / 2, 50), AZUL)).toBe(true);
    }
  });

  it("gira a foto pelo EXIF antes de encaixar (sem metadados na saída)", async () => {
    // Retrato gravado deitado: metade esquerda vermelha, direita azul, com orientação 6 (90°).
    const deitada = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: AZUL },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 600, height: 800, channels: 3, background: VERMELHO },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const imagem = await comporComMoldura(deitada, moldura, "story");
    // Girada 90° no sentido horário: a metade vermelha (esquerda) vai para cima.
    expect(perto(await pixel(imagem, 540, 600), VERMELHO)).toBe(true);
    expect(perto(await pixel(imagem, 540, 1300), AZUL)).toBe(true);
    expect((await sharp(imagem).metadata()).exif).toBeUndefined();
  });
});

describe("moldura no painel (envio simulado, sem R2)", () => {
  it("o dono grava, troca e remove; outro fotógrafo (ou colaborador) não", async () => {
    const dono = await fotografoNovo("Dono Moldura");
    const outro = await fotografoNovo("Outro Moldura");
    const evento = await novoEvento(dono.conta.id);

    const alheio = await salvarMolduraSimulada(
      outro.conta.id,
      { eventoId: evento.id, formato: "story" },
      moldura,
    );
    expect(alheio).toEqual({ ok: false, erro: "Evento não encontrado." });
    expect(await moldurasDoEvento(evento.id)).toEqual({});

    const gravada = await salvarMolduraSimulada(
      dono.conta.id,
      { eventoId: evento.id, formato: "story" },
      moldura,
    );
    expect(gravada).toEqual({ ok: true });
    expect((await moldurasDoEvento(evento.id)).story).toMatch(/^data:image\/png;base64,/);
    expect((await formatosDeMoldura([evento.id])).get(evento.id)).toEqual(["story"]);

    const invalida = await salvarMolduraSimulada(
      dono.conta.id,
      { eventoId: evento.id, formato: "feed" },
      moldura,
    );
    expect(invalida.ok).toBe(false);

    expect(
      await removerMolduraDoEvento(outro.conta.id, { eventoId: evento.id, formato: "story" }),
    ).toEqual({ ok: false, erro: "Evento não encontrado." });
    expect(
      await removerMolduraDoEvento(dono.conta.id, { eventoId: evento.id, formato: "story" }),
    ).toEqual({ ok: true });
    expect(await formatosDeMoldura([evento.id])).toEqual(new Map());
  });
});

describe("confirmação do envio pelo R2", () => {
  it("só lê a chave de um envio de moldura do próprio evento", async () => {
    const dono = await fotografoNovo("Dono Chave");
    const evento = await novoEvento(dono.conta.id);
    for (const chave of [
      `envios/molduras/${randomUUID()}/${randomUUID()}.png`,
      `originais/${dono.conta.id}/${evento.id}/${randomUUID()}.jpg`,
      `envios/molduras/${evento.id}/../../originais/x.png`,
      null,
    ]) {
      expect(
        await confirmarEnvioDeMoldura(dono.conta.id, {
          eventoId: evento.id,
          formato: "story",
          chave,
        }),
      ).toEqual({ ok: false, erro: "Envio não encontrado. Tente de novo." });
    }
  });
});

describe("download com moldura (mesma regra do original)", () => {
  async function cenario() {
    const dono = await fotografoNovo("Lia Moldura");
    const evento = await novoEvento(dono.conta.id);
    await salvarMolduraSimulada(dono.conta.id, { eventoId: evento.id, formato: "story" }, moldura);
    const fotoId = await novaFoto(evento.id, dono.conta.id);
    return { dono, evento, fotoId };
  }

  it("o cliente dono do pedido pago baixa a foto com a moldura", async () => {
    const { dono, fotoId } = await cenario();
    const cliente = await usuarioNovo("cliente");
    const { itemId } = await novoPedido(fotoId, dono.conta.id, { clienteId: cliente.id });

    const resultado = await fotoComMoldura(itemId, "story", { clienteId: cliente.id }, ipNovo());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.nomeArquivo).toMatch(/-story\.jpg$/);
    const meta = await sharp(resultado.imagem).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 1080, height: 1920 });
  });

  it("quem tem o link do pedido (sem conta) também baixa; pela rota, como anexo JPEG", async () => {
    const { dono, fotoId } = await cenario();
    const { itemId, token } = await novoPedido(fotoId, dono.conta.id);
    const url = new URL(`http://localhost/api/compras/moldura/${itemId}`);
    url.searchParams.set("formato", "story");
    url.searchParams.set("token", token);
    const resposta = await rotaComMoldura(
      new NextRequest(url, { headers: { "x-forwarded-for": ipNovo() } }),
      { params: Promise.resolve({ itemId }) } as RouteContext<"/api/compras/moldura/[itemId]">,
    );
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("image/jpeg");
    expect(resposta.headers.get("content-disposition")).toMatch(/^attachment;.*-story\.jpg/);
    expect(resposta.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("pedido pendente, estornado, com reembolso pedido ou de outro cliente não baixa", async () => {
    const { dono, fotoId } = await cenario();
    const cliente = await usuarioNovo("cliente");
    const intruso = await usuarioNovo("cliente");

    for (const extra of [
      { status: "pendente" as const },
      { status: "estornado" as const },
      { status: "contestado" as const },
      { reembolsoSolicitadoEm: new Date() },
    ]) {
      const { itemId } = await novoPedido(fotoId, dono.conta.id, {
        clienteId: cliente.id,
        ...extra,
      });
      expect(await fotoComMoldura(itemId, "story", { clienteId: cliente.id }, ipNovo())).toEqual({
        ok: false,
        motivo: "indisponivel",
      });
    }

    const pago = await novoPedido(fotoId, dono.conta.id, { clienteId: cliente.id });
    expect(await fotoComMoldura(pago.itemId, "story", { clienteId: intruso.id }, ipNovo())).toEqual(
      { ok: false, motivo: "indisponivel" },
    );
    // Token errado e nenhuma credencial também não.
    expect(await fotoComMoldura(pago.itemId, "story", { token: "x".repeat(64) }, ipNovo())).toEqual(
      { ok: false, motivo: "indisponivel" },
    );
    expect(await fotoComMoldura(pago.itemId, "story", {}, ipNovo())).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });

  it("evento sem a moldura do formato (ou sem moldura) e vídeo não baixam com moldura", async () => {
    const { dono, evento, fotoId } = await cenario();
    const cliente = await usuarioNovo("cliente");
    const { itemId } = await novoPedido(fotoId, dono.conta.id, { clienteId: cliente.id });
    // Só tem a de story.
    expect(await fotoComMoldura(itemId, "feed", { clienteId: cliente.id }, ipNovo())).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
    // Formato que não existe.
    expect(await fotoComMoldura(itemId, "reels", { clienteId: cliente.id }, ipNovo())).toEqual({
      ok: false,
      motivo: "indisponivel",
    });

    const videoId = await novaFoto(evento.id, dono.conta.id, { tipo: "video" });
    const video = await novoPedido(videoId, dono.conta.id, { clienteId: cliente.id });
    expect(
      await fotoComMoldura(video.itemId, "story", { clienteId: cliente.id }, ipNovo()),
    ).toEqual({ ok: false, motivo: "indisponivel" });

    const semMoldura = await novoEvento(dono.conta.id);
    const outraFoto = await novaFoto(semMoldura.id, dono.conta.id);
    const outro = await novoPedido(outraFoto, dono.conta.id, { clienteId: cliente.id });
    expect(
      await fotoComMoldura(outro.itemId, "story", { clienteId: cliente.id }, ipNovo()),
    ).toEqual({ ok: false, motivo: "indisponivel" });
  });

  it("respeita o limite por usuário (e a rota responde 429)", async () => {
    const { dono, fotoId } = await cenario();
    const cliente = await usuarioNovo("cliente");
    const { itemId } = await novoPedido(fotoId, dono.conta.id, { clienteId: cliente.id });
    // Gasta a cota do usuário (60 em 10 minutos) sem compor 60 imagens.
    for (let i = 0; i < 60; i++) await limiteAtingido("moldura_usuario", cliente.id);
    expect(await fotoComMoldura(itemId, "story", { clienteId: cliente.id }, ipNovo())).toEqual({
      ok: false,
      motivo: "limite",
    });

    sessao.usuario = cliente;
    const url = new URL(`http://localhost/api/compras/moldura/${itemId}?formato=story`);
    const resposta = await rotaComMoldura(
      new NextRequest(url, { headers: { "x-forwarded-for": ipNovo() } }),
      { params: Promise.resolve({ itemId }) } as RouteContext<"/api/compras/moldura/[itemId]">,
    );
    expect(resposta.status).toBe(429);
  });

  it("respeita o limite por IP, antes de conferir o pedido", async () => {
    const ip = ipNovo();
    for (let i = 0; i < 120; i++) await limiteAtingido("moldura_ip", ip);
    expect(await fotoComMoldura(randomUUID(), "story", {}, ip)).toEqual({
      ok: false,
      motivo: "limite",
    });
  });
});
