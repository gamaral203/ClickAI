import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// O redirect do Next vira um erro com o destino, para o teste ver para onde a pessoa iria.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const pote = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome)! } : undefined),
    set: (nome: string, valor: string) => pote.set(nome, valor),
    delete: (nome: string) => pote.delete(nome),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.77" }),
}));

import {
  confirmarRegeracaoAcao,
  regerarLoteAcao,
  salvarProtecaoAcao,
} from "@/app/(admin)/admin/marca-dagua/acoes";
import { GET as amostraDoGestor } from "@/app/(admin)/admin/marca-dagua/amostra/route";
import {
  configuracaoDaMarca,
  criarUsuario,
  historicoDaMarca,
  versaoDaSessao,
  type Papel,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { assinar } from "@/lib/assinatura";
import {
  CONFIG_MARCA_PADRAO,
  esquemaConfigMarca,
  estimarRegeracao,
  LIMITES_MARCA,
  normalizarConfigMarca,
} from "@/lib/protecao-previas";

import { salvarProtecao, situacaoDaProtecao } from "./protecao-previas";

// Proteção das prévias na gestão (/admin/marca-dagua): só gestor muda, limites conferidos no
// servidor, cada mudança registrada com quem mudou, regeração só com confirmação.

async function entrarComo(papel: Papel | null) {
  pote.clear();
  if (!papel) return null;
  const usuario = await criarUsuario({
    nome: `Pessoa ${papel}`,
    email: `${randomUUID()}@teste.com`,
    senhaHash: null,
    papel,
    emailConfirmado: true,
  });
  const v = await versaoDaSessao(usuario.id);
  const token = assinar(
    "sessao",
    { u: usuario.id, v, j: randomUUID(), t: Date.now(), m: "senha" },
    60 * 60_000,
  );
  pote.set("clicouai_sessao", token);
  return usuario;
}

function formulario(campos: Record<string, string | number | boolean>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (k === "variacao") {
      if (v) f.set(k, "on");
    } else f.set(k, String(v));
  }
  return f;
}

const amostraUrl = (q: Record<string, string>) =>
  new Request(`http://localhost/admin/marca-dagua/amostra?${new URLSearchParams(q)}`);
const AMOSTRA_VALIDA = {
  modelo: "padrao",
  tamanhoPct: "100",
  quantidade: "16",
  opacidadePct: "42",
  larguraPrevia: "1600",
  qualidade: "72",
  variacao: "1",
};

beforeEach(() => pote.clear());

describe("validação da configuração", () => {
  it("aceita os padrões e recusa valores fora dos limites (nunca ajusta em silêncio)", () => {
    expect(esquemaConfigMarca.safeParse(CONFIG_MARCA_PADRAO).success).toBe(true);
    const fora = [
      { opacidadePct: LIMITES_MARCA.opacidadePct.min - 1 },
      { opacidadePct: 0 },
      { quantidade: 0 },
      { quantidade: LIMITES_MARCA.quantidade.max + 1 },
      { tamanhoPct: 10 },
      { larguraPrevia: 4000 },
      { larguraPrevia: LIMITES_MARCA.larguraPrevia.max + 1 },
      { qualidade: 100 },
      { qualidade: 12.5 },
      { quantidade: "muitas" },
    ];
    for (const parcial of fora) {
      expect(
        esquemaConfigMarca.safeParse({ ...CONFIG_MARCA_PADRAO, ...parcial }).success,
        JSON.stringify(parcial),
      ).toBe(false);
    }
  });

  it("o que vem do banco é trazido para dentro dos limites (linha editada à mão)", () => {
    const n = normalizarConfigMarca({
      opacidadePct: 0,
      quantidade: 1000,
      larguraPrevia: 99999,
      qualidade: -5,
    });
    expect(n.opacidadePct).toBe(LIMITES_MARCA.opacidadePct.min);
    expect(n.quantidade).toBe(LIMITES_MARCA.quantidade.max);
    expect(n.larguraPrevia).toBe(LIMITES_MARCA.larguraPrevia.max);
    expect(n.qualidade).toBe(LIMITES_MARCA.qualidade.min);
    expect(n.variacao).toBe(true);
  });

  it("estimativa da regeração cresce com as fotos", () => {
    expect(estimarRegeracao(0)).toMatchObject({ fotos: 0, minutos: 0, custoUsd: 0 });
    const mil = estimarRegeracao(1000);
    expect(mil.gravacoesR2).toBe(3000);
    expect(mil.leiturasR2).toBe(1000);
    expect(mil.minutos).toBeGreaterThan(0);
    expect(estimarRegeracao(10_000).custoUsd).toBeGreaterThan(mil.custoUsd);
  });
});

