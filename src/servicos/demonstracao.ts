// Conta de demonstração (docs/arquitetura.md, "Conta de demonstração"): um fotógrafo com
// eventos, fotos, clientes e cerca de R$ 12 mil em vendas fictícias, para gravar vídeos e
// tutoriais no site real. Criada pelo gestor em /admin/demonstracao.
//
// O que impede o fictício de virar real:
// - `fotografos.demonstracao` bloqueia o saque (src/servicos/saques.ts);
// - `pedidos.demonstracao` tira as vendas dos rankings (e dos avisos de ranking), do gráfico e
//   dos totais da gestão e do painel de uso;
// - os eventos são não listados: fora da página inicial, das listagens, da busca e do sitemap,
//   e só abrem pelo link;
// - os clientes usam e-mails @example.com (domínio reservado, nunca recebe nada) e os pedidos
//   são gravados direto no banco: nenhum e-mail, aviso ou cobrança no Mercado Pago;
// - as fotos são as imagens de exemplo de /public/exemplo, sem original no R2.

import "server-only";

import { randomUUID } from "node:crypto";

import { inArray, sql } from "drizzle-orm";

import imagens from "@/dados/exemplo/imagens.json";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { gerarHashSenha } from "@/lib/senha";
import { gerarSlug } from "@/lib/slug";
import { acrescimoCartao, parteDoVendedorNaTaxa, taxaCartaoPct } from "@/lib/taxas";

import { PRAZO_ANTECIPACAO_MS, PRAZO_SAQUE_MS } from "./pedidos";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Faturamento alvo das vendas fictícias: "uns 12 mil", em centavos. */
const ALVO_MINIMO_CENTAVOS = 12_000_00;

const EVENTOS = [
  {
    titulo: "Corrida Noturna 10K Chapada",
    categoria: "corrida",
    local: "Praça da Matriz",
    cidade: "Jacobina",
    diasAtras: 52,
    horas: 4,
    precoFotoCentavos: 1990,
    fotos: 34,
    peso: 4,
  },
  {
    titulo: "Formatura Enfermagem 2026",
    categoria: "formatura",
    local: "Centro de Convenções",
    cidade: "Feira de Santana",
    diasAtras: 35,
    horas: 5,
    precoFotoCentavos: 2490,
    fotos: 30,
    peso: 3,
  },
  {
    titulo: "Casamento Júlia & Marcos",
    categoria: "casamentos",
    local: "Espaço Villa Verde",
    cidade: "Salvador",
    diasAtras: 19,
    horas: 6,
    precoFotoCentavos: 2990,
    fotos: 28,
    peso: 2,
  },
  {
    titulo: "Festa de São João do Arroz",
    categoria: "festas",
    local: "Largo do Arroz",
    cidade: "Miguel Calmon",
    diasAtras: 7,
    horas: 5,
    precoFotoCentavos: 1590,
    fotos: 26,
    peso: 3,
  },
] as const;

const CLIENTES = [
  "Mariana Costa",
  "Lucas Andrade",
  "Fernanda Lima",
  "Rafael Souza",
  "Juliana Rocha",
  "Thiago Martins",
  "Camila Ribeiro",
  "Bruno Carvalho",
  "Larissa Gomes",
  "Pedro Henrique Alves",
  "Beatriz Nunes",
  "Gustavo Pereira",
  "Aline Fernandes",
  "Diego Barbosa",
  "Patrícia Moreira",
  "Rodrigo Teixeira",
  "Vanessa Cardoso",
  "Felipe Araújo",
  "Natália Mendes",
  "Leonardo Dias",
  "Tatiane Freitas",
  "Marcelo Pinto",
  "Gabriela Santos",
  "André Castro",
  "Renata Oliveira",
  "Vinícius Correia",
  "Isabela Moura",
  "Caio Batista",
  "Débora Ramos",
  "Matheus Vieira",
  "Priscila Duarte",
  "Eduardo Farias",
  "Letícia Campos",
  "Henrique Lopes",
  "Carolina Melo",
  "Igor Monteiro",
] as const;

/** Gerador pseudoaleatório com semente (mulberry32): a mesma semente dá os mesmos dados. */
function sorteador(semente: number) {
  let a = semente >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1));
  return {
    proximo,
    inteiro,
    item: <T>(lista: readonly T[]) => lista[inteiro(0, lista.length - 1)],
  };
}

function emailDoCliente(nome: string) {
  return `${gerarSlug(nome).replace(/-/g, ".")}@example.com`;
}

export type ResultadoDemonstracao =
  | { erro: string }
  | {
      fotografoId: string;
      slug: string;
      eventos: number;
      fotos: number;
      pedidos: number;
      vendidoCentavos: number;
    };

/**
 * Cria a conta de demonstração com `email` e `senha` (login normal, e-mail já confirmado), os
 * eventos não listados com fotos de exemplo, os clientes e as vendas fictícias. Recusa se o
 * e-mail já tem conta. Tudo numa transação: ou entra a conta inteira, ou nada.
 */
