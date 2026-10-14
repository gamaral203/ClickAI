import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rotas do plugin do Lightroom (/api/plugin/*): a chave de acesso gerada no painel, o envio pelo
// mesmo caminho do painel (URL assinada, PUT ao R2, confirmação) e a exclusão.

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
  // O cadastro dos rostos fica para depois da resposta; aqui não roda.
  after: () => {},
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.77" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const sessao = vi.hoisted(() => ({ fotografoId: "" }));
vi.mock("@/servicos/sessao", () => ({
  exigirFotografo: async () => ({ conta: { id: sessao.fotografoId } }),
}));

import { apagarChaveAcao, gerarChaveAcao } from "@/app/(fotografo)/painel/lightroom/acoes";
import { GET as contaRota } from "@/app/api/plugin/conta/route";
import { POST as confirmarRota } from "@/app/api/plugin/envios/confirmar/route";
import { POST as enviosRota } from "@/app/api/plugin/envios/route";
import { GET as eventosRota } from "@/app/api/plugin/eventos/route";
import { DELETE as fotoRota } from "@/app/api/plugin/fotos/[id]/route";
import { GET as downloadRota } from "@/app/api/plugin/download/route";
import { listarChavesApi } from "@/dados/chaves-api";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { impressaoDoArquivo } from "@/lib/impressao-arquivo";
import { MULTIPART_A_PARTIR_DE } from "@/lib/limites-envio";
import { reiniciarClienteR2 } from "@/lib/r2";
import { chavesDaFoto } from "@/servicos/envios";

const [lia, pedro] = fotografos;
const evento = eventos.find((e) => e.slug === "meia-maratona-rio-2026")!;

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};

const objetos = new Map<string, Buffer>();
const nome = (bucket?: string, chave?: string) => `${bucket}/${chave}`;
const naoEncontrado = () =>
  Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });

beforeAll(() => {
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof PutObjectCommand) {
      const { Bucket, Key, Body } = comando.input;
      objetos.set(nome(Bucket, Key), Buffer.from(Body as Buffer));
      return {};
    }
    if (comando instanceof HeadObjectCommand) {
      const corpo = objetos.get(nome(comando.input.Bucket, comando.input.Key));
      if (!corpo) throw naoEncontrado();
      return { ContentLength: corpo.length };
    }
    if (comando instanceof GetObjectCommand) {
      const corpo = objetos.get(nome(comando.input.Bucket, comando.input.Key));
      if (!corpo) throw naoEncontrado();
      const faixa = /^bytes=(\d+)-(\d+)$/.exec(comando.input.Range ?? "");
      const parte = faixa ? corpo.subarray(Number(faixa[1]), Number(faixa[2]) + 1) : corpo;
      return {
        ContentLength: parte.length,
        Body: { transformToByteArray: async () => new Uint8Array(parte) },
      };
    }
    if (comando instanceof CopyObjectCommand) {
      const origem = objetos.get(decodeURIComponent(comando.input.CopySource!));
      if (!origem) throw naoEncontrado();
      objetos.set(nome(comando.input.Bucket, comando.input.Key), origem);
      return {};
    }
    if (comando instanceof DeleteObjectCommand) {
      objetos.delete(nome(comando.input.Bucket, comando.input.Key));
      return {};
    }
    throw new Error("Comando inesperado no S3 falso");
  }) as never);
});

beforeEach(() => {
  for (const [chave, valor] of Object.entries(R2)) vi.stubEnv(chave, valor);
  reiniciarClienteR2();
  sessao.fotografoId = lia.id;
});

afterEach(() => vi.unstubAllEnvs());

function pedido(chave: string | null, metodo = "GET", corpo?: object) {
  return new Request("http://localhost/api/plugin", {
    method: metodo,
    headers: {
      ...(chave ? { Authorization: `Bearer ${chave}` } : {}),
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

async function novaChave(nomeDaChave = "Notebook do estúdio") {
  const r = await gerarChaveAcao(nomeDaChave);
  if ("erro" in r) throw new Error(r.erro);
  return r.chave;
}

/** Um JPEG diferente a cada chamada (a cor muda), como uma foto exportada pelo Lightroom. */
let cor = 0;
async function fotoExportada() {
  cor += 7;
  const corpo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: cor % 255, g: 90, b: 160 } },
  })
    .jpeg()
    .toBuffer();
  const hash = await impressaoDoArquivo(corpo.length, (a, b) => corpo.subarray(a, b));
  return { corpo, hash };
}

