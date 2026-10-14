import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// Um pote de cookies por teste: o cookie de sessão é montado como o login monta.
const pote = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome)! } : undefined),
    set: (nome: string, valor: string) => pote.set(nome, valor),
    delete: (nome: string) => pote.delete(nome),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }),
}));

import {
  alternarAssinaturaAcao,
  excluirAssinaturaAcao,
  salvarAssinaturaAcao,
  salvarConfiguracoesAcao,
} from "@/app/(admin)/admin/uso/acoes";
import {
  buscarAssinatura,
  contarUso,
  criarAssinatura,
  criarUsuario,
  lerConfiguracoesGestao,
  lerUsoInterno,
  listarAssinaturas,
  registrarMensagem,
  versaoDaSessao,
  type Papel,
} from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { assinar } from "@/lib/assinatura";
import { enviarEmail } from "@/lib/email";
import {
  CONTADOR,
  custoR2CentavosUsd,
  diasParaVencer,
  dolarParaReal,
  hojeEmBrasilia,
  pareceNumeroDeCartao,
  periodoDoMes,
  resumirGastos,
  textoDoVencimento,
  validarAssinatura,
  valorAnual,
  valorMensal,
  type DadosAssinatura,
} from "@/lib/painel-de-uso";

import { avisarVencimentosDeAssinaturas } from "./avisos-assinaturas";

// Painel de uso (/admin/uso): só o gestor vê e edita; cálculos de gasto e vencimento no fuso de
// Brasília; aviso de vencimento idempotente; contadores de uso.

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

