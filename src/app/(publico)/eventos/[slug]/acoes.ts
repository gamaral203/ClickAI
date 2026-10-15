"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  autoresPorId,
  buscarEventoPublicado,
  conferirSenhaDoEvento,
  fotosPorNumero,
  listarFotosDoEvento,
  registrarAcessoAoEvento,
  type FiltroGaleria,
  type Foto,
} from "@/dados";
import {
  cookieDoEvento,
  DURACAO_ACESSO_EVENTO_MS,
  hashDoToken,
  novoTokenDeAcesso,
} from "@/lib/acesso-evento";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";
import { lerFiltroGaleria } from "@/lib/validacao";
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

// ---------------------------------------------------------------- Página vizinha (visualizador)

const pedidoDePagina = z.object({
  slug,
  pagina: z.int().min(1).max(999_999),
  filtro: z
    .object({
      hora: z.string().max(20).optional(),
      pasta: z.string().max(40).optional(),
      naoIdentificadas: z.boolean().optional(),
      tipo: z.enum(["foto", "video"]).optional(),
    })
    .strict(),
});

export type PaginaDoVisualizador = {
  fotos: Foto[];
  pagina: number;
  totalPaginas: number;
  /** Nome público de quem fez cada foto, por `enviadaPor`. */
  autores: Record<string, string>;
  limitado?: boolean;
};

/**
 * Página vizinha da galeria, para o visualizador seguir de uma página para a outra sem sair da
 * foto. É a mesma consulta paginada da página do evento (`listarFotosDoEvento`, que só lista com
 * a galeria aberta para quem visita, inclusive a senha), com o mesmo limite por IP contra a
 * raspagem das prévias (`galeria_ip`). Devolve só o que a galeria já mostra: prévias e miniaturas.
 */
export async function paginaDaGaleria(
  slugEvento: string,
  pagina: number,
  filtro: FiltroGaleria,
): Promise<PaginaDoVisualizador> {
  const nada: PaginaDoVisualizador = { fotos: [], pagina: 1, totalPaginas: 1, autores: {} };
  const dados = pedidoDePagina.safeParse({ slug: slugEvento, pagina, filtro });
  if (!dados.success) return nada;
  if (await limiteDoIpAtingido("galeria_ip")) return { ...nada, limitado: true };
  const evento = await buscarEventoPublicado(dados.data.slug);
  if (!evento) return nada;
  // Revalida o filtro pelas mesmas regras da URL da galeria.
  const f = dados.data.filtro;
  const filtroValido = lerFiltroGaleria({
    hora: f.hora,
    pasta: f.pasta,
    "nao-identificadas": f.naoIdentificadas ? "1" : undefined,
    tipo: f.tipo,
  });
  const resultado = await listarFotosDoEvento(evento.id, {
    pagina: dados.data.pagina,
    limite: FOTOS_POR_PAGINA,
    filtro: filtroValido,
  });
  const autores = await autoresPorId(resultado.fotos.map((foto) => foto.enviadaPor));
  return {
    fotos: resultado.fotos,
    pagina: resultado.pagina,
    totalPaginas: resultado.totalPaginas,
    autores: Object.fromEntries([...autores].map(([id, a]) => [id, a.nome])),
  };
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
