import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  apagarCredencialDrive,
  armazenamentoExperimentalAtivo,
  CONFIG_ARMAZENAMENTO_EXPERIMENTAL,
  definirArmazenamentoDoEvento,
  definirPastaRaizDrive,
  esquecerPastaDrive,
  FINALIDADE_REFRESH_TOKEN_DRIVE,
  gravarConfiguracao,
  gravarCredencialDrive,
  gravarPastaDrive,
  lerConfiguracao,
  lerCredencialDrive,
  mensagemSemSegredo,
  pastaDrive,
  registrarErroDrive,
  registrarMetricaArmazenamento,
  registrarUsoDrive,
  resumoMetricasArmazenamento,
  situacaoDaConexaoDrive,
} from "@/dados/configuracoes";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { decifrarSegredo } from "@/lib/segredo-cifrado";

const [lia] = fotografos;
const evento = eventos.find((e) => e.fotografoId === lia.id)!;

describe("configurações", () => {
  it("lê nulo sem linha, grava, troca e registra quem mudou", async () => {
    const chave = `teste-${randomUUID()}`;
    expect(await lerConfiguracao(chave)).toBeNull();
    await gravarConfiguracao(chave, { a: 1 }, null);
    expect(await lerConfiguracao(chave)).toEqual({ a: 1 });
    const banco = await obterBanco();
    const [gestor] = await banco.select({ id: t.usuarios.id }).from(t.usuarios).limit(1);
    await gravarConfiguracao(chave, { a: 2, lista: [1, "x"] }, gestor.id);
    expect(await lerConfiguracao(chave)).toEqual({ a: 2, lista: [1, "x"] });
    const [linha] = await banco
      .select()
      .from(t.configuracoes)
      .where(eq(t.configuracoes.chave, chave));
    expect(linha.atualizadoPor).toBe(gestor.id);
  });

  it("o armazenamento experimental começa desligado e só liga com ativo: true", async () => {
    const banco = await obterBanco();
    await banco
      .delete(t.configuracoes)
      .where(eq(t.configuracoes.chave, CONFIG_ARMAZENAMENTO_EXPERIMENTAL));
    expect(await armazenamentoExperimentalAtivo()).toBe(false);
    await gravarConfiguracao(CONFIG_ARMAZENAMENTO_EXPERIMENTAL, { ativo: "sim" }, null);
    expect(await armazenamentoExperimentalAtivo()).toBe(false);
    await gravarConfiguracao(CONFIG_ARMAZENAMENTO_EXPERIMENTAL, { ativo: true }, null);
    expect(await armazenamentoExperimentalAtivo()).toBe(true);
    await gravarConfiguracao(CONFIG_ARMAZENAMENTO_EXPERIMENTAL, { ativo: false }, null);
    expect(await armazenamentoExperimentalAtivo()).toBe(false);
  });
});

