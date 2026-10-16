import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

// Código de confirmação por e-mail das ações sensíveis (substituiu o app autenticador).

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import { buscarUsuario, criarUsuario, ligarVerificacaoPorEmail } from "@/dados";

import {
  conferirCodigoDeAcao,
  enviarCodigoDeAcao,
  exigirCodigoDeAcao,
  MAXIMO_TENTATIVAS_CODIGO_ACAO,
  pedeCodigoDeAcao,
  VALIDADE_CODIGO_ACAO_MS,
} from "./codigo-acao";
import { capturarCodigo, codigoDeAcaoEnviado } from "./testes/codigo-email";

async function usuarioNovo() {
  return criarUsuario({
    nome: "Fotógrafa Teste",
    email: `${randomUUID()}@teste.com`,
    senhaHash: null,
    papel: "fotografo",
    emailConfirmado: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("código de confirmação por e-mail", () => {
  it("o código certo vale uma vez só", async () => {
    const usuario = await usuarioNovo();
    const codigo = await codigoDeAcaoEnviado(usuario, "saque");
    expect(codigo).toMatch(/^\d{6}$/);
    expect(await conferirCodigoDeAcao(usuario.id, "saque", codigo)).toBe("ok");
    expect(await conferirCodigoDeAcao(usuario.id, "saque", codigo)).toBe("vencido");
  });

  it("cada finalidade tem o seu código", async () => {
    const usuario = await usuarioNovo();
    const codigo = await codigoDeAcaoEnviado(usuario, "documento");
    expect(await conferirCodigoDeAcao(usuario.id, "saque", codigo)).toBe("vencido");
    expect(await conferirCodigoDeAcao(usuario.id, "documento", codigo)).toBe("ok");
  });

  it("depois de 5 tentativas erradas, nem o certo vale", async () => {
    const usuario = await usuarioNovo();
    const codigo = await codigoDeAcaoEnviado(usuario, "saque");
    const errado = codigo === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAXIMO_TENTATIVAS_CODIGO_ACAO; i++) {
      expect(await conferirCodigoDeAcao(usuario.id, "saque", errado)).toBe("invalido");
    }
    expect(await conferirCodigoDeAcao(usuario.id, "saque", codigo)).toBe("bloqueado");
  });

  it("vence em 10 minutos e não reenvia em menos de 30 segundos", async () => {
    const usuario = await usuarioNovo();
    vi.useFakeTimers({ toFake: ["Date"] });
    const codigo = await codigoDeAcaoEnviado(usuario, "transferencia");
    expect(await enviarCodigoDeAcao(usuario, "transferencia")).toEqual({
      ok: false,
      motivo: "espera",
    });
    vi.setSystemTime(Date.now() + VALIDADE_CODIGO_ACAO_MS + 1000);
    expect(await conferirCodigoDeAcao(usuario.id, "transferencia", codigo)).toBe("vencido");
    // Depois da espera, sai um código novo, que vale.
    const novo = await capturarCodigo(() => enviarCodigoDeAcao(usuario, "transferencia"));
    expect(await conferirCodigoDeAcao(usuario.id, "transferencia", novo)).toBe("ok");
  });

  it("sem código digitado: faltando", async () => {
    const usuario = await usuarioNovo();
    expect(await conferirCodigoDeAcao(usuario.id, "saque", "")).toBe("faltando");
    expect(await conferirCodigoDeAcao(usuario.id, "saque", undefined)).toBe("faltando");
  });
});

describe("quando cada ação pede o código", () => {
  it("saque, transferência e troca do CPF/CNPJ pedem sempre; senha e originais só com a verificação ligada", async () => {
    const usuario = (await buscarUsuario((await usuarioNovo()).id))!;
    expect(usuario.mfaAtivo).toBe(false);
    for (const f of ["saque", "transferencia", "documento", "verificacao"] as const) {
      expect(pedeCodigoDeAcao(usuario, f)).toBe(true);
    }
    expect(pedeCodigoDeAcao(usuario, "senha")).toBe(false);
    expect(pedeCodigoDeAcao(usuario, "originais")).toBe(false);
    expect(await exigirCodigoDeAcao(usuario, "saque", undefined)).toBe("faltando");
    expect(await exigirCodigoDeAcao(usuario, "senha", undefined)).toBe("ok");

    await ligarVerificacaoPorEmail(usuario.id);
    const ligado = (await buscarUsuario(usuario.id))!;
    expect(ligado.mfaAtivo).toBe(true);
    expect(pedeCodigoDeAcao(ligado, "senha")).toBe(true);
    expect(pedeCodigoDeAcao(ligado, "originais")).toBe(true);
    const codigo = await codigoDeAcaoEnviado(ligado, "originais");
    expect(await exigirCodigoDeAcao(ligado, "originais", codigo)).toBe("ok");
  });

  it("na produção sem o Resend, nenhuma ação fica travada", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_REMETENTE", "");
    const usuario = (await buscarUsuario((await usuarioNovo()).id))!;
    expect(pedeCodigoDeAcao(usuario, "saque")).toBe(false);
    expect(await exigirCodigoDeAcao(usuario, "saque", undefined)).toBe("ok");
  });
});
