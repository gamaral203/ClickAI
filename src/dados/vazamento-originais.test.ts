import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()`, `cookies()` e `headers()` só existem dentro de uma requisição do Next.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ "x-forwarded-for": "192.0.2.77" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// Visitante sem sessão (a manutenção, desligada, nem lê a sessão).
vi.mock("@/servicos/sessao", async (original) => ({
  ...(await original<typeof import("@/servicos/sessao")>()),
  usuarioAtual: async () => null,
}));

import { obterCarrinho } from "@/app/(cliente)/carrinho/acoes";
import { buscarPorNumero } from "@/app/(publico)/eventos/[slug]/acoes";
import { POST as rotaBuscaFacial } from "@/app/api/busca-facial/route";
import {
  buscarFotoPublica,
  buscarItensParaCompra,
  criarEvento,
  fotosEncontradas,
  fotosPorNumero,
  listarFotosDoEvento,
  listarItensDoPainel,
  mudarStatusDoEvento,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { paraFoto } from "@/dados/mapas";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { reiniciarClienteR2, removerPublico } from "@/lib/r2";
import { urlPublica } from "@/lib/url-publica";

// Nenhum caminho público entrega o original (docs/CLAUDE.md, regra 1): o tipo Foto e tudo o que
// a galeria, a página da foto, as buscas (selfie e número), o carrinho e a compra devolvem ao
// navegador (props de Client Components, JSON de rota, retorno de Server Action) só levam a
// prévia e a miniatura com marca d'água, no bucket público. Nem a chave do original (`originais/`),
// nem a do envio (`envios/`), nem o host do bucket privado aparecem em nenhuma string.

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
const BASE_PUBLICA = "https://pub-teste.r2.dev/";

let evento: Awaited<ReturnType<typeof criarEvento>>;
/** Chaves de original gravadas no banco (nenhuma pode aparecer em nada público). */
const chavesOriginais: string[] = [];
const fotosProntas: string[] = [];
let fotoEmEnvio = "";
let video = "";
let ordem = 0;

async function novaFoto(extra: Partial<typeof t.fotos.$inferInsert> = {}) {
  const banco = await obterBanco();
  const id = randomUUID();
  const caminho = `${lia.id}/${evento.id}/${id}`;
  const valores = {
    id,
    eventoId: evento.id,
    enviadaPor: lia.id,
    chaveOriginal: `originais/${caminho}.jpg`,
    urlPrevia: `previas/${caminho}-v4.webp`,
    urlMiniatura: `miniaturas/${caminho}-v4.webp`,
    nomeArquivo: `IMG_${++ordem}.JPG`,
    largura: 3000,
    altura: 2000,
    tamanhoBytes: 5_000_000,
    hashConteudo: `hash-${id}`,
    ordem,
    status: "pronta" as const,
    liberarEm: new Date(Date.now() - 60_000),
    ...extra,
  };
  await banco.insert(t.fotos).values(valores);
  if (valores.chaveOriginal) chavesOriginais.push(valores.chaveOriginal);
  return id;
}

/** Confere que nada do objeto (serializado como vai ao navegador) aponta para o original. */
function semOriginal(valor: unknown, onde: string) {
  const json = JSON.stringify(valor);
  expect(json, onde).not.toMatch(/originais\//);
  expect(json, onde).not.toMatch(/envios\//);
  expect(json, onde).not.toMatch(/r2\.cloudflarestorage\.com/);
  expect(json, onde).not.toMatch(/fotos-originais/);
  expect(json, onde).not.toMatch(/X-Amz-/i);
  expect(json, onde).not.toMatch(/chaveOriginal|chave_original|hashConteudo|tamanhoBytes/);
  for (const chave of chavesOriginais) expect(json, onde).not.toContain(chave);
}

/** Todas as URLs de imagem do item são do bucket público, em previas/ ou miniaturas/. */
function soPublicas(foto: {
  urlPrevia: string;
  urlMiniatura: string;
  urlPreviaCelular?: string | null;
  previaVideo?: string | null;
}) {
  for (const url of [foto.urlPrevia, foto.urlMiniatura, foto.urlPreviaCelular, foto.previaVideo]) {
    if (url == null) continue;
    expect(url.startsWith(BASE_PUBLICA)).toBe(true);
    expect(url.slice(BASE_PUBLICA.length)).toMatch(/^(previas|miniaturas)\//);
  }
}

beforeAll(async () => {
  Object.assign(process.env, R2);
  // Sem o Rekognition: a busca por selfie usa os rostos de exemplo gravados no banco.
  for (const nome of [
    "REKOGNITION_REGIAO",
    "REKOGNITION_ACCESS_KEY_ID",
    "REKOGNITION_SECRET_ACCESS_KEY",
  ]) {
    delete process.env[nome];
  }
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
    titulo: "Evento sem vazamento",
    slug: `sem-vazamento-${randomUUID().slice(0, 8)}`,
  });
  expect(await mudarStatusDoEvento(evento.id, lia.id, "rascunho", "publicado")).toBe(true);

  for (let i = 0; i < 3; i++) fotosProntas.push(await novaFoto());
  // Excluída: não aparece no público, mas a chave dela também não pode vazar.
  await novaFoto({ excluidaEm: new Date() });
  // Ainda chegando: a chave é a do envio (envios/), no bucket privado.
  fotoEmEnvio = await novaFoto({
    status: "processando",
    chaveOriginal: `envios/${lia.id}/${evento.id}/${randomUUID()}.jpg`,
  });
  // Vídeo, com a prévia em MP4 no bucket público.
  video = await novaFoto({
    tipo: "video",
    chaveOriginal: `originais/${lia.id}/${evento.id}/${randomUUID()}.mp4`,
    previaVideo: `previas/${lia.id}/${evento.id}/${randomUUID()}-video.mp4`,
    duracaoS: 12,
  });

  const banco = await obterBanco();
  // Número de peito e uma "pessoa" de exemplo nas fotos prontas e no vídeo.
  for (const fotoId of [...fotosProntas, video, fotoEmEnvio]) {
    await banco.insert(t.numeros).values({ fotoId, numero: "4242" });
    await banco.insert(t.rostos).values({ fotoId, rostoIdProvedor: `pessoa-${evento.id}` });
  }
});

afterAll(() => {
  process.env = antes;
  reiniciarClienteR2();
});

describe("o tipo Foto (src/dados/mapas.ts, paraFoto)", () => {
  it("tira a chave do original, o tamanho e a impressão; as URLs são do bucket público", async () => {
    const banco = await obterBanco();
    const linhas = await banco.select().from(t.fotos).where(eq(t.fotos.eventoId, evento.id));
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      const foto = paraFoto(linha);
      expect(foto).not.toHaveProperty("chaveOriginal");
      expect(foto).not.toHaveProperty("tamanhoBytes");
      expect(foto).not.toHaveProperty("hashConteudo");
      semOriginal(foto, `paraFoto ${linha.id}`);
      soPublicas(foto);
    }
  });
});

describe("caminhos públicos só entregam prévias", () => {
  it("galeria do evento (listarFotosDoEvento): prévias e miniaturas, sem a foto em envio", async () => {
    const pagina = await listarFotosDoEvento(evento.id, { pagina: 1, limite: 48 });
    expect(pagina.fotos.map((f) => f.id).sort()).toEqual([...fotosProntas, video].sort());
    semOriginal(pagina, "galeria");
    pagina.fotos.forEach(soPublicas);
  });

  it("página da foto (buscarFotoPublica), inclusive o vídeo", async () => {
    for (const id of [...fotosProntas, video]) {
      const dados = await buscarFotoPublica(id);
      expect(dados?.foto.id).toBe(id);
      semOriginal(dados, `página da foto ${id}`);
      soPublicas(dados!.foto);
    }
    // A foto ainda em envio não abre pelo link.
    expect(await buscarFotoPublica(fotoEmEnvio)).toBeNull();
  });

  it("busca por número (dados e Server Action pública)", async () => {
    const porNumero = await fotosPorNumero(evento.id, "4242");
    expect(porNumero.map((f) => f.id).sort()).toEqual([...fotosProntas, video].sort());
    semOriginal(porNumero, "fotosPorNumero");
    porNumero.forEach(soPublicas);

    const acao = await buscarPorNumero(evento.slug, "4242");
    expect(acao.fotos).toHaveLength(fotosProntas.length + 1);
    semOriginal(acao, "buscarPorNumero");
    acao.fotos.forEach(soPublicas);
  });

  it("busca por selfie (rota /api/busca-facial): JSON só com prévias", async () => {
    const selfie = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 120, g: 90, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const formulario = new FormData();
    formulario.set("slug", evento.slug);
    formulario.set("consentimento", "sim");
    formulario.set("selfie", new Blob([new Uint8Array(selfie)], { type: "image/jpeg" }), "s.jpg");
    const resposta = await rotaBuscaFacial(
      new NextRequest("http://localhost/api/busca-facial", { method: "POST", body: formulario }),
    );
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { fotos: Parameters<typeof soPublicas>[0][] };
    expect(corpo.fotos.length).toBe(fotosProntas.length + 1);
    semOriginal(corpo, "busca-facial");
    corpo.fotos.forEach(soPublicas);

    const encontradas = await fotosEncontradas(evento.id, [...fotosProntas, fotoEmEnvio]);
    expect(encontradas.map((f) => f.id).sort()).toEqual([...fotosProntas].sort());
    semOriginal(encontradas, "fotosEncontradas");
  });

  it("carrinho (Server Action obterCarrinho) e itens para compra", async () => {
    const resumo = await obterCarrinho([...fotosProntas, video, fotoEmEnvio]);
    expect(resumo?.quantidade).toBe(fotosProntas.length + 1);
    expect(resumo?.indisponiveis).toEqual([fotoEmEnvio]);
    semOriginal(resumo, "carrinho");
    for (const grupo of resumo!.grupos) {
      for (const item of grupo.itens) {
        expect(item.urlMiniatura.startsWith(`${BASE_PUBLICA}miniaturas/`)).toBe(true);
      }
    }
    const itens = await buscarItensParaCompra([...fotosProntas, video]);
    semOriginal(itens, "buscarItensParaCompra");
  });

  it("nem o painel do dono recebe a chave do original na lista de itens", async () => {
    const itens = await listarItensDoPainel(evento.id, lia.id);
    expect(itens?.length).toBeGreaterThan(0);
    semOriginal(itens, "painel");
  });
});

describe("saber a chave não basta (item 5)", () => {
  it("a URL pública monta só o host do bucket público; o original fica em outro bucket", () => {
    const chave = chavesOriginais[0];
    // Mesmo que alguém monte o endereço com a chave do original, ele cai no bucket PÚBLICO
    // (R2_URL_PUBLICA), onde nada em originais/ é gravado: só previas/, miniaturas/, eventos/
    // e perfis/ (src/servicos/envios.ts, chavesDaFoto; capa e loja).
    const url = new URL(urlPublica(chave));
    expect(url.origin).toBe("https://pub-teste.r2.dev");
    expect(url.hostname).not.toContain("cloudflarestorage");
  });

  it("removerPublico recusa qualquer chave fora de previas/ e miniaturas/", async () => {
    for (const chave of [
      chavesOriginais[0],
      `envios/${lia.id}/${evento.id}/${randomUUID()}.jpg`,
      "../originais/x.jpg",
      "eventos/x/capa.webp",
    ]) {
      await expect(removerPublico(chave)).rejects.toThrow("Chave fora das prévias");
    }
  });
});