describe("credencial do Google Drive", () => {
  beforeEach(async () => {
    await apagarCredencialDrive();
  });

  it("guarda o refresh token cifrado e a situação não leva o token", async () => {
    expect(await lerCredencialDrive()).toBeNull();
    await gravarCredencialDrive({
      refreshToken: "1//refresh-secreto",
      contaEmail: "drive@exemplo.com",
      escopo: "drive.file",
      usuarioId: null,
    });
    const credencial = (await lerCredencialDrive())!;
    expect(credencial.refreshTokenCifrado).not.toContain("refresh-secreto");
    expect(decifrarSegredo(credencial.refreshTokenCifrado, FINALIDADE_REFRESH_TOKEN_DRIVE)).toBe(
      "1//refresh-secreto",
    );
    expect(credencial.contaEmail).toBe("drive@exemplo.com");
    const situacao = (await situacaoDaConexaoDrive())!;
    expect(situacao).not.toHaveProperty("refreshTokenCifrado");
    expect(JSON.stringify(situacao)).not.toContain("refresh");
  });

  it("reconectar a mesma conta mantém a pasta raiz; outra conta esquece pastas e raiz", async () => {
    await gravarCredencialDrive({
      refreshToken: "a",
      contaEmail: "drive@exemplo.com",
      escopo: null,
      usuarioId: null,
    });
    await definirPastaRaizDrive("raiz-1");
    await gravarPastaDrive({ fotografoId: lia.id, eventoId: null, driveId: "pasta-lia" });
    await registrarErroDrive("falhou");

    await gravarCredencialDrive({
      refreshToken: "b",
      contaEmail: "DRIVE@exemplo.com",
      escopo: null,
      usuarioId: null,
    });
    let credencial = (await lerCredencialDrive())!;
    expect(credencial.pastaRaizId).toBe("raiz-1");
    expect(credencial.ultimoErro).toBeNull();
    expect(decifrarSegredo(credencial.refreshTokenCifrado, FINALIDADE_REFRESH_TOKEN_DRIVE)).toBe(
      "b",
    );
    expect(await pastaDrive(lia.id, null)).toBe("pasta-lia");

    await gravarCredencialDrive({
      refreshToken: "c",
      contaEmail: "outra@exemplo.com",
      escopo: null,
      usuarioId: null,
    });
    credencial = (await lerCredencialDrive())!;
    expect(credencial.pastaRaizId).toBeNull();
    expect(await pastaDrive(lia.id, null)).toBeNull();
  });

  it("grava o último erro sem segredo e o último uso; apagar desconecta", async () => {
    await gravarCredencialDrive({
      refreshToken: "x",
      contaEmail: "drive@exemplo.com",
      escopo: null,
      usuarioId: null,
    });
    await registrarErroDrive(
      new Error("Falhou em https://exemplo.com/a?sig=1 com Bearer ya29.abc e 1//refresh"),
    );
    await registrarUsoDrive();
    const credencial = (await lerCredencialDrive())!;
    expect(credencial.ultimoErro).toBe("Error: Falhou em [url] com Bearer [oculto] e [token]");
    expect(credencial.ultimoErroEm).not.toBeNull();
    expect(credencial.ultimoUsoEm).not.toBeNull();

    await gravarPastaDrive({ fotografoId: lia.id, eventoId: null, driveId: "p" });
    await apagarCredencialDrive();
    expect(await lerCredencialDrive()).toBeNull();
    expect(await pastaDrive(lia.id, null)).toBeNull();
  });

  it("a mensagem sem segredo é curta", () => {
    expect(mensagemSemSegredo("a".repeat(1000))).toHaveLength(300);
    expect(mensagemSemSegredo(42)).toBe("Erro desconhecido");
  });

  it("só aceita uma linha de credencial", async () => {
    const banco = await obterBanco();
    await expect(
      banco.insert(t.credenciaisGoogleDrive).values({ chave: "segunda", refreshTokenCifrado: "x" }),
    ).rejects.toThrow();
  });
});

describe("cache das pastas no Drive", () => {
  beforeEach(async () => {
    const banco = await obterBanco();
    await banco.delete(t.pastasDrive);
  });

  it("guarda uma pasta por fotógrafo (evento nulo) e por evento; na corrida, vale a primeira", async () => {
    expect(await pastaDrive(lia.id, null)).toBeNull();
    expect(await gravarPastaDrive({ fotografoId: lia.id, eventoId: null, driveId: "f-1" })).toBe(
      "f-1",
    );
    // Segunda gravação da mesma pasta (outra requisição criou outra no Drive): vale a primeira.
    expect(await gravarPastaDrive({ fotografoId: lia.id, eventoId: null, driveId: "f-2" })).toBe(
      "f-1",
    );
    expect(
      await gravarPastaDrive({ fotografoId: lia.id, eventoId: evento.id, driveId: "e-1" }),
    ).toBe("e-1");
    expect(
      await gravarPastaDrive({ fotografoId: lia.id, eventoId: evento.id, driveId: "e-2" }),
    ).toBe("e-1");
    expect(await pastaDrive(lia.id, null)).toBe("f-1");
    expect(await pastaDrive(lia.id, evento.id)).toBe("e-1");

    await esquecerPastaDrive(lia.id, evento.id);
    expect(await pastaDrive(lia.id, evento.id)).toBeNull();
    expect(await pastaDrive(lia.id, null)).toBe("f-1");
  });
});