describe("autorização do gestor", () => {
  it("visitante, cliente e fotógrafo não salvam, não pedem regeração nem veem a amostra", async () => {
    const antes = await configuracaoDaMarca();
    const campos = formulario({ ...CONFIG_MARCA_PADRAO, opacidadePct: 60 });
    for (const papel of [null, "cliente", "fotografo"] as const) {
      await entrarComo(papel);
      await expect(salvarProtecaoAcao({}, campos)).rejects.toThrow(/REDIRECT/);
      await expect(confirmarRegeracaoAcao(antes.revisao)).rejects.toThrow(/REDIRECT/);
      await expect(regerarLoteAcao()).rejects.toThrow(/REDIRECT/);
      expect((await amostraDoGestor(amostraUrl(AMOSTRA_VALIDA))).status).toBe(404);
    }
    // O serviço também confere o papel, mesmo chamado direto.
    await expect(
      salvarProtecao({ id: randomUUID(), papel: "fotografo" }, CONFIG_MARCA_PADRAO),
    ).rejects.toThrow(/gestores/);
    await expect(situacaoDaProtecao({ papel: "cliente" })).rejects.toThrow(/gestores/);
    expect((await configuracaoDaMarca()).revisao).toBe(antes.revisao);
  });

  it("o gestor salva, a revisão sobe e o histórico guarda quem mudou", async () => {
    const gestor = await entrarComo("admin");
    const antes = await configuracaoDaMarca();
    const r = await salvarProtecaoAcao(
      {},
      formulario({ ...CONFIG_MARCA_PADRAO, opacidadePct: 55, quantidade: 24, variacao: true }),
    );
    expect(r.erros).toBeUndefined();
    const depois = await configuracaoDaMarca();
    expect(depois.revisao).toBe(antes.revisao + 1);
    expect(depois).toMatchObject({ opacidadePct: 55, quantidade: 24, regeracaoPedida: false });
    const [ultima] = await historicoDaMarca(1);
    expect(ultima).toMatchObject({ revisao: depois.revisao, por: gestor!.nome });
    const banco = await obterBanco();
    const [linha] = await banco
      .select()
      .from(t.configuracoesMarca)
      .where(eq(t.configuracoesMarca.revisao, depois.revisao));
    expect(linha.criadaPor).toBe(gestor!.id);
  });

  it("o gestor recebe o erro de cada campo fora do limite e nada é gravado", async () => {
    await entrarComo("admin");
    const antes = await configuracaoDaMarca();
    const r = await salvarProtecaoAcao(
      {},
      formulario({ ...CONFIG_MARCA_PADRAO, opacidadePct: 5, larguraPrevia: 6000 }),
    );
    expect(r.erros?.opacidadePct).toMatch(/mínimo/);
    expect(r.erros?.larguraPrevia).toMatch(/máximo/);
    expect((await configuracaoDaMarca()).revisao).toBe(antes.revisao);
  });

  it("a variação desligada vem do checkbox desmarcado", async () => {
    await entrarComo("admin");
    await salvarProtecaoAcao({}, formulario({ ...CONFIG_MARCA_PADRAO, variacao: false }));
    expect((await configuracaoDaMarca()).variacao).toBe(false);
    await salvarProtecaoAcao({}, formulario({ ...CONFIG_MARCA_PADRAO, variacao: true }));
    expect((await configuracaoDaMarca()).variacao).toBe(true);
  });

  it("regeração só com confirmação da revisão em vigor; sem pedido, o lote não faz nada", async () => {
    const gestor = await entrarComo("admin");
    await salvarProtecaoAcao({}, formulario({ ...CONFIG_MARCA_PADRAO, quantidade: 18 }));
    const atual = await configuracaoDaMarca();
    // Sem R2 nos testes, o lote não toca em nada, e sem pedido nem tenta.
    const semPedido = await regerarLoteAcao();
    expect(semPedido).toMatchObject({ regeradas: 0, pedida: false });
    expect(await confirmarRegeracaoAcao(atual.revisao - 1)).toMatchObject({
      erro: expect.stringMatching(/mudou/),
    });
    expect(await confirmarRegeracaoAcao("1; drop table")).toMatchObject({
      erro: expect.any(String),
    });
    expect(await confirmarRegeracaoAcao(atual.revisao)).toEqual({});
    const [linha] = await historicoDaMarca(1);
    expect(linha.regeracaoPedidaPor).toBe(gestor!.nome);
    expect(await regerarLoteAcao()).toMatchObject({ pedida: true });
  });

  it("a amostra do gestor só sai com valores dentro dos limites", async () => {
    await entrarComo("admin");
    const ok = await amostraDoGestor(amostraUrl(AMOSTRA_VALIDA));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("image/webp");
    expect(ok.headers.get("Cache-Control")).toContain("no-store");
    for (const ruim of [
      { opacidadePct: "0" },
      { larguraPrevia: "8000" },
      { modelo: "inexistente" },
      { quantidade: "" },
    ]) {
      expect((await amostraDoGestor(amostraUrl({ ...AMOSTRA_VALIDA, ...ruim }))).status).toBe(400);
    }
  });
});
