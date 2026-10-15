import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarEventoPublicado,
  buscarFotoPublica,
  capasDosEventos,
  fotosEncontradas,
  fotosPorNumero,
  listarEventosPublicados,
  listarFotosDoEvento,
} from "@/dados";
// Os ids vêm dos dados de exemplo: são os mesmos que a semente grava no banco (PGlite).
import { eventos, fotos, numeros } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { ehPreviaProtegida, IMAGEM_PROCESSANDO } from "@/lib/url-publica";

// Garantia contra regressão (docs/CLAUDE.md, "Regras que não podem ser quebradas"): o que as
// páginas públicas (início, /eventos, evento, foto) e as buscas (selfie e número de peito)
// recebem da camada de dados só tem prévia protegida, mesmo se o banco tiver, por erro de uma
// integração, a chave do original, um link do Google Drive ou um googleusercontent no lugar da
// prévia. Sem prévia protegida, vai o aviso "Processando", nunca o arquivo.

const BASE = "https://pub-teste.r2.dev";
const evento = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
const prontas = fotos.filter(
  (f) => f.eventoId === evento.id && f.status === "pronta" && f.excluidaEm === null,
);
const [comDrive, comOriginal, comGoogleusercontent] = prontas;

/** Campos que viram `src` de imagem nas telas públicas. */
const CAMPOS_DE_IMAGEM = new Set(["urlPrevia", "urlMiniatura", "urlPreviaCelular", "previaVideo"]);
const PROIBIDO = /originais\/|envios\/|google|drive\.|X-Amz-|r2\.cloudflarestorage/i;

/** Confere cada campo de imagem e que nada proibido aparece em lugar nenhum da resposta. */
function conferir(resposta: unknown) {
  const texto = JSON.stringify(resposta);
  expect(texto, "resposta pública com URL proibida").not.toMatch(PROIBIDO);
  const visitar = (valor: unknown, chave: string) => {
    if (Array.isArray(valor)) return valor.forEach((v) => visitar(v, chave));
    if (valor && typeof valor === "object") {
      // A capa enviada pelo dono é imagem de divulgação, fora da regra das prévias protegidas
      // (sai como foi enviada, por urlPublica); o texto proibido já foi conferido acima.
      if ((valor as { enviada?: unknown }).enviada === true) return;
      for (const [k, v] of Object.entries(valor)) visitar(v, k);
      return;
    }
    if (!CAMPOS_DE_IMAGEM.has(chave) || valor === null) return;
    expect(typeof valor).toBe("string");
    const url = valor as string;
    expect(url === IMAGEM_PROCESSANDO || ehPreviaProtegida(url), `${chave}: ${url}`).toBe(true);
  };
  visitar(resposta, "");
}

let originais: { id: string; urlPrevia: string; urlMiniatura: string }[] = [];

beforeAll(async () => {
  vi.stubEnv("R2_URL_PUBLICA", BASE);
  const banco = await obterBanco();
  const ids = [comDrive.id, comOriginal.id, comGoogleusercontent.id];
  originais = await banco
    .select({ id: t.fotos.id, urlPrevia: t.fotos.urlPrevia, urlMiniatura: t.fotos.urlMiniatura })
    .from(t.fotos)
    .where(inArray(t.fotos.id, ids));
  // Banco "estragado" como uma integração de armazenamento errada deixaria.
  await banco
    .update(t.fotos)
    .set({
      urlPrevia: "https://drive.google.com/uc?export=view&id=1AbCdEf",
      urlMiniatura: "https://drive.google.com/thumbnail?id=1AbCdEf&sz=w400",
    })
    .where(eq(t.fotos.id, comDrive.id));
  await banco
    .update(t.fotos)
    .set({
      urlPrevia: `originais/x/${evento.id}/${comOriginal.id}.jpg`,
      urlMiniatura: `${BASE}/originais/x/${evento.id}/${comOriginal.id}.jpg`,
    })
    .where(eq(t.fotos.id, comOriginal.id));
  await banco
    .update(t.fotos)
    .set({
      urlPrevia: "https://lh3.googleusercontent.com/d/1AbCdEf=w1600",
      urlMiniatura: "https://lh3.googleusercontent.com/d/1AbCdEf=w400",
    })
    .where(eq(t.fotos.id, comGoogleusercontent.id));
});

afterAll(async () => {
  const banco = await obterBanco();
  for (const o of originais) {
    await banco
      .update(t.fotos)
      .set({ urlPrevia: o.urlPrevia, urlMiniatura: o.urlMiniatura })
      .where(eq(t.fotos.id, o.id));
  }
  vi.unstubAllEnvs();
});

describe("páginas públicas só recebem prévia protegida", () => {
  it("início e /eventos (cartões e capas)", async () => {
    const lista = await listarEventosPublicados();
    expect(lista.length).toBeGreaterThan(0);
    conferir(lista);
    conferir([
      ...(
        await capasDosEventos(
          lista.map((e) => e.id),
          Date.now(),
        )
      ).values(),
    ]);
  });

  it("página do evento e a galeria", async () => {
    conferir(await buscarEventoPublicado(evento.slug));
    const pagina = await listarFotosDoEvento(evento.id);
    expect(pagina.fotos.length).toBeGreaterThan(0);
    conferir(pagina);
    // As fotos com o banco estragado continuam na galeria, mas com o aviso no lugar da imagem.
    for (const id of [comDrive.id, comOriginal.id, comGoogleusercontent.id]) {
      const foto = pagina.fotos.find((f) => f.id === id);
      if (!foto) continue;
      expect(foto.urlPrevia).toBe(IMAGEM_PROCESSANDO);
      expect(foto.urlMiniatura).toBe(IMAGEM_PROCESSANDO);
    }
  });

  it("página da foto (ampliada, celular e computador)", async () => {
    for (const foto of prontas.slice(0, 6)) conferir(await buscarFotoPublica(foto.id));
    const estragada = await buscarFotoPublica(comDrive.id);
    expect(estragada?.foto.urlPrevia).toBe(IMAGEM_PROCESSANDO);
    expect(estragada?.foto.urlPreviaCelular ?? null).toBeNull();
    expect((await buscarFotoPublica(comOriginal.id))?.foto.urlPrevia).toBe(IMAGEM_PROCESSANDO);
  });

  it("resultado da busca por selfie e por número de peito", async () => {
    conferir(
      await fotosEncontradas(
        evento.id,
        prontas.map((f) => f.id),
      ),
    );
    const numero = numeros.find((n) => prontas.some((f) => f.id === n.fotoId));
    if (numero) conferir(await fotosPorNumero(evento.id, numero.numero));
  });

  it("a foto que ainda não ficou pronta mostra o aviso", async () => {
    const banco = await obterBanco();
    const [linha] = await banco.select().from(t.fotos).where(eq(t.fotos.id, prontas[3].id));
    const { paraFoto } = await import("./mapas");
    const foto = paraFoto({ ...linha, status: "processando" });
    expect(foto.urlPrevia).toBe(IMAGEM_PROCESSANDO);
    expect(foto.urlMiniatura).toBe(IMAGEM_PROCESSANDO);
    expect(JSON.stringify(foto)).not.toMatch(/chaveOriginal|originais\//);
  });
});