describe("evento e métricas", () => {
  it("define onde gravar os originais do evento", async () => {
    const banco = await obterBanco();
    const ler = async () =>
      (
        await banco
          .select({ a: t.eventos.armazenamentoOriginais })
          .from(t.eventos)
          .where(eq(t.eventos.id, evento.id))
      )[0].a;
    expect(await ler()).toBe("r2");
    expect(await definirArmazenamentoDoEvento(evento.id, "hibrido")).toBe(true);
    expect(await ler()).toBe("hibrido");
    expect(await definirArmazenamentoDoEvento(evento.id, "r2")).toBe(true);
    expect(await ler()).toBe("r2");
    expect(await definirArmazenamentoDoEvento(randomUUID(), "hibrido")).toBe(false);
  });

  it("resume fotos prontas, falhas e médias de 7 dias por provedor", async () => {
    const banco = await obterBanco();
    await banco.delete(t.metricasArmazenamento);
    const antes = await resumoMetricasArmazenamento();
    expect(antes.falhas7dPorProvedor).toEqual({ r2: 0, drive: 0 });
    expect(antes.mediaUploadMs7d).toEqual({ r2: null, drive: null });
    expect(antes.prontasPorProvedor.r2).toBeGreaterThan(0);

    // Uma foto pronta no Drive.
    await banco.insert(t.fotos).values({
      eventoId: evento.id,
      enviadaPor: lia.id,
      chaveOriginal: `originais/${lia.id}/${evento.id}/${randomUUID()}.jpg`,
      provedorOriginal: "drive",
      driveArquivoId: "arquivo-1",
      urlPrevia: "previas/x.webp",
      urlMiniatura: "miniaturas/x.webp",
      nomeArquivo: "x.jpg",
      largura: 10,
      altura: 10,
      ordem: 9999,
      status: "pronta",
    });

    const metrica = (dados: Partial<Parameters<typeof registrarMetricaArmazenamento>[0]>) =>
      registrarMetricaArmazenamento({
        provedor: "drive",
        operacao: "upload_original",
        duracaoMs: 100,
        sucesso: true,
        ...dados,
      });
    await metrica({ duracaoMs: 100 });
    await metrica({ duracaoMs: 300 });
    await metrica({ provedor: "r2", duracaoMs: 50 });
    await metrica({ operacao: "download_original", duracaoMs: 80 });
    await metrica({ operacao: "download_original", duracaoMs: 9999, sucesso: false, erro: "x" });
    await metrica({ sucesso: false, erro: "y" });
    await metrica({ provedor: "r2", sucesso: false, erro: "z" });
    // Falha antiga (mais de 7 dias): fora do resumo.
    await banco.insert(t.metricasArmazenamento).values({
      provedor: "drive",
      operacao: "upload_original",
      duracaoMs: 1,
      sucesso: false,
      criadoEm: new Date(Date.now() - 8 * 86_400_000),
    });

    const resumo = await resumoMetricasArmazenamento();
    expect(resumo.prontasPorProvedor).toEqual({
      r2: antes.prontasPorProvedor.r2,
      drive: antes.prontasPorProvedor.drive + 1,
    });
    expect(resumo.falhas7dPorProvedor).toEqual({ r2: 1, drive: 2 });
    expect(resumo.mediaUploadMs7d).toEqual({ r2: 50, drive: 200 });
    expect(resumo.mediaDownloadMs7d).toEqual({ r2: null, drive: 80 });
  });
});
