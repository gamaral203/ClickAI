"use server";

import { z } from "zod";

import { buscarEventoPublicado, criarDenuncia, fotoEhDoEvento, registrarMensagem } from "@/dados";
import { MOTIVOS, rotuloDoMotivo } from "@/lib/denuncias";
import { cnpjValido, somenteDigitos } from "@/lib/documentos";
import { limiteDoIpAtingido } from "@/servicos/limites";

// Denúncia de evento ou foto (docs/arquitetura.md, "Denúncia"). Formulário público: valida tudo,
// limita por IP e confirma o recebimento por e-mail ao denunciante (simulado até a Fase 13).

/** Campo vazio ou que nem veio no formulário (ex.: CNPJ, só para empresa) vira `null`. */
const opcional = (v: unknown) =>
  v === undefined || (typeof v === "string" && v.trim() === "") ? null : v;

const formulario = z.object({
  slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  fotoId: z.preprocess(opcional, z.uuid().nullable()),
  motivo: z.enum(MOTIVOS, "Escolha o motivo."),
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
  razaoSocial: z.preprocess(opcional, z.string().trim().max(150, "Até 150 caracteres.").nullable()),
  cnpj: z.preprocess(
    opcional,
    z.string().refine(cnpjValido, "CNPJ inválido.").transform(somenteDigitos).nullable(),
  ),
});

export type CampoDenuncia =
  "motivo" | "descricao" | "contatoEmail" | "contatoTelefone" | "razaoSocial" | "cnpj";
export type EstadoDenuncia = {
  protocolo?: string;
  erro?: string;
  erros?: Partial<Record<CampoDenuncia, string>>;
};

export async function enviarDenunciaAcao(
  _anterior: EstadoDenuncia,
  dados: FormData,
): Promise<EstadoDenuncia> {
  const validacao = formulario.safeParse(Object.fromEntries(dados));
  if (!validacao.success) {
    const erros: EstadoDenuncia["erros"] = {};
    for (const p of validacao.error.issues) erros[p.path[0] as CampoDenuncia] ??= p.message;
    return { erros };
  }
  const d = validacao.data;

  // 5 denúncias por IP por hora (src/servicos/limites.ts): o canal é sério, mas não pode virar
  // spam nem disparar e-mails sem fim.
  if (await limiteDoIpAtingido("denuncia_ip")) {
    return { erro: "Recebemos várias denúncias seguidas daqui. Tente de novo em uma hora." };
  }

  const evento = await buscarEventoPublicado(d.slug);
  if (!evento) return { erro: "Não encontramos este evento. Confira o link." };
  if (d.fotoId && !(await fotoEhDoEvento(d.fotoId, evento.id))) {
    return { erro: "Não encontramos esta foto no evento." };
  }

  const denuncia = await criarDenuncia({
    alvoTipo: d.fotoId ? "foto" : "evento",
    eventoId: evento.id,
    fotoId: d.fotoId,
    motivo: d.motivo,
    descricao: d.descricao,
    contatoEmail: d.contatoEmail.trim().toLowerCase(),
    contatoTelefone: d.contatoTelefone,
    razaoSocial: d.razaoSocial,
    cnpj: d.cnpj,
  });
  const protocolo = denuncia.id.slice(0, 8).toUpperCase();
  await registrarMensagem({
    pedidoId: null,
    canal: "email",
    tipo: "denuncia",
    para: denuncia.contatoEmail,
    assunto: `Recebemos sua denúncia (protocolo ${protocolo})`,
    texto:
      `Recebemos sua denúncia sobre ${d.fotoId ? "uma foto do evento" : "o evento"} "${evento.titulo}" ` +
      `(motivo: ${rotuloDoMotivo(d.motivo)}). Nossa equipe vai analisar e responder neste e-mail.`,
  });
  return { protocolo };
}
