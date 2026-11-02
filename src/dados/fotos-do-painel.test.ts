import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({ fotografoId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/servicos/manutencao", () => ({ respostaDaManutencao: async () => null }));
vi.mock("@/servicos/sessao", () => ({
  exigirFotografo: async () => ({ conta: { id: sessao.fotografoId } }),
  usuarioAtual: async () => (sessao.fotografoId ? { id: "usuario", papel: "fotografo" } : null),
  contaDoPainel: async () => ({ id: sessao.fotografoId }),
}));

import { mudarLiberacaoAcao } from "@/app/(fotografo)/painel/eventos/liberacao-acoes";
import { GET as rotaDasFotos } from "@/app/api/painel/eventos/[id]/fotos/route";
import { GET as rotaDaSituacao } from "@/app/api/painel/eventos/[id]/situacao/route";
import {
  contagensDoPainel,
  criarPasta,
  idsDoFiltroDoPainel,
  listarItensDoPainel,
  listarPastasDoPainel,
  moverFotosDoPainel,
  paginaDoPainel,
  situacaoDasFotosDoEvento,
} from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import {
  diasComFotos,
  FILTRO_PADRAO,
  filtrarItensDoPainel,
  SEM_PASTA,
  type FiltroDoPainel,
} from "@/lib/filtro-painel";
import { ritmoObservado, textoDaPrevisao } from "@/lib/previsao-fotos";

const [lia, pedro] = fotografos;
const evento = eventos.find((e) => e.slug === "meia-maratona-rio-2026")!;
const agora = Date.now();
let ids: string[] = [];
let pastaId = "";

beforeAll(async () => {
  sessao.fotografoId = lia.id;
  const banco = await obterBanco();
  const pasta = await criarPasta(evento.id, lia.id, "Largada carga", null);
  if (!("pasta" in pasta)) throw new Error("Pasta não criada");
  pastaId = pasta.pasta.id;
  const linhas = Array.from({ length: 120 }, (_, i) => ({
    id: randomUUID(),
    eventoId: evento.id,
    enviadaPor: lia.id,
    chaveOriginal: `originais/a/${i}.jpg`,
    urlPrevia: `previas/a/${i}.webp`,
    urlMiniatura: `miniaturas/a/${i}.webp`,
    nomeArquivo: `lote-${i}.jpg`,
    largura: 10,
    altura: 10,
    ordem: 500000 + i,
    status:
      i % 3 === 0
        ? ("processando" as const)
        : i % 3 === 1
          ? ("pronta" as const)
          : ("erro" as const),
    erroMensagem: i % 3 === 2 ? "Erro de teste" : null,
    pastaId: i % 4 === 0 ? pastaId : null,
    capturadaEm: i % 5 === 0 ? null : new Date("2026-10-15T12:00:00Z"),
    criadoEm: new Date(i % 2 === 0 ? "2026-10-16T12:00:00Z" : "2026-10-17T02:30:00Z"),
    liberacao: "automatica" as const,
    liberarEm: i % 7 === 0 ? null : new Date(i % 7 === 1 ? agora + 3_600_000 : agora - 3_600_000),
  }));
  ids = linhas.map((l) => l.id);
  await banco.insert(t.fotos).values(linhas);
});

const pedido = (url: string) =>
  ({ nextUrl: new URL(url, "http://x"), headers: new Headers() }) as unknown as NextRequest;
const contexto = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("contagens da grade paginada: as mesmas regras da tela", () => {
  const filtros: Partial<FiltroDoPainel>[] = [
    {},
    { situacao: "pronta" },
    { situacao: "processando" },
    { situacao: "erro" },
    { liberacao: "agendada" },
    { liberacao: "manual", situacao: "pronta" },
    { pasta: SEM_PASTA },
    { base: "envio", dia: "2026-10-16" },
    { base: "captura", dia: "sem-data" },
  ];

  it.each(filtros)("filtro %j", async (parcial) => {
    const filtro = { ...FILTRO_PADRAO, ...parcial };
    const itens = (await listarItensDoPainel(evento.id, lia.id))!;
    const pastas = (await listarPastasDoPainel(evento.id, lia.id))!;
    const esperadas = filtrarItensDoPainel(itens, filtro, pastas, agora);
    const contagens = await contagensDoPainel(evento.id, filtro, agora);
    expect(contagens.total).toBe(esperadas.length);

    const semSituacao = filtrarItensDoPainel(
      itens,
      { ...filtro, situacao: "todas" },
      pastas,
      agora,
    );
    expect(contagens.situacao.todas).toBe(semSituacao.length);
    for (const s of ["pronta", "processando", "erro"] as const) {
      expect(contagens.situacao[s]).toBe(semSituacao.filter((i) => i.status === s).length);
    }
    const semDia = filtrarItensDoPainel(itens, { ...filtro, dia: "todos" }, pastas, agora);
    expect(contagens.dias).toEqual(diasComFotos(semDia, filtro.base));

    // Passar por todas as páginas dá exatamente a lista inteira, na mesma ordem, sem repetir.
    const vistas: string[] = [];
    for (let desde = 0; desde < esperadas.length; desde += 24) {
      vistas.push(...(await paginaDoPainel(evento.id, filtro, agora, desde, 24)).map((i) => i.id));
    }
    expect(new Set(vistas).size).toBe(esperadas.length);
    expect(new Set(vistas)).toEqual(new Set(esperadas.map((i) => i.id)));
    const todas = await idsDoFiltroDoPainel(evento.id, filtro, agora);
    expect(new Set(todas.map((i) => i.id))).toEqual(new Set(vistas));
  });

  it("situação do evento conta só as três situações, sem as excluídas", async () => {
    const itens = (await listarItensDoPainel(evento.id, lia.id))!;
    expect(await situacaoDasFotosDoEvento(evento.id)).toEqual({
      pronta: itens.filter((i) => i.status === "pronta").length,
      processando: itens.filter((i) => i.status === "processando").length,
      erro: itens.filter((i) => i.status === "erro").length,
    });
  });

  it("a página não leva chave de original nem as colunas internas da fila", async () => {
    const [item] = await paginaDoPainel(evento.id, FILTRO_PADRAO, agora, 0, 1);
    expect(item).not.toHaveProperty("chaveOriginal");
    expect(item).not.toHaveProperty("tentativasProcessamento");
    expect(item).not.toHaveProperty("rostosTentarEm");
  });
});

describe("ações sobre a seleção do filtro inteiro", () => {
  it("mover e liberar 'todas do filtro' valem para as que não foram carregadas", async () => {
    const filtro: FiltroDoPainel = { ...FILTRO_PADRAO, situacao: "erro", pasta: SEM_PASTA };
    const antes = await contagensDoPainel(evento.id, filtro, agora);
    expect(antes.total).toBeGreaterThan(24);

    const movidas = await moverFotosDoPainel(
      evento.id,
      lia.id,
      { tipo: "filtro", filtro },
      pastaId,
      agora,
    );
    expect(movidas).toEqual({ movidas: antes.total });
    const noDestino = { ...FILTRO_PADRAO, situacao: "erro" as const, pasta: pastaId };
    const naoLiberadas = await contagensDoPainel(evento.id, noDestino, Date.now());
    const alvo = naoLiberadas.liberacao.agendada + naoLiberadas.liberacao.manual;
    expect(alvo).toBeGreaterThan(0);

    const r = await mudarLiberacaoAcao({
      eventoId: evento.id,
      mudanca: { acao: "liberar" },
      filtro: noDestino,
    });
    expect(r).toEqual({ alteradas: alvo });
    // As de outras situações não mudaram.
    const banco = await obterBanco();
    const prontasManuais = await banco
      .select({ liberarEm: t.fotos.liberarEm, status: t.fotos.status })
      .from(t.fotos)
      .where(inArray(t.fotos.id, ids));
    expect(prontasManuais.some((p) => p.status === "pronta" && p.liberarEm === null)).toBe(true);
  });
});

describe("rotas da grade", () => {
  it("página e contagens para o dono; 404 para outra conta; 401 sem sessão", async () => {
    const url = `/api/painel/eventos/${evento.id}/fotos?situacao=processando&limite=10`;
    const ok = await rotaDasFotos(pedido(url), contexto(evento.id));
    expect(ok.status).toBe(200);
    const dados = await ok.json();
    expect(dados.itens).toHaveLength(10);
    expect(dados.itens.every((i: { status: string }) => i.status === "processando")).toBe(true);
    expect(JSON.stringify(dados)).not.toContain("originais/");

    sessao.fotografoId = pedro.id;
    expect((await rotaDasFotos(pedido(url), contexto(evento.id))).status).toBe(404);
    expect((await rotaDaSituacao(pedido(url), contexto(evento.id))).status).toBe(404);
    sessao.fotografoId = "";
    expect((await rotaDasFotos(pedido(url), contexto(evento.id))).status).toBe(401);
    sessao.fotografoId = lia.id;
  });

  it("recusa limite acima do teto e id estranho", async () => {
    const base = `/api/painel/eventos/${evento.id}/fotos`;
    expect((await rotaDasFotos(pedido(`${base}?limite=5000`), contexto(evento.id))).status).toBe(
      400,
    );
    expect((await rotaDasFotos(pedido(base), contexto("nao-e-uuid"))).status).toBe(404);
  });

  it("consulta leve devolve só as três contagens", async () => {
    const r = await rotaDaSituacao(pedido("/"), contexto(evento.id));
    expect(Object.keys(await r.json()).sort()).toEqual(["erro", "processando", "pronta"]);
  });
});

describe("previsão", () => {
  it("em texto simples, sem prometer precisão", () => {
    expect(textoDaPrevisao(10, 120)).toBe("menos de 1 min");
    expect(textoDaPrevisao(700, 70)).toBe("cerca de 10 min");
    expect(textoDaPrevisao(7000, 70)).toBe("cerca de 1,5 h");
    expect(ritmoObservado(0, 1000)).toBeNull();
    expect(ritmoObservado(10, 60_000)).toBe(10);
  });
});
