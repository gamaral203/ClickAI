"use server";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import {
  buscarEventoPublicado,
  buscarFotoPublica,
  criarDenuncia,
  registrarMensagem,
  registrarTentativa,
} from "@/dados";
import { lerLinkDoConteudo } from "@/lib/denuncias";
import { somenteDigitos } from "@/lib/documentos";

// Pedido de remoção de foto pela pessoa que aparece nela (LGPD; docs/arquitetura.md, "Denúncia").
// Reaproveita a denúncia com o motivo "privacidade": cai na mesma fila de /admin/denuncias, onde
// "procedente" tira a foto da galeria. A diferença é a entrada: aqui a pessoa cola o link da foto
// ou do evento, sem precisar achar o botão na página.

/** Pedidos por IP numa janela de 1 hora, contados no banco (vale entre os servidores). */
const LIMITE = 5;
const JANELA_MS = 60 * 60 * 1000;

const opcional = (v: unknown) =>
  v === undefined || (typeof v === "string" && v.trim() === "") ? null : v;

const formulario = z.object({
  link: z.string().trim().min(1, "Cole o link da foto ou do evento.").max(500),
  descricao: z
    .string()
    .trim()
    .min(20, "Conte com um pouco mais de detalhe (pelo menos 20 caracteres).")
    .max(2000, "Até 2.000 caracteres."),
  contatoEmail: z.email("Informe um e-mail para respondermos.").max(254),
  contatoTelefone: z.preprocess(
    opcional,
    z
      .string()
      .transform((v) => somenteDigitos(v))
      .refine((v) => v.length >= 10 && v.length <= 13, "Informe o telefone com DDD.")
      .nullable(),
  ),
});

export type CampoRemocao = "link" | "descricao" | "contatoEmail" | "contatoTelefone";
export type EstadoRemocao = {
  protocolo?: string;
  erro?: string;
  erros?: Partial<Record<CampoRemocao, string>>;
};

async function limiteAtingido() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  // A chave é um HMAC: o IP não fica gravado.
  const chave = createHmac("sha256", process.env.APP_SECRET ?? "desenvolvimento")
    .update(`remocao_ip:${ip}`)
    .digest("hex");
  return (await registrarTentativa(chave, LIMITE, JANELA_MS)).bloqueado;
}

export async function pedirRemocaoAcao(
  _anterior: EstadoRemocao,
  dados: FormData,
): Promise<EstadoRemocao> {
  const validacao = formulario.safeParse(Object.fromEntries(dados));
  if (!validacao.success) {
    const erros: EstadoRemocao["erros"] = {};
    for (const p of validacao.error.issues) erros[p.path[0] as CampoRemocao] ??= p.message;
    return { erros };
  }
  const d = validacao.data;

  const alvo = lerLinkDoConteudo(d.link);
  if (!alvo) {
    return {
      erros: {
        link: "Cole o link da página da foto (…/fotos/…) ou do evento (…/eventos/…).",
      },
    };
  }

  if (await limiteAtingido()) {
    return { erro: "Recebemos vários pedidos seguidos daqui. Tente de novo em uma hora." };
  }

  let eventoId: string;
  let eventoTitulo: string;
  let fotoId: string | null = null;
  if (alvo.tipo === "foto") {
    const foto = await buscarFotoPublica(alvo.id);
    if (!foto) return { erros: { link: "Não encontramos esta foto. Confira o link." } };
    eventoId = foto.evento.id;
    eventoTitulo = foto.evento.titulo;
    fotoId = foto.foto.id;
  } else {
    const evento = await buscarEventoPublicado(alvo.slug);
    if (!evento) return { erros: { link: "Não encontramos este evento. Confira o link." } };
    eventoId = evento.id;
    eventoTitulo = evento.titulo;
  }

  const denuncia = await criarDenuncia({
    alvoTipo: fotoId ? "foto" : "evento",
    eventoId,
    fotoId,
    motivo: "privacidade",
    descricao: d.descricao,
    contatoEmail: d.contatoEmail.trim().toLowerCase(),
    contatoTelefone: d.contatoTelefone,
    razaoSocial: null,
    cnpj: null,
  });
  const protocolo = denuncia.id.slice(0, 8).toUpperCase();
  await registrarMensagem({
    pedidoId: null,
    canal: "email",
    tipo: "denuncia",
    para: denuncia.contatoEmail,
    assunto: `Recebemos seu pedido de remoção (protocolo ${protocolo})`,
    texto:
      `Recebemos seu pedido de remoção de ${fotoId ? "uma foto do evento" : "fotos do evento"} ` +
      `"${eventoTitulo}". Nossa equipe vai analisar e responder neste e-mail.`,
  });
  return { protocolo };
}
