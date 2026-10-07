// Funções de dados do painel do fotógrafo. Toda função recebe o id do fotógrafo logado e só
// mexe no que é dele: a checagem fica aqui (como um WHERE fotografo_id = … no banco), e não
// só na tela.

import "server-only";

import { connection } from "next/server";

import {
  categorias,
  colaboradores,
  eventos,
  fotografos,
  fotos,
  senhasEventos,
} from "./exemplo/banco";
import imagens from "./exemplo/imagens.json";
import { itensPorPedido, lancamentos, pedidos, saques } from "./exemplo/pedidos";
import type {
  Categoria,
  Evento,
  Foto,
  Lancamento,
  Saque,
  StatusEvento,
  StatusSaque,
} from "./tipos";

/** Evento como o painel lista: com contagens e sem a senha. */
export type EventoDoPainel = Evento & {
  categoria: Categoria;
  temSenha: boolean;
  totalItens: number;
  processando: number;
  vendidos: number;
};

function itensDoEvento(eventoId: string) {
  return fotos.filter((f) => f.eventoId === eventoId && f.excluidaEm === null);
}

function idsVendidos() {
  const vendidos = new Set<string>();
  for (const [pedidoId, itens] of itensPorPedido) {
    if (pedidos.get(pedidoId)?.status !== "pago") continue;
    for (const item of itens) vendidos.add(item.fotoId);
  }
  return vendidos;
}

function paraPainel(evento: Evento, vendidos: Set<string>): EventoDoPainel {
  const categoria = categorias.find((c) => c.id === evento.categoriaId);
  if (!categoria) throw new Error(`Categoria ${evento.categoriaId} não existe`);
  const itens = itensDoEvento(evento.id);
  return {
    ...structuredClone(evento),
    categoria,
    temSenha: senhasEventos.has(evento.id),
    totalItens: itens.filter((f) => f.status === "pronta").length,
    processando: itens.filter((f) => f.status === "processando").length,
    vendidos: itens.filter((f) => vendidos.has(f.id)).length,
  };
}

export async function listarCategorias(): Promise<Categoria[]> {
  return structuredClone(categorias);
}

/** Eventos de que o fotógrafo é dono, do mais recente para o mais antigo. */
export async function listarEventosDoFotografo(fotografoId: string): Promise<EventoDoPainel[]> {
  const vendidos = idsVendidos();
  return eventos
    .filter((e) => e.fotografoId === fotografoId)
    .sort((a, b) => b.inicioEm.localeCompare(a.inicioEm))
    .map((e) => paraPainel(e, vendidos));
}

/** Evento do fotógrafo, ou `null` se não existir ou for de outra pessoa. */
export async function buscarEventoDoFotografo(
  eventoId: string,
  fotografoId: string,
): Promise<EventoDoPainel | null> {
  const evento = eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
  return evento ? paraPainel(evento, idsVendidos()) : null;
}

export async function slugDeEventoEmUso(slug: string, excetoId?: string) {
  return eventos.some((e) => e.slug === slug && e.id !== excetoId);
}

export type DadosDoEvento = Omit<Evento, "id" | "fotografoId" | "status" | "capa">;

export async function criarEvento(fotografoId: string, dados: DadosDoEvento): Promise<Evento> {
  const evento: Evento = {
    ...dados,
    id: crypto.randomUUID(),
    fotografoId,
    capa: null,
    status: "rascunho",
  };
  eventos.push(evento);
  return structuredClone(evento);
}

/** Atualiza um evento do fotógrafo. Devolve `null` se o evento não for dele. */
export async function atualizarEvento(
  eventoId: string,
  fotografoId: string,
  dados: Partial<DadosDoEvento>,
): Promise<Evento | null> {
  const evento = eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
  if (!evento) return null;
  Object.assign(evento, dados);
  return structuredClone(evento);
}

