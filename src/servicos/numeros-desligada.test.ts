import { DetectTextCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// As Server Actions pedem o fotógrafo logado e redirecionam ao criar; aqui nada disso existe.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const sessao = vi.hoisted(() => ({ fotografoId: "" }));
vi.mock("@/servicos/sessao", () => ({
  exigirFotografo: async () => ({ conta: { id: sessao.fotografoId } }),
}));

import { duplicarEventoAcao, salvarEventoAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import {
  adicionarItensSimulados,
  fotosPendentesDeNumeros,
  leituraDeNumerosLigada,
  listarCategorias,
} from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { CATEGORIAS_COM_NUMERO, lerNumerosAoSalvar } from "@/lib/numeros-de-peito";

import { lerNumerosDaFoto } from "./numeros";

const lia = fotografos[0];
const ibirapuera = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
const formatura = eventos.find((e) => e.slug === "formatura-medicina-ufmg-2026")!;
let contador = 0;

async function categoriaDe(slug: string) {
  const categoria = (await listarCategorias()).find((c) => c.slug === slug);
  if (!categoria) throw new Error(`Categoria ${slug} não existe`);
  return categoria.id;
}

function formulario(categoriaId: string, extras: Record<string, string> = {}) {
  const dados = new FormData();
  const campos: Record<string, string> = {
    titulo: `Corrida de teste ${++contador}`,
    categoriaId,
    inicioEm: "2027-03-07T08:00",
    local: "Parque",
    cidade: "São Paulo",
    estado: "SP",
    precoFoto: "19,90",
    precoVideo: "39,90",
    visibilidade: "publico",
    liberacao: "automatica",
    ordenacao: "captura",
    ...extras,
  };
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

/** Cria pelo caminho do painel e devolve o id tirado do redirecionamento. */
async function criarPeloPainel(dados: FormData) {
  const erro = await salvarEventoAcao({}, dados).then(
    (r) => new Error(`Não redirecionou: ${JSON.stringify(r)}`),
    (e: Error) => e,
  );
  const id = /REDIRECT:\/painel\/eventos\/([0-9a-f-]{36})/.exec(erro.message)?.[1];
  if (!id) throw erro;
  return id;
}

async function gravarLeitura(eventoId: string, valor: boolean) {
  const banco = await obterBanco();
  await banco.update(t.eventos).set({ lerNumeros: valor }).where(eq(t.eventos.id, eventoId));
}

beforeEach(() => {
  sessao.fotografoId = lia.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("evento novo", () => {
  it.each(CATEGORIAS_COM_NUMERO)("na categoria %s, nasce com a leitura desligada", async (slug) => {
    const id = await criarPeloPainel(formulario(await categoriaDe(slug)));
    expect(await leituraDeNumerosLigada(id)).toBe(false);
  });

  it("ignora o valor que vier do navegador", async () => {
    const dados = formulario(await categoriaDe("corrida"), { lerNumeros: "on" });
    const id = await criarPeloPainel(dados);
    expect(await leituraDeNumerosLigada(id)).toBe(false);
  });

  it("a cópia de um evento com a leitura ligada também nasce desligada", async () => {
    await gravarLeitura(ibirapuera.id, true);
    const erro = await duplicarEventoAcao(ibirapuera.id).catch((e: Error) => e);
    const id = /REDIRECT:\/painel\/eventos\/([0-9a-f-]{36})/.exec((erro as Error).message)![1];
    expect(await leituraDeNumerosLigada(id)).toBe(false);
  });
});

describe("evento que já existe", () => {
  const editar = async (eventoId: string, extras: Record<string, string> = {}) => {
    const dados = formulario(await categoriaDe("corrida"), { eventoId, ...extras });
    return salvarEventoAcao({}, dados);
  };

  it("salvar sem o campo preserva a leitura ligada", async () => {
    await gravarLeitura(ibirapuera.id, true);
    expect(await editar(ibirapuera.id)).toEqual({ ok: true });
    expect(await leituraDeNumerosLigada(ibirapuera.id)).toBe(true);
  });

  it("salvar não liga a leitura de quem estava desligado, nem com o campo no pedido", async () => {
    await gravarLeitura(formatura.id, false);
    const pedro = fotografos.find((f) => f.id === formatura.fotografoId)!;
    sessao.fotografoId = pedro.id;
    expect(await editar(formatura.id, { lerNumeros: "on" })).toEqual({ ok: true });
    expect(await leituraDeNumerosLigada(formatura.id)).toBe(false);
  });
});

describe("processamento de foto de evento novo", () => {
  it("não chama a leitura no envio nem no job de revisão", async () => {
    for (const [chave, valor] of Object.entries({
      REKOGNITION_REGIAO: "sa-east-1",
      REKOGNITION_ACCESS_KEY_ID: "AKIA_TESTE",
      REKOGNITION_SECRET_ACCESS_KEY: "segredo-teste",
    })) {
      vi.stubEnv(chave, valor);
    }
    const chamada = vi
      .spyOn(RekognitionClient.prototype, "send")
      .mockImplementation((async (comando: unknown) => {
        if (comando instanceof DetectTextCommand) return { TextDetections: [] };
        throw new Error("Comando inesperado");
      }) as never);
    const imagem = vi.fn(async () => new Uint8Array([1]));

    const id = await criarPeloPainel(formulario(await categoriaDe("corrida")));
    const [foto] = (await adicionarItensSimulados(id, lia.id, [
      { nome: "peito.jpg", tamanhoBytes: 10 },
    ]))!;

    expect(await lerNumerosDaFoto(id, foto.id, imagem)).toBe("desligada");
    expect(imagem).not.toHaveBeenCalled();
    expect(chamada).not.toHaveBeenCalled();

    const pendentes = await fotosPendentesDeNumeros(new Date(Date.now() + 60_000), 5000);
    expect(pendentes.some((f) => f.eventoId === id)).toBe(false);
  });
});

describe("lerNumerosAoSalvar", () => {
  it("desligado: novo é falso e o que existe fica de fora do UPDATE", () => {
    expect(lerNumerosAoSalvar(false, true, false)).toBe(false);
    expect(lerNumerosAoSalvar(true, true, false)).toBeUndefined();
    expect(lerNumerosAoSalvar(true, false, false)).toBeUndefined();
  });

  it("religado, volta a valer o que o fotógrafo escolheu", () => {
    expect(lerNumerosAoSalvar(false, true, true)).toBe(true);
    expect(lerNumerosAoSalvar(true, false, true)).toBe(false);
  });
});
