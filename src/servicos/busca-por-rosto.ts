import "server-only";

import { z } from "zod";

import {
  contarUso,
  eventosDaBuscaPorRosto,
  fotosDaBuscaPorRosto,
  rostosDeExemploDoEvento,
  type EventoDaBusca,
  type FotoDaBusca,
  type Usuario,
} from "@/dados";
import { CONTADOR } from "@/lib/painel-de-uso";
import { BuscaFacialDesligada, buscarFotosPorSelfie } from "@/lib/reconhecimento";

import { limiteAtingido } from "./limites";
import { contaDoPainel } from "./sessao";

// Busca por rosto no painel do fotógrafo (/painel/busca-por-rosto; docs/arquitetura.md, "Busca
// por rosto no painel"). O fotógrafo envia a foto de uma pessoa e acha, entre as fotos dos
// eventos dele (os que criou e os que colabora com convite aceito), aquelas em que ela aparece.
//
// Regra inviolável (docs/CLAUDE.md): a imagem enviada vai só ao provedor de reconhecimento,
// durante esta requisição, pelo mesmo caminho da busca pública (`buscarFotosPorSelfie`). Nada
// aqui a grava (banco, R2, cache) nem a escreve em log; o Sentry descarta o corpo das
// requisições (src/lib/sentry.ts). Quem chama zera os bytes no fim.
//
// Conferido no servidor: sessão com conta de fotógrafo (o gestor só pela própria conta), escopo
// (o evento pedido precisa estar na lista dos permitidos: sem IDOR) e o limite por usuário
// `busca_rosto_usuario`. Cada coleção consultada soma um no contador anônimo do Painel de uso.

/** "Meus eventos recentes": cada evento é uma chamada ao provedor, por isso o teto. */
export const BUSCA_ROSTO_MAX_EVENTOS = 10;
/** Semelhança (0–100) a partir da qual a tela diz "alta"; abaixo, "média". */
export const SEMELHANCA_ALTA = 97;
/** Coleções consultadas ao mesmo tempo. */
const EM_PARALELO = 3;

export type Escopo = { tipo: "evento"; eventoId: string } | { tipo: "recentes" };

export const escopoDaBusca = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("evento"), eventoId: z.uuid() }),
  z.object({ tipo: z.literal("recentes") }),
]);

export type FotoEncontrada = FotoDaBusca & { semelhanca: "alta" | "media" };

export type GrupoDaBusca = {
  evento: EventoDaBusca;
  /** Fotos do próprio fotógrafo (com "Baixar original" e o link público). */
  minhas: FotoEncontrada[];
  /** Fotos de outros autores já públicas: só a prévia com marca d'água, sem download. */
  deOutros: FotoEncontrada[];
};

export type ResultadoBuscaPorRosto =
  | { ok: true; grupos: GrupoDaBusca[]; eventosConsultados: number }
  | {
      ok: false;
      motivo: "nao_encontrado" | "escopo" | "limite" | "desligada" | "falha";
    };

/** Eventos em que o usuário pode buscar (`null` sem conta de fotógrafo). */
export async function eventosPermitidos(usuario: Usuario | null) {
  if (!usuario) return null;
  const conta = await contaDoPainel(usuario);
  if (!conta) return null;
  return { conta, eventos: await eventosDaBuscaPorRosto(conta.id) };
}

function nivel(semelhanca: number | undefined): "alta" | "media" {
  // Sem número (dados de exemplo), o provedor já filtrou pela semelhança mínima: conta como alta.
  return semelhanca === undefined || semelhanca >= SEMELHANCA_ALTA ? "alta" : "media";
}

/**
 * Busca a pessoa da `imagem` nas fotos do escopo. A imagem já chega conferida (tipo e tamanho)
 * pela rota; aqui ela só é repassada ao provedor.
 */
export async function buscarPorRostoNoPainel(
  usuario: Usuario | null,
  escopo: Escopo,
  imagem: Uint8Array,
  instante: number = Date.now(),
): Promise<ResultadoBuscaPorRosto> {
  const permitidos = await eventosPermitidos(usuario);
  if (!permitidos || !usuario) return { ok: false, motivo: "nao_encontrado" };
  const { conta, eventos } = permitidos;

  let alvo: EventoDaBusca[];
  if (escopo.tipo === "evento") {
    const evento = eventos.find((e) => e.id === escopo.eventoId);
    // Evento de outro fotógrafo, convite não aceito ou id inventado: recusa sem dizer qual.
    if (!evento) return { ok: false, motivo: "escopo" };
    alvo = [evento];
  } else {
    alvo = eventos.slice(0, BUSCA_ROSTO_MAX_EVENTOS);
  }

  if (await limiteAtingido("busca_rosto_usuario", usuario.id)) {
    return { ok: false, motivo: "limite" };
  }
  if (alvo.length === 0) return { ok: true, grupos: [], eventosConsultados: 0 };

  const grupos: GrupoDaBusca[] = [];
  try {
    for (let i = 0; i < alvo.length; i += EM_PARALELO) {
      const parte = alvo.slice(i, i + EM_PARALELO);
      const achados = await Promise.all(
        parte.map(async (evento) => {
          const { fotoIds, semelhancas } = await buscarFotosPorSelfie(evento.id, imagem, () =>
            rostosDeExemploDoEvento(evento.id),
          );
          const fotos = await fotosDaBuscaPorRosto(conta.id, evento.id, fotoIds, instante);
          return { evento, fotos, semelhancas };
        }),
      );
      for (const { evento, fotos, semelhancas } of achados) {
        if (fotos.length === 0) continue;
        const comNivel = fotos.map((f) => ({ ...f, semelhanca: nivel(semelhancas[f.id]) }));
        grupos.push({
          evento,
          minhas: comNivel.filter((f) => f.propria),
          deOutros: comNivel.filter((f) => !f.propria),
        });
      }
    }
  } catch (erro) {
    if (erro instanceof BuscaFacialDesligada) return { ok: false, motivo: "desligada" };
    // Só o nome do erro: o erro inteiro pode carregar a requisição ao provedor (com a imagem).
    console.error(
      "[busca-por-rosto] falha na busca:",
      erro instanceof Error ? erro.name : "desconhecido",
    );
    return { ok: false, motivo: "falha" };
  } finally {
    // Contador anônimo do Painel de uso: só quantas coleções foram consultadas hoje.
    await contarUso(CONTADOR.buscaRostoPainel, alvo.length);
  }
  return { ok: true, grupos, eventosConsultados: alvo.length };
}