export async function criarContaDemonstracao(dados: {
  email: string;
  senha: string;
  nome: string;
  agora?: number;
  semente?: number;
}): Promise<ResultadoDemonstracao> {
  const agora = dados.agora ?? Date.now();
  const sorte = sorteador(dados.semente ?? agora);
  const email = dados.email.trim().toLowerCase();
  const banco = await obterBanco();

  const [existente] = await banco
    .select({ id: t.usuarios.id })
    .from(t.usuarios)
    .where(sql`lower(${t.usuarios.email}) = ${email}`);
  if (existente) return { erro: "Já existe uma conta com este e-mail." };

  const categorias = await banco
    .select({ id: t.categorias.id, slug: t.categorias.slug })
    .from(t.categorias)
    .where(
      inArray(
        t.categorias.slug,
        EVENTOS.map((e) => e.categoria),
      ),
    );
  const [qualquer] = categorias.length
    ? categorias
    : await banco.select({ id: t.categorias.id, slug: t.categorias.slug }).from(t.categorias);
  if (!qualquer) return { erro: "Nenhuma categoria de evento cadastrada." };
  const categoriaDe = (slug: string) => categorias.find((c) => c.slug === slug)?.id ?? qualquer.id;

  const sufixo = randomUUID().slice(0, 6);
  const usuarioId = randomUUID();
  const fotografoId = randomUUID();
  const slugDoFotografo = `${gerarSlug(dados.nome) || "fotografo"}-${sufixo}`;

  // ---------------------------------------------------------------- Eventos e fotos
  const eventos = EVENTOS.map((e) => {
    const inicio = agora - e.diasAtras * DIA_MS - 3 * 60 * 60 * 1000;
    return {
      base: e,
      linha: {
        id: randomUUID(),
        fotografoId,
        categoriaId: categoriaDe(e.categoria),
        titulo: e.titulo,
        slug: `${gerarSlug(e.titulo)}-${sufixo}`,
        inicioEm: new Date(inicio),
        fimEm: new Date(inicio + e.horas * 60 * 60 * 1000),
        local: e.local,
        cidade: e.cidade,
        estado: "BA",
        precoFotoCentavos: e.precoFotoCentavos,
        precoVideoCentavos: 3990,
        status: "publicado" as const,
        // Só pelo link: fora da página inicial, das listagens, da busca e do sitemap.
        visibilidade: "nao_listado" as const,
        listado: false,
        liberacao: "automatica" as const,
      },
    };
  });

  let contador = 0;
  const fotos = eventos.flatMap(({ base, linha }, i) => {
    const inicio = linha.inicioEm.getTime();
    const duracao = base.horas * 60 * 60 * 1000;
    const enviadasEm = new Date(inicio + duracao + 2 * 60 * 60 * 1000);
    return Array.from({ length: base.fotos }, (_, n) => {
      contador++;
      const imagem = (n + i * 5) % imagens.length;
      return {
        id: randomUUID(),
        eventoId: linha.id,
        enviadaPor: fotografoId,
        tipo: "foto" as const,
        urlPrevia: `/exemplo/previas/${imagem}.webp`,
        urlMiniatura: `/exemplo/miniaturas/${imagem}.webp`,
        nomeArquivo: `IMG_${String(2000 + contador).padStart(4, "0")}.jpg`,
        largura: imagens[imagem].largura,
        altura: imagens[imagem].altura,
        capturadaEm: new Date(inicio + Math.round((duracao * n) / base.fotos)),
        ordem: n + 1,
        status: "pronta" as const,
        criadoEm: enviadasEm,
        liberacao: "automatica" as const,
        liberarEm: enviadasEm,
        // Sem original no R2: não há o que mandar ao reconhecimento facial.
        rostosIndexadosEm: enviadasEm,
      };
    });
  });

  // ---------------------------------------------------------------- Vendas fictícias
  const pct = taxaCartaoPct();
  const pesoTotal = EVENTOS.reduce((s, e) => s + e.peso, 0);
  const sortearEvento = () => {
    let r = sorte.proximo() * pesoTotal;
    for (const e of eventos) {
      r -= e.base.peso;
      if (r < 0) return e;
    }
    return eventos[eventos.length - 1];
  };
  // Para no primeiro pedido que passa de R$ 12 mil mais um pouco: números quebrados.
  const alvo = ALVO_MINIMO_CENTAVOS + sorte.inteiro(150_00, 800_00);
  const pedidos: (typeof t.pedidos.$inferInsert)[] = [];
  const itens: (typeof t.itensPedido.$inferInsert)[] = [];
  const lancamentos: (typeof t.lancamentos.$inferInsert)[] = [];
  let vendido = 0;
  while (vendido < alvo) {
    const { base, linha } = sortearEvento();
    const doEvento = fotos.filter((f) => f.eventoId === linha.id);
    const quantidade = Math.min(doEvento.length, sorte.item([1, 1, 2, 2, 3, 3, 4, 5, 6, 8]));
    const escolhidas = [...doEvento].sort(() => sorte.proximo() - 0.5).slice(0, quantidade);
    const nome = sorte.item(CLIENTES);
    const metodo = sorte.proximo() < 0.7 ? ("pix" as const) : ("cartao" as const);
    const fim = linha.fimEm.getTime() + 3 * 60 * 60 * 1000;
    const pagoEm = new Date(fim + sorte.proximo() * Math.max(DIA_MS, agora - fim - 60 * 60 * 1000));
    const subtotal = quantidade * base.precoFotoCentavos;
    const acrescimo = metodo === "cartao" ? acrescimoCartao(subtotal, pct) : 0;
    const pedidoId = randomUUID();
    pedidos.push({
      id: pedidoId,
      emailComprador: emailDoCliente(nome),
      nomeComprador: nome,
      subtotalCentavos: subtotal,
      descontoCentavos: 0,
      acrescimoCartaoCentavos: acrescimo,
      totalCentavos: subtotal + acrescimo,
      metodo,
      status: "pago",
      criadoEm: new Date(pagoEm.getTime() - sorte.inteiro(1, 12) * 60 * 1000),
      expiraEm: new Date(pagoEm.getTime() + 30 * 60 * 1000),
      pagoEm,
      demonstracao: true,
    });
    for (const foto of escolhidas) {
      const itemId = randomUUID();
      itens.push({
        id: itemId,
        pedidoId,
        fotoId: foto.id,
        fotografoId,
        precoCentavos: base.precoFotoCentavos,
        descontoCentavos: 0,
        valorFotografoCentavos: base.precoFotoCentavos,
        valorDonoEventoCentavos: 0,
      });
      lancamentos.push({
        fotografoId,
        itemPedidoId: itemId,
        valorCentavos:
          metodo === "cartao"
            ? base.precoFotoCentavos - parteDoVendedorNaTaxa(base.precoFotoCentavos, pct)
            : base.precoFotoCentavos,
        disponivelEm: new Date(pagoEm.getTime() + PRAZO_SAQUE_MS),
        antecipavelEm: new Date(pagoEm.getTime() + PRAZO_ANTECIPACAO_MS),
      });
    }
    vendido += subtotal;
  }

  // Visitas e carrinhos, para a aba Desempenho ter números.
  const metricas = eventos.flatMap(({ linha }) => {
    const doEvento = fotos.filter((f) => f.eventoId === linha.id);
    const inicio = linha.fimEm.getTime();
    const em = () => new Date(inicio + sorte.proximo() * Math.max(DIA_MS, agora - inicio));
    return [
      ...Array.from({ length: sorte.inteiro(140, 320) }, () => ({
        tipo: "visita_evento" as const,
        eventoId: linha.id,
        em: em(),
      })),
      ...Array.from({ length: sorte.inteiro(220, 520) }, () => ({
        tipo: "visita_foto" as const,
        eventoId: linha.id,
        fotoId: sorte.item(doEvento).id,
        em: em(),
      })),
      ...Array.from({ length: sorte.inteiro(25, 70) }, () => ({
        tipo: "carrinho" as const,
        eventoId: linha.id,
        em: em(),
      })),
    ];
  });

  const emLotes = async <T>(lista: T[], gravar: (lote: T[]) => Promise<unknown>) => {
    for (let i = 0; i < lista.length; i += 500) await gravar(lista.slice(i, i + 500));
  };

  await banco.transaction(async (tx) => {
    await tx.insert(t.usuarios).values({
      id: usuarioId,
      nome: dados.nome,
      email,
      papel: "fotografo",
      senhaHash: gerarHashSenha(dados.senha),
      emailConfirmadoEm: new Date(agora),
    });
    await tx.insert(t.fotografos).values({
      id: fotografoId,
      usuarioId,
      nomePublico: dados.nome,
      slug: slugDoFotografo,
      bio: "Fotografia de eventos, corridas e formaturas na Bahia.",
      demonstracao: true,
    });
    await tx.insert(t.eventos).values(eventos.map((e) => e.linha));
    await emLotes(fotos, (lote) => tx.insert(t.fotos).values(lote));
    await emLotes(pedidos, (lote) => tx.insert(t.pedidos).values(lote));
    await emLotes(itens, (lote) => tx.insert(t.itensPedido).values(lote));
    await emLotes(lancamentos, (lote) => tx.insert(t.lancamentos).values(lote));
    await emLotes(metricas, (lote) => tx.insert(t.metricas).values(lote));
  });

  return {
    fotografoId,
    slug: slugDoFotografo,
    eventos: eventos.length,
    fotos: fotos.length,
    pedidos: pedidos.length,
    vendidoCentavos: vendido,
  };
}
