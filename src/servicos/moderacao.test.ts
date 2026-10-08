import { describe, expect, it } from "vitest";

import { buscarDenuncia, criarDenuncia, listarMensagens } from "@/dados";
import { and, eq, isNull } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { iniciarAnalise, marcarImprocedente, marcarProcedente } from "./moderacao";

const GESTOR = "05e70000-0000-4000-8000-000000000005";

async function eventoPorSlug(slug: string) {
  const banco = await obterBanco();
  const [evento] = await banco.select().from(t.eventos).where(eq(t.eventos.slug, slug));
  if (!evento) throw new Error(slug);
  return evento;
}

async function statusDoEvento(id: string) {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ status: t.eventos.status })
    .from(t.eventos)
    .where(eq(t.eventos.id, id));
  return evento.status;
}

async function denunciar(eventoId: string, fotoId: string | null = null) {
  return criarDenuncia({
    alvoTipo: fotoId ? "foto" : "evento",
    eventoId,
    fotoId,
    motivo: "privacidade",
    descricao: "Apareço nesta foto e quero que ela seja removida, por favor.",
    contatoEmail: `${crypto.randomUUID()}@exemplo.com`,
    contatoTelefone: null,
    razaoSocial: null,
    cnpj: null,
  });
}

const paraQuem = async (texto: string) =>
  (await listarMensagens(1000)).filter((m) => m.tipo === "denuncia" && m.texto.includes(texto));

describe("moderação de denúncias", () => {
  it("evento: tira do ar na análise e volta ao ar se for improcedente", async () => {
    const evento = await eventoPorSlug("copa-futsal-sub17-2026");
    const denuncia = await denunciar(evento.id);

    expect(await iniciarAnalise(denuncia.id, GESTOR, true)).toEqual({ ok: true });
    expect(await statusDoEvento(evento.id)).toBe("revisao");

    expect(await marcarImprocedente(denuncia.id, GESTOR)).toEqual({ ok: true });
    expect(await statusDoEvento(evento.id)).toBe("publicado");
    expect((await buscarDenuncia(denuncia.id))?.status).toBe("improcedente");
    expect(await paraQuem("no ar de novo")).not.toHaveLength(0);
  });

  it("evento procedente fica em revisão e avisa denunciante e dono", async () => {
    const evento = await eventoPorSlug("formatura-medicina-ufmg-2026");
    const denuncia = await denunciar(evento.id);

    expect(await marcarProcedente(denuncia.id, GESTOR)).toEqual({ ok: true });
    expect(await statusDoEvento(evento.id)).toBe("revisao");
    const avisos = (await listarMensagens(1000)).filter(
      (m) => m.tipo === "denuncia" && m.texto.includes(evento.titulo),
    );
    expect(avisos.map((m) => m.para)).toEqual(
      expect.arrayContaining([denuncia.contatoEmail, "pedro@exemplo.com"]),
    );
  });

  it("foto procedente sai da galeria; o evento continua no ar", async () => {
    const evento = await eventoPorSlug("meia-maratona-rio-2026");
    const banco = await obterBanco();
    const [foto] = await banco
      .select({ id: t.fotos.id })
      .from(t.fotos)
      .where(and(eq(t.fotos.eventoId, evento.id), isNull(t.fotos.excluidaEm)))
      .limit(1);
    const denuncia = await denunciar(evento.id, foto.id);

    expect(await marcarProcedente(denuncia.id, GESTOR)).toEqual({ ok: true });
    const [depois] = await banco
      .select({ excluidaEm: t.fotos.excluidaEm })
      .from(t.fotos)
      .where(eq(t.fotos.id, foto.id));
    expect(depois.excluidaEm).not.toBeNull();
    expect(await statusDoEvento(evento.id)).toBe("publicado");
  });

  it("não decide duas vezes a mesma denúncia", async () => {
    const evento = await eventoPorSlug("corrida-ibirapuera-10k-2026");
    const denuncia = await denunciar(evento.id);
    expect(await marcarImprocedente(denuncia.id, GESTOR)).toEqual({ ok: true });
    expect(await marcarProcedente(denuncia.id, GESTOR)).toMatchObject({ ok: false });
    expect(await statusDoEvento(evento.id)).toBe("publicado");
  });
});