/** Guarda (ou apaga, com `null`) o hash da senha de um evento do fotógrafo. */
export async function definirSenhaDoEvento(
  eventoId: string,
  fotografoId: string,
  senhaHash: string | null,
) {
  const evento = eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
  if (!evento) return false;
  if (senhaHash) senhasEventos.set(eventoId, senhaHash);
  else senhasEventos.delete(eventoId);
  return true;
}

/**
 * Muda o status de um evento do fotógrafo, só a partir do status esperado (como um UPDATE com
 * WHERE status = …). O status `revisao` não entra nem sai por aqui: só a equipe mexe nele.
 */
export async function mudarStatusDoEvento(
  eventoId: string,
  fotografoId: string,
  de: Exclude<StatusEvento, "revisao">,
  para: Exclude<StatusEvento, "revisao">,
): Promise<boolean> {
  const evento = eventos.find(
    (e) => e.id === eventoId && e.fotografoId === fotografoId && e.status === de,
  );
  if (!evento) return false;
  evento.status = para;
  return true;
}

// ---------------------------------------------------------------- Fotos do evento

/** Itens do evento para o painel: todos os status, sem os excluídos, na ordem de envio. */
export async function listarItensDoPainel(eventoId: string, fotografoId: string) {
  const evento = eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
  if (!evento) return null;
  const vendidos = idsVendidos();
  return itensDoEvento(eventoId)
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => ({ ...structuredClone(f), vendido: vendidos.has(f.id) }));
}

/**
 * Envio simulado (Parte A): cria os itens com as imagens de exemplo, já prontos. Na Fase 12, o
 * envio real cria cada item como `processando` e o job gera a prévia a partir do arquivo.
 * Envia o dono do evento ou um colaborador dele; o item fica no nome de quem enviou, que é
 * quem recebe pela venda.
 */
export async function adicionarItensSimulados(
  eventoId: string,
  fotografoId: string,
  arquivos: { nome: string; tamanhoBytes: number }[],
): Promise<Foto[] | null> {
  const evento = eventos.find((e) => e.id === eventoId);
  const podeEnviar =
    evento?.fotografoId === fotografoId ||
    colaboradores.some((c) => c.eventoId === eventoId && c.fotografoId === fotografoId);
  if (!evento || !podeEnviar) return null;
  const ultimaOrdem = Math.max(
    0,
    ...fotos.filter((f) => f.eventoId === eventoId).map((f) => f.ordem),
  );
  const agora = Date.now();
  const novos: Foto[] = arquivos.map((arquivo, i) => {
    const imagem = (ultimaOrdem + i) % imagens.length;
    const { largura, altura } = imagens[imagem];
    return {
      id: crypto.randomUUID(),
      eventoId,
      pastaId: null,
      enviadaPor: fotografoId,
      tipo: "foto",
      urlPrevia: `/exemplo/previas/${imagem}.webp`,
      urlMiniatura: `/exemplo/miniaturas/${imagem}.webp`,
      nomeArquivo: arquivo.nome,
      largura,
      altura,
      duracaoS: null,
      capturadaEm: null,
      precoCentavos: null,
      ordem: ultimaOrdem + i + 1,
      status: "pronta",
      criadoEm: new Date(agora + i).toISOString(),
      excluidaEm: null,
    };
  });
  fotos.push(...novos);
  return structuredClone(novos);
}

/**
 * Exclusão lógica (docs/arquitetura.md): o item some da galeria, mas quem comprou continua
 * baixando. Só em evento do próprio fotógrafo.
 */
export async function excluirItem(fotoId: string, fotografoId: string): Promise<boolean> {
  const foto = fotos.find((f) => f.id === fotoId && f.excluidaEm === null);
  const evento =
    foto && eventos.find((e) => e.id === foto.eventoId && e.fotografoId === fotografoId);
  if (!foto || !evento) return false;
  foto.excluidaEm = new Date().toISOString();
  return true;
}

// ---------------------------------------------------------------- Dinheiro do fotógrafo