function formulario(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const VALIDA = {
  nome: "Vercel",
  categoria: "hospedagem",
  plano: "Pro",
  valor: "20,00",
  moeda: "USD",
  ciclo: "mensal",
  assinadaEm: "2026-01-10",
  renovaEm: "2026-11-10",
  formaPagamento: "Mastercard final 9292",
  responsavel: "Gabriel",
  linkPainel: "https://vercel.com/dashboard",
  observacoes: "",
};

function dados(parcial: Partial<DadosAssinatura> = {}): DadosAssinatura {
  return {
    nome: `Serviço ${randomUUID().slice(0, 8)}`,
    categoria: "outros",
    plano: "",
    valorCentavos: 1000,
    moeda: "BRL",
    ciclo: "mensal",
    assinadaEm: "2026-01-01",
    renovaEm: null,
    formaPagamento: "",
    responsavel: "",
    linkPainel: null,
    observacoes: "",
    ...parcial,
  };
}

/** Dia em Brasília daqui a `n` dias. */
function daqui(n: number) {
  return hojeEmBrasilia(Date.now() + n * 86_400_000);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- Acesso

describe("acesso: só o gestor, conferido no servidor", () => {
  const acoes = {
    salvar: () => salvarAssinaturaAcao({}, formulario(VALIDA)),
    alternar: () => alternarAssinaturaAcao(randomUUID(), false),
    excluir: () => excluirAssinaturaAcao(randomUUID()),
    configurar: () =>
      salvarConfiguracoesAcao(
        {},
        formulario({ cotacao: "5,45", limiteDia: "100", limiteMes: "3000" }),
      ),
  };

  it("anônimo vai para o login, sem tocar no banco", async () => {
    await entrarComo(null);
    const antes = (await listarAssinaturas()).length;
    for (const acao of Object.values(acoes)) {
      await expect(acao()).rejects.toThrow(/^REDIRECT \/entrar\?proximo=%2Fadmin%2Fuso/);
    }
    expect(await listarAssinaturas()).toHaveLength(antes);
  });

  it.each(["fotografo", "cliente"] as const)("%s é recusado", async (papel) => {
    await entrarComo(papel);
    const antes = (await listarAssinaturas()).length;
    for (const acao of Object.values(acoes)) {
      await expect(acao()).rejects.toThrow(/^REDIRECT /);
    }
    expect(await listarAssinaturas()).toHaveLength(antes);
  });

  it("gestor cria, edita, desativa, reativa e exclui", async () => {
    await entrarComo("admin");
    const nome = `Vercel ${randomUUID().slice(0, 6)}`;
    expect(await salvarAssinaturaAcao({}, formulario({ ...VALIDA, nome }))).toEqual({ ok: true });
    const criada = (await listarAssinaturas()).find((a) => a.nome === nome)!;
    expect(criada).toMatchObject({
      valorCentavos: 2000,
      moeda: "USD",
      ciclo: "mensal",
      assinadaEm: "2026-01-10",
      renovaEm: "2026-11-10",
      ativa: true,
    });

    const editado = await salvarAssinaturaAcao(
      {},
      formulario({ ...VALIDA, nome, assinaturaId: criada.id, valor: "1.234,56", moeda: "BRL" }),
    );
    expect(editado).toEqual({ ok: true });
    expect(await buscarAssinatura(criada.id)).toMatchObject({
      valorCentavos: 123456,
      moeda: "BRL",
    });

    expect(await alternarAssinaturaAcao(criada.id, false)).toEqual({});
    expect((await buscarAssinatura(criada.id))?.ativa).toBe(false);
    expect(await alternarAssinaturaAcao(criada.id, true)).toEqual({});
    expect((await buscarAssinatura(criada.id))?.ativa).toBe(true);

    expect(await excluirAssinaturaAcao(criada.id)).toEqual({});
    expect(await buscarAssinatura(criada.id)).toBeNull();
    expect(await excluirAssinaturaAcao(criada.id)).toEqual({
      erro: "Assinatura não encontrada.",
    });
    expect(await alternarAssinaturaAcao("nao-e-uuid", true)).toEqual({
      erro: "Assinatura não encontrada.",
    });
  });

  it("gestor salva a cotação em centavos e os limites", async () => {
    await entrarComo("admin");
    expect(
      await salvarConfiguracoesAcao(
        {},
        formulario({ cotacao: "5,45", limiteDia: "120", limiteMes: "5000" }),
      ),
    ).toEqual({ ok: true });
    const config = await lerConfiguracoesGestao();
    expect(config).toMatchObject({
      cotacaoUsdCentavos: 545,
      limiteEmailDia: 120,
      limiteEmailMes: 5000,
    });
    expect(config.cotacaoAtualizadaEm).not.toBeNull();
    const ruim = await salvarConfiguracoesAcao(
      {},
      formulario({ cotacao: "abc", limiteDia: "100", limiteMes: "3000" }),
    );
    expect(ruim.erros?.cotacao).toBeDefined();
    const menor = await salvarConfiguracoesAcao(
      {},
      formulario({ cotacao: "", limiteDia: "100", limiteMes: "10" }),
    );
    expect(menor.erros?.limiteMes).toBeDefined();
  });
});

// ---------------------------------------------------------------- Validação

describe("validação do formulário", () => {
  it("recusa número de cartão completo em qualquer campo de texto", () => {
    for (const cartao of ["5502 0912 3456 9292", "5502-0912-3456-9292", "550209123456"]) {
      const r = validarAssinatura({ ...VALIDA, formaPagamento: cartao });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erros.formaPagamento).toMatch(/final/);
    }
    expect(validarAssinatura({ ...VALIDA, observacoes: "cartão 4111111111111111" }).ok).toBe(false);
    expect(validarAssinatura({ ...VALIDA, formaPagamento: "Visa final 1234" }).ok).toBe(true);
    expect(pareceNumeroDeCartao("11 dígitos 12345678901")).toBe(false);
  });

  it("aceita só link https válido", () => {
    for (const link of [
      "http://vercel.com",
      "javascript:alert(1)",
      "https://localhost",
      "vercel.com",
      "https://usuario:senha@vercel.com",
    ]) {
      const r = validarAssinatura({ ...VALIDA, linkPainel: link });
      expect(r.ok, link).toBe(false);
    }
    expect(validarAssinatura({ ...VALIDA, linkPainel: "" }).ok).toBe(true);
  });

  it("valores em reais/dólares viram centavos; inválidos são recusados", () => {
    const r = validarAssinatura({ ...VALIDA, valor: "19.90" });
    expect(r.ok && r.dados.valorCentavos).toBe(1990);
    for (const valor of ["", "-5", "abc", "1,999", "99999999,00"]) {
      expect(validarAssinatura({ ...VALIDA, valor }).ok, valor).toBe(false);
    }
    expect(validarAssinatura({ ...VALIDA, valor: "0" }).ok).toBe(true);
  });

  it("confere datas, categoria, ciclo e nome", () => {
    expect(validarAssinatura({ ...VALIDA, assinadaEm: "2026-02-30" }).ok).toBe(false);
    expect(validarAssinatura({ ...VALIDA, renovaEm: "2025-12-31" }).ok).toBe(false);
    expect(validarAssinatura({ ...VALIDA, categoria: "cassino" }).ok).toBe(false);
    expect(validarAssinatura({ ...VALIDA, ciclo: "semanal" }).ok).toBe(false);
    expect(validarAssinatura({ ...VALIDA, nome: "  " }).ok).toBe(false);
    const sem = validarAssinatura({ ...VALIDA, renovaEm: "" });
    expect(sem.ok && sem.dados.renovaEm).toBeNull();
  });

  it("a ação devolve o erro do campo sem gravar", async () => {
    await entrarComo("admin");
    const antes = (await listarAssinaturas()).length;
    const r = await salvarAssinaturaAcao(
      {},
      formulario({ ...VALIDA, formaPagamento: "4111 1111 1111 1111" }),
    );
    expect(r.erros?.formaPagamento).toBeDefined();
    expect(await listarAssinaturas()).toHaveLength(antes);
  });
});

// ---------------------------------------------------------------- Cálculos

describe("cálculos", () => {
  it("mensal e anual por ciclo", () => {
    expect(valorMensal({ valorCentavos: 12000, ciclo: "anual" })).toBe(1000);
    expect(valorMensal({ valorCentavos: 2000, ciclo: "mensal" })).toBe(2000);
    expect(valorMensal({ valorCentavos: 300, ciclo: "uso" })).toBe(300);
    expect(valorAnual({ valorCentavos: 2000, ciclo: "mensal" })).toBe(24000);
    expect(valorAnual({ valorCentavos: 12000, ciclo: "anual" })).toBe(12000);
    expect(valorAnual({ valorCentavos: 300, ciclo: "uso" })).toBe(3600);
  });

  it("converte o dólar pela cotação e soma só as ativas", () => {
    expect(dolarParaReal(2000, 545)).toBe(10900);
    const lista = [
      { valorCentavos: 2000, moeda: "USD" as const, ciclo: "mensal" as const, ativa: true },
      { valorCentavos: 4000, moeda: "BRL" as const, ciclo: "anual" as const, ativa: true },
      { valorCentavos: 9900, moeda: "BRL" as const, ciclo: "mensal" as const, ativa: false },
    ];
    expect(resumirGastos(lista, 545)).toEqual({
      mensalBrl: 333,
      mensalUsd: 2000,
      mensalTotalBrl: 333 + 10900,
      anualBrl: 4000,
      anualUsd: 24000,
      anualTotalBrl: 4000 + 130800,
      ativas: 2,
    });
    // Sem cotação: o total some (não dá para somar dólar), o separado continua.
    expect(resumirGastos(lista, null).mensalTotalBrl).toBeNull();
    expect(resumirGastos(lista.slice(1), null).mensalTotalBrl).toBe(333);
  });

  it("'vence em N dias' conta o calendário de Brasília", () => {
    // 14/10/2026 às 23:30 em Brasília = 15/10 02:30 UTC: para Brasília ainda é dia 14.
    const noite = Date.parse("2026-10-15T02:30:00Z");
    expect(hojeEmBrasilia(noite)).toBe("2026-10-14");
    expect(diasParaVencer("2026-10-15", noite)).toBe(1);
    expect(diasParaVencer("2026-10-21", noite)).toBe(7);
    expect(diasParaVencer("2026-10-14", noite)).toBe(0);
    expect(diasParaVencer("2026-10-12", noite)).toBe(-2);
    expect(textoDoVencimento(0)).toBe("vence hoje");
    expect(textoDoVencimento(1)).toBe("vence amanhã");
    expect(textoDoVencimento(7)).toBe("vence em 7 dias");
    expect(textoDoVencimento(-2)).toBe("venceu há 2 dias");
  });

  it("período do mês em Brasília e virada de ano", () => {
    const janeiro = Date.parse("2027-01-01T01:00:00Z"); // ainda 31/12/2026 em Brasília
    expect(periodoDoMes("atual", janeiro)).toMatchObject({
      diaInicio: "2026-12-01",
      diaFim: "2027-01-01",
      inicio: "2026-12-01T00:00:00-03:00",
    });
    expect(periodoDoMes("anterior", janeiro)).toMatchObject({
      diaInicio: "2026-11-01",
      diaFim: "2026-12-01",
    });
  });

  it("custo do R2: 10 GB grátis, US$ 0,015/GB acima", () => {
    const GB = 1024 ** 3;
    expect(custoR2CentavosUsd(5 * GB)).toBe(0);
    expect(custoR2CentavosUsd(10 * GB)).toBe(0);
    expect(custoR2CentavosUsd(110 * GB)).toBe(150);
  });
});

// ---------------------------------------------------------------- Aviso de vencimento

describe("aviso de vencimento aos gestores", () => {
  let enviados: { to: string[]; subject: string; text: string }[];

  beforeEach(async () => {
    // As de exemplo (e as de outros testes) não entram: só as criadas aqui.
    const banco = await obterBanco();
    await banco.update(t.assinaturas).set({ ativa: false });
    enviados = [];
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    vi.stubEnv("EMAIL_REMETENTE", "ClicouAí <oi@exemplo.com>");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    });
  });

  it("um e-mail só, com todas, a 7 dias e de novo a 1 dia; nunca repete", async () => {
    const seteDias = await criarAssinatura(dados({ nome: "Vercel", renovaEm: daqui(6) }), null);
    const umDia = await criarAssinatura(dados({ nome: "Supabase", renovaEm: daqui(1) }), null);
    await criarAssinatura(dados({ nome: "Longe", renovaEm: daqui(20) }), null);
    await criarAssinatura(dados({ nome: "Inativa", renovaEm: daqui(2) }), null).then((id) =>
      obterBanco().then((b) =>
        b.update(t.assinaturas).set({ ativa: false }).where(eq(t.assinaturas.id, id)),
      ),
    );
    await criarAssinatura(dados({ nome: "Vencida", renovaEm: daqui(-1) }), null);
    await entrarComo("admin"); // garante pelo menos um gestor

    expect(await avisarVencimentosDeAssinaturas()).toBe(2);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].subject).toBe("2 assinaturas vencem em breve");
    expect(enviados[0].text).toContain("Vercel");
    expect(enviados[0].text).toContain("Supabase: vence amanhã");
    expect(enviados[0].text).not.toContain("Longe");
    expect(enviados[0].text).not.toContain("Inativa");
    expect(enviados[0].text).not.toContain("Vencida");
    expect(enviados[0].to.length).toBeGreaterThanOrEqual(1);

    // A próxima execução do job (10 minutos depois) não repete nada.
    expect(await avisarVencimentosDeAssinaturas()).toBe(0);
    expect(enviados).toHaveLength(1);

    // A de 7 dias chega a 1 dia: sai o segundo aviso, só dela.
    const amanha = Date.now() + 5 * 86_400_000;
    expect(await avisarVencimentosDeAssinaturas(amanha)).toBe(1);
    expect(enviados[1].subject).toBe("Assinatura Vercel vence amanhã");
    expect(await avisarVencimentosDeAssinaturas(amanha)).toBe(0);

    // Mudar a data de renovação zera os avisos.
    const banco = await obterBanco();
    const [antes] = await banco
      .select({ a7: t.assinaturas.aviso7dEm, a1: t.assinaturas.aviso1dEm })
      .from(t.assinaturas)
      .where(eq(t.assinaturas.id, umDia));
    expect(antes.a7).not.toBeNull();
    expect(antes.a1).not.toBeNull();
    await entrarComo("admin");
    await salvarAssinaturaAcao(
      {},
      formulario({
        ...VALIDA,
        assinaturaId: umDia,
        nome: "Supabase",
        assinadaEm: "2026-01-01",
        renovaEm: daqui(3),
      }),
    );
    expect(await avisarVencimentosDeAssinaturas()).toBe(1);
    expect(enviados.at(-1)?.subject).toBe(`Assinatura Supabase vence em 3 dias`);
    expect(seteDias).toBeDefined();
  });

  it("Resend recusou: devolve a reserva e tenta na próxima", async () => {
    await criarAssinatura(dados({ nome: "Resend", renovaEm: daqui(4) }), null);
    await entrarComo("admin");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    expect(await avisarVencimentosDeAssinaturas()).toBe(0);
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    });
    expect(await avisarVencimentosDeAssinaturas()).toBe(1);
    expect(enviados).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- Contadores de uso

