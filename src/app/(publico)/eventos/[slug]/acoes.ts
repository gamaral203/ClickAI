"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  buscarEventoPublicado,
  conferirSenhaDoEvento,
  fotosPorNumero,
  registrarAcessoAoEvento,
  type Foto,
} from "@/dados";
import {
  cookieDoEvento,
  DURACAO_ACESSO_EVENTO_MS,
  hashDoToken,
  novoTokenDeAcesso,
} from "@/lib/acesso-evento";
import { limiteDoIpAtingido } from "@/servicos/limites";
import { ofertaDePacote, type OfertaPacote } from "@/servicos/pacotes";

const slug = z
  .string()
  .max(120)
  .regex(/^[a-z0-9-]+$/);

const numero = z.object({
  slug,
  numero: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/),
});

export type ResultadoBusca = {
  fotos: Foto[];
  pacote: OfertaPacote | null;
  /** Muitas buscas seguidas deste IP neste evento (src/servicos/limites.ts, busca_numero_ip). */
  limitado?: boolean;
};

/**
 * Fotos do evento com o número de peito informado, e a oferta do pacote para elas. Mesma
 * regra de visibilidade da busca por selfie.
 */
export async function buscarPorNumero(
  slugEvento: string,
  numeroDePeito: string,
): Promise<ResultadoBusca> {
  const nada = { fotos: [], pacote: null };
  const dados = numero.safeParse({ slug: slugEvento, numero: numeroDePeito });
  if (!dados.success) return nada;
  if (await limiteDoIpAtingido("busca_numero_ip", dados.data.slug)) {
    return { ...nada, limitado: true };
  }
  const evento = await buscarEventoPublicado(dados.data.slug);
  if (!evento) return nada;
  const fotos = await fotosPorNumero(evento.id, dados.data.numero);
  return { fotos, pacote: await ofertaDePacote(evento, fotos) };
}

// ---------------------------------------------------------------- Senha do evento

const senhaEvento = z.object({
  slug,
  senha: z.string().min(1, "Digite a senha.").max(50, "Senha incorreta."),
});

export type EstadoSenhaEvento = { erro: string | null };

/**
 * Confere a senha do evento e, se estiver certa, libera a galeria neste navegador com um
 * cookie HttpOnly. Ao gravar o cookie, o Next renderiza a página de novo já com as fotos.
 */
export async function entrarNoEvento(
  _anterior: EstadoSenhaEvento,
  formulario: FormData,
): Promise<EstadoSenhaEvento> {
  const dados = senhaEvento.safeParse({
    slug: formulario.get("slug"),
    senha: formulario.get("senha"),
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? "Senha incorreta." };
  }

  // 8 tentativas por IP e evento em 15 minutos, contadas no banco (contra força bruta).
  if (await limiteDoIpAtingido("senha_evento_ip", dados.data.slug)) {
    return { erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo." };
  }

  const evento = await buscarEventoPublicado(dados.data.slug);
  // Evento inexistente e senha errada dão a mesma resposta.
  const confere = evento ? await conferirSenhaDoEvento(evento.id, dados.data.senha) : false;
  if (!evento || !confere) return { erro: "Senha incorreta. Confira com quem organizou o evento." };

  const token = novoTokenDeAcesso();
  const expiraEm = Date.now() + DURACAO_ACESSO_EVENTO_MS;
  await registrarAcessoAoEvento(hashDoToken(token), evento.id, expiraEm);
  (await cookies()).set(cookieDoEvento(evento.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiraEm),
  });
  return { erro: null };
}
