import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
// A renovação do access token e o cliente do Drive são trocados pelo teste (nada sai para o Google).
const drive = vi.hoisted(() => ({
  renovar: vi.fn<(refreshToken: string) => Promise<{ accessToken: string; expiraEm: Date }>>(),
  cliente: null as unknown,
  obterToken: null as null | ((opcoes?: { renovar?: boolean }) => Promise<string>),
}));
vi.mock("@/lib/google-drive", async (original) => ({
  ...(await original<typeof import("@/lib/google-drive")>()),
  renovarAccessToken: (refreshToken: string) => drive.renovar(refreshToken),
  criarClienteDrive: (obter: (opcoes?: { renovar?: boolean }) => Promise<string>) => {
    drive.obterToken = obter;
    return drive.cliente;
  },
}));

import {
  apagarCredencialDrive,
  gravarCredencialDrive,
  lerCredencialDrive,
  pastaDrive,
} from "@/dados/configuracoes";
import { eventos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { type ClienteDrive, ErroDrive } from "@/lib/google-drive";
import { reiniciarClienteR2 } from "@/lib/r2";

import { criarProvedorDrive, nomeNoDrive } from "./drive";
import {
  ERRO_DRIVE_NAO_CONECTADO,
  medir,
  provedorDeOriginais,
  referenciaDaFoto,
  reiniciarArmazenamento,
} from "./index";
import { provedorR2 } from "./r2";

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};

// ---------------------------------------------------------------- S3 falso, em memória

const objetos = new Map<string, { corpo: Buffer; tipo?: string }>();
const nome = (bucket?: string, chave?: string) => `${bucket}/${chave}`;

function naoEncontrado() {
  return Object.assign(new Error("NotFound"), {
    name: "NotFound",
    $metadata: { httpStatusCode: 404 },
  });
}

function fluxoDe(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controle) {
      controle.enqueue(bytes);
      controle.close();
    },
  });
}

async function lerFluxo(corpo: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(corpo).arrayBuffer());
}

