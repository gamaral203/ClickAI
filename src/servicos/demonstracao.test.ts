import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Conta de demonstração: dados fictícios no site real, sem vazar para saque, rankings, gestão
// e listagens.

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarContaDoFotografo,
  listarEventosPublicados,
  resumoGeral,
  resumoPorFotografo,
  vendasDaSemanaPorEvento,
  vendasPorAutor,
  vendasPorDiaDaPlataforma,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { senhaConfere } from "@/lib/senha";
import { criarContaDemonstracao } from "@/servicos/demonstracao";
import { solicitarSaque } from "@/servicos/saques";

const EMAIL = "Demo.Video@Example.com";
let criada: Exclude<Awaited<ReturnType<typeof criarContaDemonstracao>>, { erro: string }>;
let antes: Awaited<ReturnType<typeof resumoGeral>>;
let rankingAntes: [string, number][];
let plataformaAntes: number;

const somaDaPlataforma = async () =>
  (await vendasPorDiaDaPlataforma(90)).reduce((s, d) => s + d.valorCentavos, 0);

beforeAll(async () => {
  antes = await resumoGeral();
  rankingAntes = await vendasDaSemanaPorEvento();
  plataformaAntes = await somaDaPlataforma();
  const r = await criarContaDemonstracao({
    email: EMAIL,
    senha: "senha-de-teste",
    nome: "Studio Clique Bahia",
    semente: 42,
  });
  if ("erro" in r) throw new Error(r.erro);
  criada = r;
}, 60_000);

describe("conta de demonstração", () => {
  it("cria o fotógrafo com login, eventos, fotos e cerca de R$ 12 mil em vendas", async () => {
    expect(criada.eventos).toBe(4);
    expect(criada.fotos).toBeGreaterThan(100);
    expect(criada.vendidoCentavos).toBeGreaterThanOrEqual(12_000_00);
    expect(criada.vendidoCentavos).toBeLessThan(13_000_00);
    // Números quebrados: não fecha em reais redondos.
    expect(criada.vendidoCentavos % 100).not.toBe(0);

    const banco = await obterBanco();
    const [usuario] = await banco
      .select()
      .from(t.usuarios)
      .where(sql`lower(${t.usuarios.email}) = ${EMAIL.toLowerCase()}`);
    expect(usuario.papel).toBe("fotografo");
    expect(usuario.emailConfirmadoEm).not.toBeNull();
    expect(senhaConfere("senha-de-teste", usuario.senhaHash!)).toBe(true);

    const [{ total }] = await banco
      .select({ total: sql<number>`coalesce(sum(${t.lancamentos.valorCentavos}), 0)::int` })
      .from(t.lancamentos)
      .where(eq(t.lancamentos.fotografoId, criada.fotografoId));
    // O cartão desconta a parte do vendedor na taxa: um pouco abaixo do vendido.
    expect(total).toBeGreaterThan(11_500_00);
    expect(total).toBeLessThanOrEqual(criada.vendidoCentavos);

    const pedidos = await banco
      .select({ email: t.pedidos.emailComprador, demonstracao: t.pedidos.demonstracao })
      .from(t.pedidos)
      .innerJoin(t.itensPedido, eq(t.itensPedido.pedidoId, t.pedidos.id))
      .where(eq(t.itensPedido.fotografoId, criada.fotografoId));
    expect(pedidos.every((p) => p.demonstracao && p.email.endsWith("@example.com"))).toBe(true);
  });

  it("e-mail já usado: recusa sem criar nada", async () => {
    const r = await criarContaDemonstracao({
      email: EMAIL.toUpperCase(),
      senha: "outra-senha",
      nome: "Outro",
    });
    expect(r).toEqual({ erro: "Já existe uma conta com este e-mail." });
  });

  it("os eventos não aparecem nas listagens públicas", async () => {
    const banco = await obterBanco();
    const meus = await banco
      .select({ id: t.eventos.id })
      .from(t.eventos)
      .where(eq(t.eventos.fotografoId, criada.fotografoId));
    const publicos = await listarEventosPublicados();
    expect(publicos.some((e) => meus.some((m) => m.id === e.id))).toBe(false);
  });

  it("o saldo fictício não pode ser sacado", async () => {
    const banco = await obterBanco();
    const [f] = await banco
      .select({ usuarioId: t.fotografos.usuarioId })
      .from(t.fotografos)
      .where(eq(t.fotografos.id, criada.fotografoId));
    const conta = (await buscarContaDoFotografo(f.usuarioId))!;
    // Mesmo com uma chave Pix confirmada.
    const r = await solicitarSaque(
      { ...conta, cpfCnpj: "52998224725", chavePix: "52998224725" },
      { id: f.usuarioId, email: EMAIL, nome: "Studio", papel: "fotografo" } as never,
      false,
    );
    expect(r).toEqual({ ok: false, motivo: "demonstracao" });
  });

  it("fica fora dos rankings, do gráfico e dos números da gestão", async () => {
    expect((await vendasPorAutor()).some(([id]) => id === criada.fotografoId)).toBe(false);
    expect(await vendasDaSemanaPorEvento()).toEqual(rankingAntes);
    expect(await somaDaPlataforma()).toBe(plataformaAntes);
    expect((await resumoPorFotografo()).some((f) => f.fotografoId === criada.fotografoId)).toBe(
      false,
    );
    const depois = await resumoGeral();
    expect(depois.entradaCentavos).toBe(antes.entradaCentavos);
    expect(depois.pedidosPagos).toBe(antes.pedidosPagos);
    expect(depois.aPagarCentavos).toBe(antes.aPagarCentavos);
  });
});