describe("contadores de uso interno", () => {
  it("conta e-mails aceitos pelo Resend (por destinatário), buscas, mensagens, fotos e pedidos", async () => {
    const mes = periodoDoMes("atual");
    const ler = () => lerUsoInterno(mes, mes.inicioHoje, mes.hoje);
    const antes = await ler();

    // E-mail: só conta quando o Resend aceita; vários destinatários contam um cada.
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    vi.stubEnv("EMAIL_REMETENTE", "ClicouAí <oi@exemplo.com>");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    await enviarEmail({ para: "a@exemplo.com", assunto: "Oi", paragrafos: ["Olá"] });
    await enviarEmail({ para: ["b@exemplo.com", "c@exemplo.com"], assunto: "Oi", paragrafos: [] });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    await enviarEmail({ para: "d@exemplo.com", assunto: "Oi", paragrafos: [] });

    await contarUso(CONTADOR.buscaSelfie);
    await contarUso(CONTADOR.buscaSelfie);
    await registrarMensagem({
      pedidoId: null,
      canal: "email",
      tipo: "venda",
      para: "e@exemplo.com",
      assunto: "Venda",
      texto: "Venda",
    });

    const banco = await obterBanco();
    const base = {
      eventoId: eventos[0].id,
      enviadaPor: fotografos[0].id,
      urlPrevia: "/x.jpg",
      urlMiniatura: "/x.jpg",
      nomeArquivo: "x.jpg",
      largura: 10,
      altura: 10,
      ordem: 99_999,
    };
    await banco.insert(t.fotos).values([
      { ...base, status: "pronta", tipo: "foto", chaveOriginal: "o/1.jpg", tamanhoBytes: 1000 },
      { ...base, status: "pronta", tipo: "video", chaveOriginal: "o/2.mp4", tamanhoBytes: 5000 },
      { ...base, status: "processando", tipo: "foto" },
      { ...base, status: "erro", tipo: "foto" },
    ]);

    const depois = await ler();
    expect(depois.emails.resendHoje - antes.emails.resendHoje).toBe(3);
    expect(depois.emails.resendPeriodo - antes.emails.resendPeriodo).toBe(3);
    expect(depois.busca.buscasSelfiePeriodo - antes.busca.buscasSelfiePeriodo).toBe(2);
    expect(depois.busca.diasComRegistroBusca).toBeGreaterThanOrEqual(1);
    const venda = (u: typeof antes) =>
      u.emails.caixaPorTipo.find((x) => x.tipo === "venda")?.total ?? 0;
    expect(venda(depois) - venda(antes)).toBe(1);
    expect(depois.midia.fotosHoje - antes.midia.fotosHoje).toBe(1);
    expect(depois.midia.videosPeriodo - antes.midia.videosPeriodo).toBe(1);
    expect(depois.midia.processandoAgora - antes.midia.processandoAgora).toBe(1);
    expect(depois.midia.comErroAgora - antes.midia.comErroAgora).toBe(1);
    expect(depois.armazenamento.itens - antes.armazenamento.itens).toBe(2);
    expect(
      depois.armazenamento.bytesOriginaisMedidos - antes.armazenamento.bytesOriginaisMedidos,
    ).toBe(6000);

    // O contador guarda só dia, chave e total: nenhuma outra coluna existe.
    const [linha] = await banco
      .execute(sql`select * from contadores_uso where chave = ${CONTADOR.buscaSelfie} limit 1`)
      .then((r) => ("rows" in r ? r.rows : r) as Record<string, unknown>[]);
    expect(Object.keys(linha).sort()).toEqual(["chave", "dia", "total"]);
  });

  it("o mês anterior não mistura com o atual", async () => {
    const atual = periodoDoMes("atual");
    const anterior = periodoDoMes("anterior");
    const diaPassado = Date.parse(`${anterior.diaInicio}T15:00:00-03:00`);
    const antes = await lerUsoInterno(anterior, atual.inicioHoje, atual.hoje);
    await contarUso(CONTADOR.emailResend, 4, diaPassado);
    const depois = await lerUsoInterno(anterior, atual.inicioHoje, atual.hoje);
    expect(depois.emails.resendPeriodo - antes.emails.resendPeriodo).toBe(4);
    expect(depois.emails.resendHoje).toBe(antes.emails.resendHoje);
  });
});