export type LancamentoDoExtrato = Lancamento & {
  eventoTitulo: string;
  pagoEm: string | null;
  /** O que o cliente pagou pelo item, já com desconto (transparência no extrato). */
  valorPagoCentavos: number;
  /** "autor": a foto é do fotógrafo; "dono": a parte dele como dono do evento de um colaborador. */
  papel: "autor" | "dono";
};

/**
 * Lançamentos do fotógrafo com o evento e a data da venda, do mais recente para o mais
 * antigo. O cálculo de saldo e de saque fica em src/servicos/saques.ts.
 */
export async function listarLancamentosDoFotografo(
  fotografoId: string,
): Promise<LancamentoDoExtrato[]> {
  // Hora lida depois pelo chamador; espera a requisição (Cache Components).
  await connection();
  return lancamentos
    .filter((l) => l.fotografoId === fotografoId)
    .map((l) => {
      let eventoTitulo = "";
      let pagoEm: string | null = null;
      let valorPagoCentavos = 0;
      let papel: LancamentoDoExtrato["papel"] = "autor";
      for (const [pedidoId, itens] of itensPorPedido) {
        const item = itens.find((i) => i.id === l.itemPedidoId);
        if (!item) continue;
        const foto = fotos.find((f) => f.id === item.fotoId);
        eventoTitulo = eventos.find((e) => e.id === foto?.eventoId)?.titulo ?? "";
        pagoEm = pedidos.get(pedidoId)?.pagoEm ?? null;
        valorPagoCentavos = item.precoCentavos - item.descontoCentavos;
        papel = item.fotografoId === fotografoId ? "autor" : "dono";
      }
      return { ...structuredClone(l), eventoTitulo, pagoEm, valorPagoCentavos, papel };
    })
    .sort((a, b) => (b.pagoEm ?? "").localeCompare(a.pagoEm ?? ""));
}

/** Fotógrafo tem chave Pix confirmada? Condição para publicar evento e sacar (docs/riscos.md). */
export async function temContaDeRecebimento(fotografoId: string) {
  return Boolean(fotografos.find((f) => f.id === fotografoId)?.chavePix);
}

// ---------------------------------------------------------------- Saques

/**
 * Cria o saque e prende nele os lançamentos, tudo ou nada: se algum lançamento já estiver em
 * outro saque (dois cliques ao mesmo tempo), nada muda. No banco, é uma transação com
 * `SELECT … FOR UPDATE` nos lançamentos.
 */
export async function reservarLancamentosParaSaque(saque: Saque, lancamentoIds: string[]) {
  const alvo = lancamentos.filter((l) => lancamentoIds.includes(l.id));
  const livres =
    alvo.length === lancamentoIds.length &&
    alvo.every((l) => l.fotografoId === saque.fotografoId && l.saqueId === null);
  if (!livres) return false;
  for (const l of alvo) l.saqueId = saque.id;
  saques.push(structuredClone(saque));
  return true;
}

/** Muda o status do saque só a partir do status esperado. Devolve se mudou. */
export async function mudarStatusSaque(
  saqueId: string,
  de: StatusSaque,
  para: StatusSaque,
  extra: Partial<Pick<Saque, "gatewayId" | "pagoEm">> = {},
): Promise<boolean> {
  const saque = saques.find((s) => s.id === saqueId);
  if (!saque || saque.status !== de) return false;
  Object.assign(saque, extra, { status: para });
  return true;
}

/** Saque que falhou devolve os lançamentos ao saldo, para o fotógrafo tentar de novo. */
export async function soltarLancamentosDoSaque(saqueId: string) {
  for (const l of lancamentos) if (l.saqueId === saqueId) l.saqueId = null;
}

export async function listarSaquesDoFotografo(fotografoId: string): Promise<Saque[]> {
  return structuredClone(
    saques
      .filter((s) => s.fotografoId === fotografoId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
  );
}

/** Saques ainda em processamento, para conferir o status no Mercado Pago. */
export async function listarSaquesProcessando(fotografoId: string): Promise<Saque[]> {
  return structuredClone(
    saques.filter((s) => s.fotografoId === fotografoId && s.status === "processando"),
  );
}
