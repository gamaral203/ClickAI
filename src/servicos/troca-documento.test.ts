import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

// Cada "aparelho" é um pote de cookies; o teste escolhe qual está fazendo a requisição.
const aparelhos = vi.hoisted(() => ({
  atual: "a",
  potes: new Map<string, Map<string, string>>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    const pote = aparelhos.potes.get(aparelhos.atual) ?? new Map<string, string>();
    aparelhos.potes.set(aparelhos.atual, pote);
    return {
      get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome)! } : undefined),
      set: (nome: string, valor: string) => pote.set(nome, valor),
      delete: (nome: string) => pote.delete(nome),
    };
  },
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

import {
  atualizarContaDoFotografo,
  buscarContaDoFotografo,
  criarContaDeFotografo,
  criarUsuario,
  listarMensagens,
  salvarLancamentos,
  salvarPedido,
  type PedidoInterno,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { gerarHashSenha } from "@/lib/senha";

import { BLOQUEIO_SAQUE_APOS_TROCA_MS, saqueBloqueadoAte, solicitarSaque } from "./saques";
import { entrar, sessaoAtual, usuarioAtual, type SessaoAtual } from "./sessao";
import { confirmarIdentidade, LOGIN_GOOGLE_RECENTE_MS, trocarDocumento } from "./troca-documento";

const SENHA = "senha-do-fotografo-1";
const CPF_ANTIGO = "52998224725";
const CPF_NOVO = "11144477735";
const HORA = 60 * 60 * 1000;

function em(aparelho: string) {
  aparelhos.atual = aparelho;
}

/** Fotógrafo com senha, CPF e chave Pix confirmada, logado nos aparelhos "a" e "b". */
async function fotografoLogado() {
  const email = `${randomUUID()}@teste.com`;
  const usuario = await criarUsuario({
    nome: "Fotógrafa Teste",
    email,
    senhaHash: gerarHashSenha(SENHA),
    papel: "fotografo",
  });
  await criarContaDeFotografo({
    usuarioId: usuario.id,
    nomePublico: "Fotógrafa Teste",
    slug: `teste-${randomUUID().slice(0, 8)}`,
  });
  await atualizarContaDoFotografo(usuario.id, { cpfCnpj: CPF_ANTIGO, chavePix: CPF_ANTIGO });
  em("b");
  await entrar(email, SENHA);
  em("a");
  await entrar(email, SENHA);
  const sessao = (await sessaoAtual())!;
  return { usuario, email, sessao };
}

/** Venda paga há 40 dias (saldo sacável no saque normal). */
async function saldoDisponivel(fotografoId: string) {
  const banco = await obterBanco();
  const [foto] = await banco.select({ id: t.fotos.id }).from(t.fotos).limit(1);
  const pedidoId = randomUUID();
  const itemId = randomUUID();
  const agora = Date.now();
  await salvarPedido(
    {
      id: pedidoId,
      clienteId: null,
      emailComprador: `${pedidoId}@exemplo.com`,
      nomeComprador: "Cliente",
      whatsapp: null,
      aceitaWhatsapp: false,
      cupomId: null,
      subtotalCentavos: 5000,
      descontoCentavos: 0,
      totalCentavos: 5000,
      metodo: "pix",
      status: "pago",
      expiraEm: new Date(agora).toISOString(),
      pagoEm: new Date(agora - 40 * 24 * HORA).toISOString(),
      criadoEm: new Date(agora - 40 * 24 * HORA).toISOString(),
      tokenAcessoHash: null,
      acessoExpiraEm: null,
      gatewayId: null,
      pix: null,
      lembreteEnviadoEm: null,
    } satisfies PedidoInterno,
    [
      {
        id: itemId,
        pedidoId,
        fotoId: foto.id,
        fotografoId,
        precoCentavos: 5000,
        descontoCentavos: 0,
        valorFotografoCentavos: 5000,
        valorDonoEventoCentavos: 0,
        viaPacote: false,
      },
    ],
  );
  await salvarLancamentos([
    {
      id: randomUUID(),
      fotografoId,
      itemPedidoId: itemId,
      valorCentavos: 5000,
      disponivelEm: new Date(agora - 10 * 24 * HORA).toISOString(),
      antecipavelEm: new Date(agora - 39 * 24 * HORA).toISOString(),
      saqueId: null,
    },
  ]);
}

beforeEach(() => {
  aparelhos.potes.clear();
  em("a");
  vi.stubEnv("MP_ACCESS_TOKEN", "");
});

describe("troca de CPF/CNPJ do fotógrafo", () => {
  it("recusa a senha errada e não troca nada", async () => {
    const { usuario, sessao } = await fotografoLogado();
    expect(await confirmarIdentidade(sessao, "senha-errada")).toBe("senha");
    expect(await confirmarIdentidade(sessao, "")).toBe("senha");
    expect(await confirmarIdentidade(sessao, null)).toBe("senha");
    const conta = await buscarContaDoFotografo(usuario.id);
    expect(conta?.cpfCnpj).toBe(CPF_ANTIGO);
    expect(conta?.chavePix).toBe(CPF_ANTIGO);
    expect(conta?.documentoTrocadoEm).toBeNull();
  });

  it("com a senha certa: troca, volta a pedir a chave, avisa por e-mail e derruba as outras sessões", async () => {
    const { usuario, email, sessao } = await fotografoLogado();
    expect(await confirmarIdentidade(sessao, SENHA)).toBe("ok");
    const agora = Date.now();
    await trocarDocumento(sessao, CPF_NOVO, agora);

    const conta = await buscarContaDoFotografo(usuario.id);
    expect(conta?.cpfCnpj).toBe(CPF_NOVO);
    expect(conta?.chavePix).toBeNull();
    expect(new Date(conta!.documentoTrocadoEm!).getTime()).toBe(agora);

    const aviso = (await listarMensagens(1000)).find(
      (m) => m.para === email && m.tipo === "seguranca",
    );
    expect(aviso?.assunto).toMatch(/CPF\/CNPJ/);
    // O documento novo não vai no e-mail.
    expect(aviso?.texto).not.toContain(CPF_NOVO);

    // Esta sessão continua; a do outro aparelho caiu.
    expect((await usuarioAtual())?.id).toBe(usuario.id);
    em("b");
    expect(await usuarioAtual()).toBeNull();
  });

  it("bloqueia saques por 72 horas depois da troca e libera depois", async () => {
    const { usuario, sessao } = await fotografoLogado();
    await trocarDocumento(sessao, CPF_NOVO);
    // Confirma a chave nova (o mesmo que o botão "Usar meu CPF/CNPJ como chave Pix").
    await atualizarContaDoFotografo(usuario.id, { chavePix: CPF_NOVO });
    let conta = (await buscarContaDoFotografo(usuario.id))!;
    await saldoDisponivel(conta.id);

    // Logo depois da troca: bloqueado, com a hora em que libera.
    const resultado = await solicitarSaque(conta, usuario, false);
    expect(resultado).toMatchObject({ ok: false, motivo: "documento_trocado" });
    const ate = new Date((resultado as { bloqueadoAte: string }).bloqueadoAte).getTime();
    const trocadoEm = new Date(conta.documentoTrocadoEm!).getTime();
    expect(ate - trocadoEm).toBe(BLOQUEIO_SAQUE_APOS_TROCA_MS);

    // Ainda bloqueado com 71 horas; liberado com 72.
    expect(saqueBloqueadoAte(conta, trocadoEm + 71 * HORA)).not.toBeNull();
    expect(saqueBloqueadoAte(conta, trocadoEm + 72 * HORA)).toBeNull();

    // A troca foi há 73 horas: o saque sai (simulado, sem Mercado Pago).
    const banco = await obterBanco();
    await banco
      .update(t.fotografos)
      .set({ documentoTrocadoEm: new Date(Date.now() - 73 * HORA) })
      .where(eq(t.fotografos.id, conta.id));
    conta = (await buscarContaDoFotografo(usuario.id))!;
    const liberado = await solicitarSaque(conta, usuario, false);
    expect(liberado.ok).toBe(true);
    if (liberado.ok) expect(liberado.saque.chavePix).toBe(CPF_NOVO);
  });

  it("conta só com o Google: vale só um login com o Google de menos de 10 minutos", async () => {
    const usuario = await criarUsuario({
      nome: "Só Google",
      email: `${randomUUID()}@teste.com`,
      senhaHash: null,
      papel: "fotografo",
      googleId: randomUUID(),
      emailConfirmado: true,
    });
    const agora = Date.now();
    const sessao = (metodo: SessaoAtual["metodo"], minutos: number): SessaoAtual => ({
      usuario,
      metodo,
      entrouEm: agora - minutos * 60_000,
    });
    expect(await confirmarIdentidade(sessao("google", 2), null, agora)).toBe("ok");
    expect(
      await confirmarIdentidade(
        { ...sessao("google", 0), entrouEm: agora - LOGIN_GOOGLE_RECENTE_MS - 1 },
        null,
        agora,
      ),
    ).toBe("google_antigo");
    expect(await confirmarIdentidade(sessao("senha", 1), "qualquer", agora)).toBe("google_antigo");
  });
});
