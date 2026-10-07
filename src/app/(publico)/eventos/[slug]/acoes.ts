"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";

import {
  buscarEventoPublicado,
  conferirSenhaDoEvento,
  fotosPorNumero,
  listarFotosDoEvento,
  registrarAcessoAoEvento,
  type FiltroGaleria,
  type Foto,
  type PaginaDeFotos,
} from "@/dados";
import {
  cookieDoEvento,
  DURACAO_ACESSO_EVENTO_MS,
  hashDoToken,
  novoTokenDeAcesso,
} from "@/lib/acesso-evento";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";
import { ofertaDePacote, type OfertaPacote } from "@/servicos/pacotes";
import { horaSchema } from "@/lib/validacao";

const slug = z
  .string()
  .max(120)
  .regex(/^[a-z0-9-]+$/);

const entrada = z.object({
  slug,
  cursor: z.uuid(),
  filtro: z
    .object({
      hora: horaSchema.optional(),
      naoIdentificadas: z.boolean().optional(),
      pasta: z.uuid().optional(),
    })
    .optional(),
});

/**
 * Próxima página da galeria, com os mesmos filtros da primeira. Server Actions são endpoints
 * públicos: valida a entrada e só devolve fotos de evento publicado.
 */
export async function carregarMaisFotos(
  slugEvento: string,
  cursor: string,
  filtro?: FiltroGaleria,
): Promise<PaginaDeFotos> {
  const dados = entrada.safeParse({ slug: slugEvento, cursor, filtro });
  if (!dados.success) return { fotos: [], proximoCursor: null };

  const evento = await buscarEventoPublicado(dados.data.slug);
  if (!evento) return { fotos: [], proximoCursor: null };

  return listarFotosDoEvento(evento.id, {
    cursor: dados.data.cursor,
    limite: FOTOS_POR_PAGINA,
    filtro: dados.data.filtro,
  });
}

const numero = z.object({
  slug,
  numero: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/),
});

export type ResultadoBusca = { fotos: Foto[]; pacote: OfertaPacote | null };

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
  const evento = await buscarEventoPublicado(dados.data.slug);
  if (!evento) return nada;
  const fotos = await fotosPorNumero(evento.id, dados.data.numero);
  return { fotos, pacote: await ofertaDePacote(evento, fotos) };
}

// ---------------------------------------------------------------- Senha do evento

/** Tentativas de senha por IP e evento numa janela de 15 minutos (contra força bruta). */
const LIMITE_TENTATIVAS = 8;
const JANELA_MS = 15 * 60 * 1000;
const tentativas = new Map<string, number[]>();

function limiteAtingido(chave: string) {
  const agora = Date.now();
  const recentes = (tentativas.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  tentativas.set(chave, recentes);
  return recentes.length > LIMITE_TENTATIVAS;
}

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

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limiteAtingido(`${ip}:${dados.data.slug}`)) {
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