describe("chave de acesso do plugin", () => {
  it("gerada no painel, entra no plugin; só o começo fica na lista", async () => {
    const chave = await novaChave();
    expect(chave).toMatch(/^clk_[A-Za-z0-9_-]{43}$/);
    const r = await contaRota(pedido(chave));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ nome: lia.nomePublico, versaoDaApi: 1 });

    const lista = await listarChavesApi(lia.id);
    const minha = lista.find((c) => chave.startsWith(c.prefixo));
    expect(minha).toMatchObject({ nome: "Notebook do estúdio" });
    expect(JSON.stringify(lista)).not.toContain(chave);
    // O banco guarda só o hash.
    const banco = await obterBanco();
    const linhas = await banco.select().from(t.chavesApi);
    expect(JSON.stringify(linhas)).not.toContain(chave);
  });

  it("sem chave, chave inventada ou apagada: 401", async () => {
    expect((await contaRota(pedido(null))).status).toBe(401);
    expect((await contaRota(pedido(`clk_${"a".repeat(43)}`))).status).toBe(401);

    const chave = await novaChave("Para apagar");
    const lista = await listarChavesApi(lia.id);
    const id = lista.find((c) => chave.startsWith(c.prefixo))!.id;
    // Outro fotógrafo não apaga a chave da Lia.
    sessao.fotografoId = pedro.id;
    expect(await apagarChaveAcao(id)).toEqual({ erro: "Chave não encontrada." });
    sessao.fotografoId = lia.id;
    expect(await apagarChaveAcao(id)).toEqual({});
    expect((await contaRota(pedido(chave))).status).toBe(401);
  });

  it("a chave para de valer com a conta excluída", async () => {
    sessao.fotografoId = pedro.id;
    const chave = await novaChave();
    expect((await contaRota(pedido(chave))).status).toBe(200);
    const banco = await obterBanco();
    await banco
      .update(t.usuarios)
      .set({ excluidoEm: new Date() })
      .where(eq(t.usuarios.id, pedro.usuarioId));
    try {
      expect((await contaRota(pedido(chave))).status).toBe(401);
    } finally {
      await banco
        .update(t.usuarios)
        .set({ excluidoEm: null })
        .where(eq(t.usuarios.id, pedro.usuarioId));
    }
  });
});

