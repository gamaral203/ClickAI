// Recursos de venda no painel do fotógrafo: desconto progressivo, pacote, cupons, preço
// individual e colaboradores. Como em ./painel.ts, toda função recebe o id do fotógrafo logado
// e só mexe no que é dele (no banco, um WHERE fotografo_id = …).

import "server-only";

import {
  colaboradores,
  cupons,
  eventos,
  faixasDesconto,
  fotografos,
  fotos,
  pacotes,
} from "./exemplo/banco";
import { usuarios } from "./exemplo/usuarios";
import type { Colaborador, Cupom, Evento, FaixaDesconto, Pacote } from "./tipos";

function eventoDoDono(eventoId: string, fotografoId: string): Evento | undefined {
  return eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
}

// ---------------------------------------------------------------- Desconto progressivo

export type FaixaNova = Pick<FaixaDesconto, "quantidadeMin" | "descontoPct">;

/**
 * Faixas do fotógrafo: as de um evento dele, ou a regra padrão (`eventoId` nulo). Em ordem de
 * quantidade.
 */
export async function listarFaixas(
  fotografoId: string,
  eventoId: string | null,
): Promise<FaixaDesconto[] | null> {
  if (eventoId && !eventoDoDono(eventoId, fotografoId)) return null;
  return structuredClone(
    faixasDesconto
      .filter((f) => f.fotografoId === fotografoId && f.eventoId === eventoId)
      .sort((a, b) => a.quantidadeMin - b.quantidadeMin),
  );
}

/**
 * Troca todas as faixas (do evento ou a regra padrão) pelas novas. Lista vazia apaga: no
 * evento, ele volta a usar a regra padrão.
 */
export async function salvarFaixas(
  fotografoId: string,
  eventoId: string | null,
  novas: FaixaNova[],
): Promise<boolean> {
  if (eventoId && !eventoDoDono(eventoId, fotografoId)) return false;
  for (let i = faixasDesconto.length - 1; i >= 0; i--) {
    const f = faixasDesconto[i];
    if (f.fotografoId === fotografoId && f.eventoId === eventoId) faixasDesconto.splice(i, 1);
  }
  faixasDesconto.push(
    ...novas.map((f) => ({ id: crypto.randomUUID(), fotografoId, eventoId, ...f })),
  );
  return true;
}

// ---------------------------------------------------------------- Pacote

export type DadosPacote = Omit<Pacote, "id" | "eventoId">;

export async function buscarPacoteDoEvento(
  eventoId: string,
  fotografoId: string,
): Promise<Pacote | null> {
  if (!eventoDoDono(eventoId, fotografoId)) return null;
  const pacote = pacotes.find((p) => p.eventoId === eventoId);
  return pacote ? structuredClone(pacote) : null;
}

/** Cria ou atualiza o pacote do evento (um por evento). */
export async function salvarPacote(
  eventoId: string,
  fotografoId: string,
  dados: DadosPacote,
): Promise<boolean> {
  if (!eventoDoDono(eventoId, fotografoId)) return false;
  const existente = pacotes.find((p) => p.eventoId === eventoId);
  if (existente) Object.assign(existente, dados);
  else pacotes.push({ id: crypto.randomUUID(), eventoId, ...dados });
  return true;
}

// ---------------------------------------------------------------- Cupons

export type DadosCupom = Omit<Cupom, "id" | "fotografoId" | "usos">;

export async function listarCuponsDoFotografo(fotografoId: string): Promise<Cupom[]> {
  return structuredClone(
    cupons
      .filter((c) => c.fotografoId === fotografoId)
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  );
}

/**
 * O código já é de outro cupom? Códigos são únicos na plataforma inteira: o comprador digita
 * só o código, sem dizer de qual fotógrafo é.
 */
export async function codigoDeCupomEmUso(codigo: string, excetoId?: string) {
  const alvo = codigo.toUpperCase();
  return cupons.some((c) => c.codigo.toUpperCase() === alvo && c.id !== excetoId);
}

/** Eventos do fotógrafo entre os informados (para conferir os eventos de um cupom). */
export async function filtrarEventosDoFotografo(fotografoId: string, eventoIds: string[]) {
  const alvo = new Set(eventoIds);
  return eventos.filter((e) => e.fotografoId === fotografoId && alvo.has(e.id)).map((e) => e.id);
}

/** Cria (sem `cupomId`) ou atualiza um cupom do fotógrafo. Os usos já feitos não mudam. */
export async function salvarCupom(
  fotografoId: string,
  dados: DadosCupom,
  cupomId?: string,
): Promise<boolean> {
  if (!cupomId) {
    cupons.push({ id: crypto.randomUUID(), fotografoId, usos: 0, ...dados });
    return true;
  }
  const cupom = cupons.find((c) => c.id === cupomId && c.fotografoId === fotografoId);
  if (!cupom) return false;
  Object.assign(cupom, dados);
  return true;
}

// ---------------------------------------------------------------- Preço individual

/**
 * Preço próprio de um item do evento do fotógrafo; `null` volta ao preço do evento. Vale para
 * as próximas vendas: o pedido guarda o preço do momento da compra.
 */