beforeAll(() => {
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof PutObjectCommand) {
      const { Bucket, Key, Body, ContentType } = comando.input;
      objetos.set(nome(Bucket, Key), { corpo: Buffer.from(Body as Buffer), tipo: ContentType });
      return {};
    }
    if (comando instanceof HeadObjectCommand) {
      const objeto = objetos.get(nome(comando.input.Bucket, comando.input.Key));
      if (!objeto) throw naoEncontrado();
      return { ContentLength: objeto.corpo.length };
    }
    if (comando instanceof GetObjectCommand) {
      const objeto = objetos.get(nome(comando.input.Bucket, comando.input.Key));
      if (!objeto) throw naoEncontrado();
      const faixa = /^bytes=(\d+)-(\d*)$/.exec(comando.input.Range ?? "");
      const total = objeto.corpo.length;
      const inicio = faixa ? Number(faixa[1]) : 0;
      const fim = faixa && faixa[2] ? Number(faixa[2]) : total - 1;
      const corpo = objeto.corpo.subarray(inicio, fim + 1);
      return {
        ContentLength: corpo.length,
        ...(faixa ? { ContentRange: `bytes ${inicio}-${fim}/${total}` } : {}),
        Body: {
          transformToByteArray: async () => new Uint8Array(corpo),
          transformToWebStream: () => fluxoDe(new Uint8Array(corpo)),
        },
      };
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
  reiniciarArmazenamento();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------- Drive falso, em memória

type DriveFalso = ClienteDrive & {
  arquivos: Map<string, { nome: string; pastaId: string; conteudo: Buffer; tipo: string }>;
  pastas: Map<string, { nome: string; paiId: string | null }>;
  chamadasGarantirPasta: number;
  /** Faz o próximo envio devolver um tamanho errado. */
  tamanhoErrado: boolean;
  apagados: string[];
};

function criarDriveFalso(): DriveFalso {
  let proximo = 0;
  const novoId = (prefixo: string) => `${prefixo}-${++proximo}`;
  const falso: DriveFalso = {
    arquivos: new Map(),
    pastas: new Map(),
    chamadasGarantirPasta: 0,
    tamanhoErrado: false,
    apagados: [],
    async garantirPasta(nomePasta, paiId) {
      falso.chamadasGarantirPasta++;
      for (const [id, p] of falso.pastas) {
        if (p.nome === nomePasta && p.paiId === paiId) return id;
      }
      const id = novoId("pasta");
      falso.pastas.set(id, { nome: nomePasta, paiId });
      return id;
    },
    async enviarArquivo({ nome: nomeArquivo, pastaId, conteudo, tipo }) {
      if (!falso.pastas.has(pastaId)) {
        throw new ErroDrive("nao_encontrado", "Pasta não encontrada", 404);
      }
      const id = novoId("arquivo");
      falso.arquivos.set(id, { nome: nomeArquivo, pastaId, conteudo: Buffer.from(conteudo), tipo });
      const tamanho = falso.tamanhoErrado ? conteudo.length - 1 : conteudo.length;
      falso.tamanhoErrado = false;
      return { id, tamanho, md5: null };
    },
    async baixarArquivo(id, range) {
      const arquivo = falso.arquivos.get(id);
      if (!arquivo) throw new ErroDrive("nao_encontrado", "Arquivo não encontrado", 404);
      const total = arquivo.conteudo.length;
      if (!range) {
        return { corpo: fluxoDe(arquivo.conteudo), tamanho: total, status: 200 };
      }
      const fim = range.fim ?? total - 1;
      const trecho = arquivo.conteudo.subarray(range.inicio, fim + 1);
      return {
        corpo: fluxoDe(trecho),
        tamanho: trecho.length,
        status: 206,
        contentRange: `bytes ${range.inicio}-${fim}/${total}`,
      };
    },
    async lerArquivo(id) {
      const arquivo = falso.arquivos.get(id);
      if (!arquivo) throw new ErroDrive("nao_encontrado", "Arquivo não encontrado", 404);
      return Buffer.from(arquivo.conteudo);
    },
    async metadados(id) {
      const arquivo = falso.arquivos.get(id);
      if (!arquivo) return null;
      return {
        id,
        nome: arquivo.nome,
        tamanho: arquivo.conteudo.length,
        md5: null,
        tipo: arquivo.tipo,
        lixeira: false,
      };
    },
    async apagarArquivo(id) {
      falso.apagados.push(id);
      falso.arquivos.delete(id);
    },
    async espacoUsado() {
      return { usadoBytes: 0, limiteBytes: null, usadoNoDriveBytes: 0, email: null };
    },
  };
  return falso;
}

const evento = eventos[0];
const chaveDe = (fotoId: string, ext = "jpg") =>
  `originais/${evento.fotografoId}/${evento.id}/${fotoId}.${ext}`;
const conteudo = (n = 1000) => Buffer.from(Array.from({ length: n }, (_, i) => i % 251));

// ---------------------------------------------------------------- R2

describe("adaptador do R2", () => {
  it("grava no bucket de originais, lê, lê um trecho, mede, abre fluxo e remove", async () => {
    const fotoId = randomUUID();
    const chave = chaveDe(fotoId);
    const bytes = conteudo();
    const ref = await provedorR2.gravarOriginal({
      chave,
      conteudo: bytes,
      tipo: "image/jpeg",
      fotografoId: evento.fotografoId,
      eventoId: evento.id,
      fotoId,
    });
    expect(ref).toEqual({ provedor: "r2", chave, driveArquivoId: null });
    expect(objetos.get(`fotos-originais/${chave}`)?.tipo).toBe("image/jpeg");

    expect((await provedorR2.lerOriginal(ref)).equals(bytes)).toBe(true);
    // `fim` exclusivo: bytes 10 a 19.
    expect((await provedorR2.lerTrecho(ref, 10, 20)).equals(bytes.subarray(10, 20))).toBe(true);
    expect(await provedorR2.tamanhoDoOriginal(ref)).toBe(bytes.length);

    const inteiro = await provedorR2.abrirFluxo(ref);
    expect(inteiro?.status).toBe(200);
    expect((await lerFluxo(inteiro!.corpo)).equals(bytes)).toBe(true);
    // Range inclusive, como no cabeçalho HTTP.
    const parcial = await provedorR2.abrirFluxo(ref, { inicio: 100, fim: 199 });
    expect(parcial).toMatchObject({
      status: 206,
      tamanho: 100,
      contentRange: `bytes 100-199/${bytes.length}`,
    });
    expect((await lerFluxo(parcial!.corpo)).equals(bytes.subarray(100, 200))).toBe(true);

    await provedorR2.removerOriginal(ref);
    expect(await provedorR2.tamanhoDoOriginal(ref)).toBeNull();
    expect(await provedorR2.abrirFluxo(ref)).toBeNull();
  });

  it("entrega o original por URL assinada de 15 minutos", async () => {
    const ref = { provedor: "r2" as const, chave: chaveDe(randomUUID()) };
    const entrega = await provedorR2.entregaParaDownload(ref, "foto.jpg", "image/jpeg");
    expect(entrega.tipo).toBe("url");
    const url = new URL((entrega as { url: string }).url);
    expect(url.pathname).toContain(ref.chave);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("response-content-disposition")).toContain("foto.jpg");
  });

  it("recusa chave fora de originais/ e referência de outro provedor", async () => {
    await expect(
      provedorR2.gravarOriginal({
        chave: `envios/${evento.fotografoId}/${evento.id}/x.jpg`,
        conteudo: conteudo(),
        tipo: "image/jpeg",
        fotografoId: evento.fotografoId,
        eventoId: evento.id,
        fotoId: "x",
      }),
    ).rejects.toThrow("Chave fora dos originais");
    await expect(
      provedorR2.lerOriginal({ provedor: "drive", chave: chaveDe(randomUUID()) }),
    ).rejects.toThrow("outro provedor");
  });

  it("provedorDeOriginais('r2') só com as variáveis do R2", async () => {
    expect((await provedorDeOriginais("r2")).nome).toBe("r2");
    vi.stubEnv("R2_URL_PUBLICA", "");
    await expect(provedorDeOriginais("r2")).rejects.toThrow("não configurado");
  });
});

// ---------------------------------------------------------------- Drive

describe("adaptador do Drive", () => {
  beforeEach(async () => {
    const banco = await obterBanco();
    await banco.delete(t.pastasDrive);
  });

  it("grava criando as pastas e cacheando os ids em pastas_drive", async () => {
    const cliente = criarDriveFalso();
    const raiz = await cliente.garantirPasta("ClicouAI_Storage", null);
    const provedor = criarProvedorDrive({ cliente, pastaRaizId: raiz });

    const fotoId = randomUUID();
    const bytes = conteudo();
    const ref = await provedor.gravarOriginal({
      chave: chaveDe(fotoId, "png"),
      conteudo: bytes,
      tipo: "image/png",
      fotografoId: evento.fotografoId,
      eventoId: evento.id,
      fotoId,
    });
    expect(ref.provedor).toBe("drive");
    expect(ref.chave).toBe(chaveDe(fotoId, "png"));
    const arquivo = cliente.arquivos.get(ref.driveArquivoId!)!;
    expect(arquivo.nome).toBe(`${fotoId}.png`);
    expect(arquivo.tipo).toBe("image/png");

    // ClicouAI_Storage/{fotografo}/{evento}
    const pastaEvento = cliente.pastas.get(arquivo.pastaId)!;
    expect(pastaEvento.nome).toBe(evento.id);
    const pastaFotografo = cliente.pastas.get(pastaEvento.paiId!)!;
    expect(pastaFotografo).toEqual({ nome: evento.fotografoId, paiId: raiz });
    expect(await pastaDrive(evento.fotografoId, null)).toBe(pastaEvento.paiId);
    expect(await pastaDrive(evento.fotografoId, evento.id)).toBe(arquivo.pastaId);

    // A segunda foto usa o cache: nenhuma ida a mais ao garantirPasta.
    const chamadas = cliente.chamadasGarantirPasta;
    const outra = randomUUID();
    await provedor.gravarOriginal({
      chave: chaveDe(outra),
      conteudo: conteudo(10),
      tipo: "image/jpeg",
      fotografoId: evento.fotografoId,
      eventoId: evento.id,
      fotoId: outra,
    });
    expect(cliente.chamadasGarantirPasta).toBe(chamadas);
  });

  it("refaz as pastas do cache que sumiram do Drive", async () => {
    const cliente = criarDriveFalso();
    const raiz = await cliente.garantirPasta("ClicouAI_Storage", null);
    const provedor = criarProvedorDrive({ cliente, pastaRaizId: raiz });
    const banco = await obterBanco();
    await banco.insert(t.pastasDrive).values([
      { fotografoId: evento.fotografoId, eventoId: null, driveId: "apagada-1" },
      { fotografoId: evento.fotografoId, eventoId: evento.id, driveId: "apagada-2" },
    ]);
    const fotoId = randomUUID();
    const ref = await provedor.gravarOriginal({
      chave: chaveDe(fotoId),
      conteudo: conteudo(),
      tipo: "image/jpeg",
      fotografoId: evento.fotografoId,
      eventoId: evento.id,
      fotoId,
    });
    expect(cliente.arquivos.has(ref.driveArquivoId!)).toBe(true);
    expect(await pastaDrive(evento.fotografoId, evento.id)).not.toBe("apagada-2");
  });

  it("confere o tamanho gravado: diferente, apaga e falha", async () => {
    const cliente = criarDriveFalso();
    const provedor = criarProvedorDrive({
      cliente,
      pastaRaizId: await cliente.garantirPasta("ClicouAI_Storage", null),
    });
    cliente.tamanhoErrado = true;
    const fotoId = randomUUID();
    await expect(
      provedor.gravarOriginal({
        chave: chaveDe(fotoId),
        conteudo: conteudo(),
        tipo: "image/jpeg",
        fotografoId: evento.fotografoId,
        eventoId: evento.id,
        fotoId,
      }),
    ).rejects.toThrow("diferente do enviado");
    expect(cliente.apagados).toHaveLength(1);
    expect(cliente.arquivos.size).toBe(0);
  });

  it("lê, lê um trecho, mede, abre fluxo, remove e entrega por fluxo (nunca URL)", async () => {
    const cliente = criarDriveFalso();
    const provedor = criarProvedorDrive({
      cliente,
      pastaRaizId: await cliente.garantirPasta("ClicouAI_Storage", null),
    });
    const fotoId = randomUUID();
    const bytes = conteudo(5000);
    const ref = await provedor.gravarOriginal({
      chave: chaveDe(fotoId),
      conteudo: bytes,
      tipo: "image/jpeg",
      fotografoId: evento.fotografoId,
      eventoId: evento.id,
      fotoId,
    });

    expect((await provedor.lerOriginal(ref)).equals(bytes)).toBe(true);
    // `fim` exclusivo no provedor, como no R2.
    expect((await provedor.lerTrecho(ref, 100, 200)).equals(bytes.subarray(100, 200))).toBe(true);
    expect((await provedor.lerTrecho(ref, 5, 5)).length).toBe(0);
    expect(await provedor.tamanhoDoOriginal(ref)).toBe(5000);

    const parcial = await provedor.abrirFluxo(ref, { inicio: 100, fim: 199 });
    expect(parcial).toMatchObject({
      status: 206,
      tamanho: 100,
      contentRange: "bytes 100-199/5000",
    });
    expect((await lerFluxo(parcial!.corpo)).equals(bytes.subarray(100, 200))).toBe(true);
    const inteiro = await provedor.abrirFluxo(ref);
    expect((await lerFluxo(inteiro!.corpo)).equals(bytes)).toBe(true);

    expect(await provedor.entregaParaDownload(ref, "foto.jpg", "image/jpeg")).toEqual({
      tipo: "fluxo",
    });

    await provedor.removerOriginal(ref);
    expect(await provedor.tamanhoDoOriginal(ref)).toBeNull();
    expect(await provedor.abrirFluxo(ref)).toBeNull();
  });

  it("exige o id do arquivo e a chave lógica da própria foto", async () => {
    const cliente = criarDriveFalso();
    const provedor = criarProvedorDrive({ cliente, pastaRaizId: "raiz" });
    await expect(
      provedor.lerOriginal({ provedor: "drive", chave: chaveDe(randomUUID()) }),
    ).rejects.toThrow("sem o id");
    await expect(
      provedor.lerOriginal({ provedor: "r2", chave: chaveDe(randomUUID()), driveArquivoId: "x" }),
    ).rejects.toThrow("outro provedor");
    const fotoId = randomUUID();
    expect(nomeNoDrive(chaveDe(fotoId, "JPG"), fotoId)).toBe(`${fotoId}.jpg`);
    expect(() => nomeNoDrive(`envios/a/b/${fotoId}.jpg`, fotoId)).toThrow("fora dos originais");
    expect(() => nomeNoDrive(chaveDe(fotoId), randomUUID())).toThrow("não é desta foto");
  });
});

// ---------------------------------------------------------------- provedorDeOriginais("drive")

describe("provedorDeOriginais('drive')", () => {
  beforeEach(async () => {
    await apagarCredencialDrive();
    drive.renovar.mockReset();
    drive.cliente = criarDriveFalso();
    drive.obterToken = null;
  });

  it("sem conta conectada, recusa", async () => {
    await expect(provedorDeOriginais("drive")).rejects.toThrow(ERRO_DRIVE_NAO_CONECTADO);
  });

  it("cria a pasta raiz uma vez e guarda o id", async () => {
    await gravarCredencialDrive({
      refreshToken: "1//refresh-de-teste",
      contaEmail: "drive@exemplo.com",
      escopo: "drive.file",
      usuarioId: null,
    });
    const provedor = await provedorDeOriginais("drive");
    expect(provedor.nome).toBe("drive");
    const raiz = (await lerCredencialDrive())!.pastaRaizId;
    expect(raiz).toBeTruthy();
    expect((drive.cliente as DriveFalso).pastas.get(raiz!)).toEqual({
      nome: "ClicouAI_Storage",
      paiId: null,
    });
    await provedorDeOriginais("drive");
    expect((drive.cliente as DriveFalso).chamadasGarantirPasta).toBe(1);
  });

  it("guarda o access token até 1 minuto antes de vencer e renova quando o cliente pede", async () => {
    await gravarCredencialDrive({
      refreshToken: "1//refresh-de-teste",
      contaEmail: "drive@exemplo.com",
      escopo: null,
      usuarioId: null,
    });
    let n = 0;
    drive.renovar.mockImplementation(async (refreshToken) => {
      expect(refreshToken).toBe("1//refresh-de-teste");
      n++;
      return { accessToken: `token-${n}`, expiraEm: new Date(Date.now() + 3600_000) };
    });
    await provedorDeOriginais("drive");
    const obter = drive.obterToken!;
    expect(await obter()).toBe("token-1");
    expect(await obter()).toBe("token-1");
    // Duas renovações ao mesmo tempo viram uma.
    const [a, b] = await Promise.all([obter({ renovar: true }), obter({ renovar: true })]);
    expect([a, b]).toEqual(["token-2", "token-2"]);
    expect(await obter()).toBe("token-2");
    expect(drive.renovar).toHaveBeenCalledTimes(2);

    // Vencendo em menos de 1 minuto: renova.
    drive.renovar.mockImplementationOnce(async () => ({
      accessToken: "quase-vencido",
      expiraEm: new Date(Date.now() + 30_000),
    }));
    expect(await obter({ renovar: true })).toBe("quase-vencido");
    expect(await obter()).toBe("token-3");
  });

  it("token inválido grava o último erro (sem segredo) e relança", async () => {
    await gravarCredencialDrive({
      refreshToken: "1//refresh-de-teste",
      contaEmail: "drive@exemplo.com",
      escopo: null,
      usuarioId: null,
    });
    const falso = drive.cliente as DriveFalso;
    // A pasta raiz já existe: o provedor sai sem chamar o Drive.
    const banco = await obterBanco();
    await banco.update(t.credenciaisGoogleDrive).set({ pastaRaizId: "raiz" });
    drive.renovar.mockRejectedValue(
      new ErroDrive("token_invalido", "Autorização do Google Drive inválida ou revogada", 400),
    );
    falso.lerArquivo = async () => {
      await drive.obterToken!();
      return Buffer.alloc(0);
    };
    const provedor = await provedorDeOriginais("drive");
    await expect(
      provedor.lerOriginal({
        provedor: "drive",
        chave: chaveDe(randomUUID()),
        driveArquivoId: "a",
      }),
    ).rejects.toMatchObject({ codigo: "token_invalido" });
    const credencial = await lerCredencialDrive();
    expect(credencial?.ultimoErro).toContain("inválida ou revogada");
    expect(credencial?.ultimoErro).not.toContain("refresh-de-teste");
    expect(credencial?.ultimoErroEm).not.toBeNull();
  });
});

// ---------------------------------------------------------------- referenciaDaFoto e medir

describe("referência e medição", () => {
  it("monta a referência a partir das colunas da foto", () => {
    expect(
      referenciaDaFoto({
        chaveOriginal: "originais/a/b/c.jpg",
        provedorOriginal: "r2",
        driveArquivoId: null,
      }),
    ).toEqual({ provedor: "r2", chave: "originais/a/b/c.jpg", driveArquivoId: null });
    expect(
      referenciaDaFoto({
        chaveOriginal: "originais/a/b/c.jpg",
        provedorOriginal: "drive",
        driveArquivoId: "id",
      }),
    ).toEqual({ provedor: "drive", chave: "originais/a/b/c.jpg", driveArquivoId: "id" });
    expect(
      referenciaDaFoto({ chaveOriginal: null, provedorOriginal: "r2", driveArquivoId: null }),
    ).toBeNull();
  });

  it("grava a métrica no sucesso e na falha, e a métrica nunca derruba a operação", async () => {
    const banco = await obterBanco();
    const fotoId = randomUUID();
    const metricas = () =>
      banco
        .select()
        .from(t.metricasArmazenamento)
        .where(eq(t.metricasArmazenamento.fotoId, fotoId))
        .orderBy(sql`${t.metricasArmazenamento.criadoEm}`);

    const resultado = await medir("drive", "upload_original", async () => Buffer.alloc(42), {
      bytes: (b) => b.length,
      fotoId,
      eventoId: evento.id,
    });
    expect(resultado.length).toBe(42);

    await expect(
      medir(
        "drive",
        "download_original",
        async () => {
          throw new ErroDrive(
            "quota",
            "Cota cheia em https://exemplo.com/?token=ya29.segredo",
            403,
          );
        },
        { fotoId },
      ),
    ).rejects.toThrow("Cota cheia");

    const linhas = await metricas();
    expect(linhas).toHaveLength(2);
    const sucesso = linhas.find((l) => l.sucesso)!;
    expect(sucesso).toMatchObject({ provedor: "drive", operacao: "upload_original", bytes: 42 });
    expect(sucesso.duracaoMs).toBeGreaterThanOrEqual(0);
    const falha = linhas.find((l) => !l.sucesso)!;
    expect(falha.operacao).toBe("download_original");
    expect(falha.erro).toContain("Cota cheia");
    expect(falha.erro).not.toContain("ya29");
    expect(falha.erro).not.toContain("exemplo.com");

    // Id de evento inválido: a métrica falha ao gravar, a operação segue.
    expect(
      await medir("r2", "leitura_original", async () => "ok", { eventoId: "nao-e-uuid" }),
    ).toBe("ok");
  });
});