describe("envio pelo plugin", () => {
  it("lista os eventos do fotógrafo", async () => {
    const chave = await novaChave();
    const r = await eventosRota(pedido(chave));
    const { eventos: lista } = (await r.json()) as {
      eventos: { id: string; titulo: string; url: string; colaboracao: boolean }[];
    };
    const meu = lista.find((e) => e.id === evento.id);
    expect(meu).toMatchObject({ titulo: evento.titulo, colaboracao: false });
    expect(meu?.url).toContain(`/eventos/${evento.slug}`);
  });

  it("URL assinada, PUT, confirmação: a foto fica pronta; a mesma foto de novo é repetida", async () => {
    const chave = await novaChave();
    const { corpo, hash } = await fotoExportada();
    const arquivo = { nome: "IMG_0001.jpg", tamanhoBytes: corpo.length, hash, formato: "jpeg" };
    const inicio = await enviosRota(
      pedido(chave, "POST", { eventoId: evento.id, arquivos: [arquivo] }),
    );
    expect(inicio.status).toBe(200);
    const { itens } = (await inicio.json()) as {
      itens: { fotoId: string; url: string; tipo: string }[];
    };
    expect(itens[0].url).toMatch(/^https:\/\//);
    expect(itens[0].tipo).toBe("image/jpeg");

    // O "PUT" do plugin ao R2.
    const chaves = chavesDaFoto(lia.id, evento.id, itens[0].fotoId, "jpeg");
    objetos.set(nome(R2.R2_BUCKET_ORIGINAIS, chaves.temporaria), corpo);

    const confirmou = await confirmarRota(pedido(chave, "POST", { fotoId: itens[0].fotoId }));
    expect(confirmou.status).toBe(200);
    expect(await confirmou.json()).toEqual({ ok: true, emAndamento: false });
    const banco = await obterBanco();
    const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, itens[0].fotoId));
    expect(linha.status).toBe("pronta");

    // Confirmar de novo não refaz nada.
    const outra = await confirmarRota(pedido(chave, "POST", { fotoId: itens[0].fotoId }));
    expect(await outra.json()).toEqual({ ok: true, emAndamento: true });

    const repetida = await enviosRota(
      pedido(chave, "POST", { eventoId: evento.id, arquivos: [arquivo] }),
    );
    expect(await repetida.json()).toEqual({ itens: [{ repetida: true }] });
  });

  it("recusa arquivo grande demais para o plugin e evento de outro fotógrafo", async () => {
    const chave = await novaChave();
    const { hash } = await fotoExportada();
    const grande = await enviosRota(
      pedido(chave, "POST", {
        eventoId: evento.id,
        arquivos: [{ nome: "G.jpg", tamanhoBytes: MULTIPART_A_PARTIR_DE, hash, formato: "jpeg" }],
      }),
    );
    expect(grande.status).toBe(400);

    sessao.fotografoId = pedro.id;
    const doPedro = await novaChave();
    const alheio = await enviosRota(
      pedido(doPedro, "POST", {
        eventoId: evento.id,
        arquivos: [{ nome: "A.jpg", tamanhoBytes: 1000, hash, formato: "jpeg" }],
      }),
    );
    expect(alheio.status).toBe(422);
  });

  it("apaga a foto do evento; outro fotógrafo não apaga", async () => {
    const chave = await novaChave();
    const banco = await obterBanco();
    const [foto] = await banco
      .select({ id: t.fotos.id })
      .from(t.fotos)
      .where(eq(t.fotos.eventoId, evento.id))
      .limit(1);
    const params = { params: Promise.resolve({ id: foto.id }) };

    sessao.fotografoId = pedro.id;
    const doPedro = await novaChave();
    expect((await fotoRota(pedido(doPedro, "DELETE"), params)).status).toBe(404);

    expect((await fotoRota(pedido(chave, "DELETE"), params)).status).toBe(200);
    const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, foto.id));
    expect(linha.excluidaEm).not.toBeNull();
    // De novo: já não está no evento.
    expect((await fotoRota(pedido(chave, "DELETE"), params)).status).toBe(404);
  });
});

describe("download do plugin", () => {
  it("entrega o .zip com a pasta do plugin e o passo a passo", async () => {
    const r = await downloadRota(new Request("http://localhost/api/plugin/download"));
    expect(r.headers.get("Content-Type")).toBe("application/zip");
    expect(r.headers.get("Content-Disposition")).toContain("ClicouAi-Lightroom.zip");
    const zip = Buffer.from(await r.arrayBuffer());
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    for (const nome of [
      "ClicouAi.lrplugin/Info.lua",
      "ClicouAi.lrplugin/ServiceProvider.lua",
      "ClicouAi.lrplugin/ClicouAiApi.lua",
      "ClicouAi.lrplugin/Json.lua",
      "LEIA-ME.txt",
    ]) {
      expect(zip.includes(nome)).toBe(true);
    }
  });
});