export async function definirPrecoDoItem(
  fotoId: string,
  fotografoId: string,
  precoCentavos: number | null,
): Promise<boolean> {
  const foto = fotos.find((f) => f.id === fotoId && f.excluidaEm === null);
  if (!foto || !eventoDoDono(foto.eventoId, fotografoId)) return false;
  foto.precoCentavos = precoCentavos;
  return true;
}

// ---------------------------------------------------------------- Colaboradores

export type ColaboradorDoPainel = Colaborador & { nomePublico: string; totalItens: number };

export async function listarColaboradores(
  eventoId: string,
  fotografoId: string,
): Promise<ColaboradorDoPainel[] | null> {
  if (!eventoDoDono(eventoId, fotografoId)) return null;
  return colaboradores
    .filter((c) => c.eventoId === eventoId)
    .map((c) => ({
      ...structuredClone(c),
      nomePublico: fotografos.find((f) => f.id === c.fotografoId)?.nomePublico ?? "",
      totalItens: fotos.filter(
        (f) => f.eventoId === eventoId && f.enviadaPor === c.fotografoId && f.excluidaEm === null,
      ).length,
    }));
}

/**
 * Fotógrafo pelo e-mail da conta, para convidar como colaborador. Só devolve o perfil público
 * (nome e id), nunca dados da conta.
 */
export async function buscarFotografoPorEmail(
  email: string,
): Promise<{ id: string; nomePublico: string } | null> {
  const alvo = email.trim().toLowerCase();
  for (const u of usuarios.values()) {
    if (u.email !== alvo) continue;
    const conta = fotografos.find((f) => f.usuarioId === u.id);
    return conta ? { id: conta.id, nomePublico: conta.nomePublico } : null;
  }
  return null;
}

export type ResultadoColaborador = "ok" | "evento" | "ja_colabora" | "dono";

export async function adicionarColaborador(
  eventoId: string,
  donoId: string,
  dados: { fotografoId: string; comissaoDonoPct: number; nota: string | null },
): Promise<ResultadoColaborador> {
  if (!eventoDoDono(eventoId, donoId)) return "evento";
  if (dados.fotografoId === donoId) return "dono";
  if (colaboradores.some((c) => c.eventoId === eventoId && c.fotografoId === dados.fotografoId)) {
    return "ja_colabora";
  }
  colaboradores.push({ id: crypto.randomUUID(), eventoId, ...dados });
  return "ok";
}

/** Muda comissão e nota. A nova comissão vale para as próximas vendas. */
export async function atualizarColaborador(
  colaboradorId: string,
  donoId: string,
  dados: { comissaoDonoPct: number; nota: string | null },
): Promise<boolean> {
  const colaborador = colaboradores.find((c) => c.id === colaboradorId);
  if (!colaborador || !eventoDoDono(colaborador.eventoId, donoId)) return false;
  Object.assign(colaborador, dados);
  return true;
}

/**
 * Remove o colaborador, só se ele não tiver fotos no evento: a comissão do dono sobre as
 * fotos dele depende desse vínculo. Para remover, o dono exclui as fotos antes.
 */
export async function removerColaborador(
  colaboradorId: string,
  donoId: string,
): Promise<"ok" | "nao_encontrado" | "tem_fotos"> {
  const indice = colaboradores.findIndex((c) => c.id === colaboradorId);
  const colaborador = colaboradores[indice];
  if (!colaborador || !eventoDoDono(colaborador.eventoId, donoId)) return "nao_encontrado";
  const temFotos = fotos.some(
    (f) =>
      f.eventoId === colaborador.eventoId &&
      f.enviadaPor === colaborador.fotografoId &&
      f.excluidaEm === null,
  );
  if (temFotos) return "tem_fotos";
  colaboradores.splice(indice, 1);
  return "ok";
}

export type ColaboracaoDoPainel = {
  colaboradorId: string;
  evento: Pick<Evento, "id" | "titulo" | "slug" | "inicioEm" | "status">;
  donoNome: string;
  comissaoDonoPct: number;
  nota: string | null;
  meusItens: number;
};

/** Eventos de outros fotógrafos em que este fotógrafo colabora. */
export async function listarColaboracoes(fotografoId: string): Promise<ColaboracaoDoPainel[]> {
  return colaboradores
    .filter((c) => c.fotografoId === fotografoId)
    .flatMap((c) => {
      const evento = eventos.find((e) => e.id === c.eventoId);
      if (!evento) return [];
      return [
        {
          colaboradorId: c.id,
          evento: {
            id: evento.id,
            titulo: evento.titulo,
            slug: evento.slug,
            inicioEm: evento.inicioEm,
            status: evento.status,
          },
          donoNome: fotografos.find((f) => f.id === evento.fotografoId)?.nomePublico ?? "",
          comissaoDonoPct: c.comissaoDonoPct,
          nota: c.nota,
          meusItens: fotos.filter(
            (f) =>
              f.eventoId === evento.id && f.enviadaPor === fotografoId && f.excluidaEm === null,
          ).length,
        },
      ];
    })
    .sort((a, b) => b.evento.inicioEm.localeCompare(a.evento.inicioEm));
}

/** O fotógrafo pode enviar fotos a este evento: é o dono ou colaborador. */
export async function podeEnviarAoEvento(eventoId: string, fotografoId: string) {
  return (
    Boolean(eventoDoDono(eventoId, fotografoId)) ||
    colaboradores.some((c) => c.eventoId === eventoId && c.fotografoId === fotografoId)
  );
}
