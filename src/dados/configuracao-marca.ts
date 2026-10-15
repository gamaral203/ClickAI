// Configuração global das prévias (src/lib/protecao-previas.ts; docs/arquitetura.md, "Prévia e
// marca d'água"). Uma linha por gravação em `configuracoes_marca`, com a revisão seguinte: a de
// maior revisão vale, e as anteriores ficam como histórico de quem mudou o quê.
//
// Sem cache: é lida uma vez por foto processada (uma consulta pela chave primária) e pela tela
// do gestor. Assim uma mudança vale para a próxima foto em qualquer instância.

import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import {
  CONFIG_MARCA_INICIAL,
  normalizarConfigMarca,
  type ConfigMarca,
  type ConfigMarcaVigente,
} from "@/lib/protecao-previas";

import { iso } from "./mapas";

export type ConfigMarcaEmVigor = ConfigMarcaVigente & {
  /** Um gestor confirmou regerar as prévias já enviadas com esta revisão. */
  regeracaoPedida: boolean;
};

/** A configuração em vigor (a de maior revisão), ou os padrões se nenhum gestor salvou ainda. */
export async function configuracaoDaMarca(): Promise<ConfigMarcaEmVigor> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.configuracoesMarca)
    .orderBy(desc(t.configuracoesMarca.revisao))
    .limit(1);
  if (!linha) return { ...CONFIG_MARCA_INICIAL, regeracaoPedida: false };
  return {
    ...normalizarConfigMarca(linha),
    revisao: linha.revisao,
    regeracaoPedida: linha.regeracaoPedidaEm !== null,
  };
}

export type RevisaoDaMarca = ConfigMarca & {
  revisao: number;
  /** Quando foi salva (ISO). */
  em: string;
  /** Nome de quem salvou, se a conta ainda existir. */
  por: string | null;
  /** Quando pediram a regeração das prévias com ela (ISO), e quem. */
  regeracaoPedidaEm: string | null;
  regeracaoPedidaPor: string | null;
};

/** As últimas revisões, da mais nova para a mais antiga (histórico na tela do gestor). */
export async function historicoDaMarca(limite = 10): Promise<RevisaoDaMarca[]> {
  const banco = await obterBanco();
  const quemPediu = alias(t.usuarios, "quem_pediu");
  const linhas = await banco
    .select({
      linha: t.configuracoesMarca,
      por: t.usuarios.nome,
      pedidaPor: quemPediu.nome,
    })
    .from(t.configuracoesMarca)
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.configuracoesMarca.criadaPor))
    .leftJoin(quemPediu, eq(quemPediu.id, t.configuracoesMarca.regeracaoPedidaPor))
    .orderBy(desc(t.configuracoesMarca.revisao))
    .limit(limite);
  return linhas.map(({ linha, por, pedidaPor }) => ({
    ...normalizarConfigMarca(linha),
    revisao: linha.revisao,
    em: iso(linha.criadaEm),
    por: por ?? null,
    regeracaoPedidaEm: linha.regeracaoPedidaEm ? iso(linha.regeracaoPedidaEm) : null,
    regeracaoPedidaPor: pedidaPor ?? null,
  }));
}

/**
 * Grava uma revisão nova (a seguinte à maior) com a configuração já validada, em nome do gestor.
 * Dois gestores salvando ao mesmo tempo: a chave primária barra a segunda revisão igual, e quem
 * perdeu tenta com a próxima. Devolve a revisão gravada.
 */
export async function salvarConfiguracaoDaMarca(
  config: ConfigMarca,
  gestorId: string,
): Promise<number> {
  const banco = await obterBanco();
  for (let tentativa = 0; ; tentativa++) {
    const [{ proxima }] = await banco
      .select({ proxima: sql<number>`coalesce(max(${t.configuracoesMarca.revisao}), 0) + 1` })
      .from(t.configuracoesMarca);
    const gravadas = await banco
      .insert(t.configuracoesMarca)
      .values({ ...config, revisao: Number(proxima), criadaPor: gestorId })
      .onConflictDoNothing()
      .returning({ revisao: t.configuracoesMarca.revisao });
    if (gravadas[0]) return gravadas[0].revisao;
    if (tentativa >= 4) throw new Error("Não foi possível gravar a configuração da marca");
  }
}

/**
 * Marca o pedido de regeração das prévias já enviadas com a revisão `revisao`, se ela ainda for a
 * em vigor (o gestor confirmou vendo a estimativa desta revisão; se outro salvou uma nova no
 * meio, nada é marcado). Repetir o pedido não muda nada. `true` se a revisão está pedida.
 */
export async function pedirRegeracaoDasPrevias(revisao: number, gestorId: string) {
  const banco = await obterBanco();
  const atual = await configuracaoDaMarca();
  if (atual.revisao !== revisao) return false;
  if (revisao === 0) {
    // Ainda nos padrões: grava a revisão 0 com eles, para o pedido ter onde ficar (sem mudar a
    // revisão, que está nas chaves das prévias já geradas com os padrões).
    await banco
      .insert(t.configuracoesMarca)
      .values({ ...normalizarConfigMarca(atual), revisao: 0, criadaPor: gestorId })
      .onConflictDoNothing();
  }
  await banco
    .update(t.configuracoesMarca)
    .set({ regeracaoPedidaEm: new Date(), regeracaoPedidaPor: gestorId })
    .where(
      sql`${t.configuracoesMarca.revisao} = ${revisao} and ${t.configuracoesMarca.regeracaoPedidaEm} is null`,
    );
  return (await configuracaoDaMarca()).revisao === revisao;
}
