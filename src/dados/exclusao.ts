// Exclusão de conta pelo próprio usuário (LGPD, direito à eliminação; docs/arquitetura.md,
// "Exclusão de conta"). Pedidos pagos, itens, lançamentos e saques continuam existindo, porque a
// lei fiscal manda guardar o registro das vendas e dos repasses (LGPD, art. 16, I): em vez de
// apagar essas linhas, os dados pessoais delas são trocados por marcadores. O CPF/CNPJ do
// fotógrafo fica, pelo mesmo motivo (quem recebeu cada saque).
//
// As regras de quando pode excluir ficam em src/servicos/exclusao-conta.ts; aqui só as consultas
// e a anonimização, numa transação só.

import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

/** O que impede a exclusão agora. Tudo zerado/falso: pode excluir. */
export type ImpedimentosDaExclusao = {
  /** Vendas ainda não sacadas (disponíveis, antecipáveis ou a liberar), em centavos. */
  saldoCentavos: number;
  /** Algum saque ainda sem resposta do Mercado Pago. */
  saqueProcessando: boolean;
  /** Pedido aguardando pagamento: do próprio usuário ou com fotos dele. */
  pedidoPendente: boolean;
};

/** Nome que fica no lugar do nome de quem excluiu a conta. */
export const NOME_CONTA_EXCLUIDA = "Conta excluída";
export const NOME_FOTOGRAFO_REMOVIDO = "Fotógrafo removido";

/**
 * E-mail de marcação de uma conta excluída. O domínio `.invalid` é reservado (RFC 2606): nunca
 * recebe e-mail e ninguém consegue se cadastrar e confirmar com ele.
 */
export function emailDaContaExcluida(usuarioId: string) {
  return `excluida-${usuarioId}@clicouai.invalid`;
}

export async function impedimentosDaExclusao(usuarioId: string): Promise<ImpedimentosDaExclusao> {
  const banco = await obterBanco();
  const [conta] = await banco
    .select({ id: t.fotografos.id })
    .from(t.fotografos)
    .where(eq(t.fotografos.usuarioId, usuarioId));

  const [{ pendentesComoCliente }] = await banco
    .select({ pendentesComoCliente: sql<number>`count(*)::int` })
    .from(t.pedidos)
    .where(and(eq(t.pedidos.clienteId, usuarioId), eq(t.pedidos.status, "pendente")));

  if (!conta) {
    return { saldoCentavos: 0, saqueProcessando: false, pedidoPendente: pendentesComoCliente > 0 };
  }

  const [[{ saldo }], [{ processando }], [{ pendentesComoVendedor }]] = await Promise.all([
    banco
      .select({ saldo: sql<number>`coalesce(sum(${t.lancamentos.valorCentavos}), 0)::int` })
      .from(t.lancamentos)
      .where(and(eq(t.lancamentos.fotografoId, conta.id), isNull(t.lancamentos.saqueId))),
    banco
      .select({ processando: sql<number>`count(*)::int` })
      .from(t.saques)
      .where(and(eq(t.saques.fotografoId, conta.id), eq(t.saques.status, "processando"))),
    // Pedido pendente com foto dele (como autor ou como dono do evento): se for pago depois da
    // exclusão, o dinheiro cairia numa conta que não saca mais.
    banco
      .select({ pendentesComoVendedor: sql<number>`count(*)::int` })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
      .where(
        and(
          eq(t.pedidos.status, "pendente"),
          or(eq(t.itensPedido.fotografoId, conta.id), eq(t.eventos.fotografoId, conta.id)),
        ),
      ),
  ]);

  return {
    saldoCentavos: Math.max(saldo, 0),
    saqueProcessando: processando > 0,
    pedidoPendente: pendentesComoCliente + pendentesComoVendedor > 0,
  };
}

/** Rosto apagado do banco, para tirar também da coleção do provedor (Rekognition). */
export type RostoRemovido = { eventoId: string; rostoIdProvedor: string };

/**
 * Anonimiza a conta, tudo ou nada. Quem chama já conferiu `impedimentosDaExclusao`. Devolve os
 * rostos apagados (para tirar do provedor) ou `null` se a conta não existe ou já foi excluída.
 *
 * - usuário: nome, e-mail, telefone, senha, Google e confirmação trocados ou apagados; a versão da
 *   sessão passa a ser `null` (versaoDaSessao), o que derruba todo cookie aberto;
 * - pedidos dele: continuam (com itens, valores e status), sem nome, e-mail e WhatsApp;
 * - mensagens desses pedidos ou para o e-mail dele: sem destinatário e sem texto;
 * - downloads dos itens dele: sem o IP;
 * - fotógrafo: perfil público apagado, eventos arquivados, fotos (dele ou dos eventos dele) com
 *   exclusão lógica, rostos e números das fotos apagados, cupons desligados, loja desativada,
 *   modelos de evento apagados. Itens vendidos continuam baixáveis por quem comprou.
 */
export async function anonimizarConta(usuarioId: string): Promise<RostoRemovido[] | null> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const [usuario] = await tx
      .select({ email: t.usuarios.email, excluidoEm: t.usuarios.excluidoEm })
      .from(t.usuarios)
      .where(eq(t.usuarios.id, usuarioId))
      .for("update");
    if (!usuario || usuario.excluidoEm) return null;

    const agora = new Date();
    const marcador = emailDaContaExcluida(usuarioId);
    const sufixo = usuarioId.slice(0, 8);

    // ------------------------------------------------ Compras (como cliente)
    const pedidosDoCliente = tx
      .select({ id: t.pedidos.id })
      .from(t.pedidos)
      .where(eq(t.pedidos.clienteId, usuarioId));
    await tx
      .update(t.mensagens)
      .set({ para: "removido", texto: "[removido na exclusão da conta]" })
      .where(
        or(inArray(t.mensagens.pedidoId, pedidosDoCliente), eq(t.mensagens.para, usuario.email)),
      );
    await tx
      .update(t.downloads)
      .set({ ip: null })
      .where(
        inArray(
          t.downloads.itemPedidoId,
          tx
            .select({ id: t.itensPedido.id })
            .from(t.itensPedido)
            .where(inArray(t.itensPedido.pedidoId, pedidosDoCliente)),
        ),
      );
    await tx
      .update(t.pedidos)
      .set({
        nomeComprador: NOME_CONTA_EXCLUIDA,
        emailComprador: marcador,
        whatsapp: null,
        aceitaWhatsapp: false,
        pixCopiaECola: null,
        pixQrCodeBase64: null,
      })
      .where(eq(t.pedidos.clienteId, usuarioId));

    // ------------------------------------------------ Venda (como fotógrafo)
    let rostos: RostoRemovido[] = [];
    const [conta] = await tx
      .select({ id: t.fotografos.id })
      .from(t.fotografos)
      .where(eq(t.fotografos.usuarioId, usuarioId));
    if (conta) {
      const eventosDele = tx
        .select({ id: t.eventos.id })
        .from(t.eventos)
        .where(eq(t.eventos.fotografoId, conta.id));
      const fotosDele = or(
        eq(t.fotos.enviadaPor, conta.id),
        inArray(t.fotos.eventoId, eventosDele),
      );

      // Exclusão lógica: some da galeria, mas o original fica para quem comprou.
      await tx
        .update(t.fotos)
        .set({ excluidaEm: agora })
        .where(and(fotosDele, isNull(t.fotos.excluidaEm)));

      const idsDasFotos = tx.select({ id: t.fotos.id }).from(t.fotos).where(fotosDele);
      // Rostos e números são dados das pessoas fotografadas: saem junto com as fotos.
      rostos = await tx
        .select({ eventoId: t.fotos.eventoId, rostoIdProvedor: t.rostos.rostoIdProvedor })
        .from(t.rostos)
        .innerJoin(t.fotos, eq(t.fotos.id, t.rostos.fotoId))
        .where(fotosDele);
      await tx.delete(t.rostos).where(inArray(t.rostos.fotoId, idsDasFotos));
      await tx.delete(t.numeros).where(inArray(t.numeros.fotoId, idsDasFotos));

      await tx
        .update(t.eventos)
        .set({ status: "arquivado", listado: false })
        .where(eq(t.eventos.fotografoId, conta.id));
      await tx.update(t.cupons).set({ ativo: false }).where(eq(t.cupons.fotografoId, conta.id));
      await tx
        .update(t.lojas)
        .set({
          nome: "Loja removida",
          descricao: null,
          logo: null,
          subdominio: `removida-${sufixo}`,
          dominioProprio: null,
          dominioVerificado: false,
          gaId: null,
          gtmId: null,
          ativa: false,
        })
        .where(eq(t.lojas.fotografoId, conta.id));
      await tx.delete(t.modelosEvento).where(eq(t.modelosEvento.fotografoId, conta.id));
      await tx
        .update(t.fotografos)
        .set({
          nomePublico: NOME_FOTOGRAFO_REMOVIDO,
          slug: `removido-${sufixo}`,
          bio: null,
          fotoPerfil: null,
          capa: null,
          redesSociais: {},
          // O CPF/CNPJ fica (registro fiscal de quem recebeu os saques); a chave não serve mais.
          chavePix: null,
        })
        .where(eq(t.fotografos.id, conta.id));
    }

    // ------------------------------------------------ Usuário
    // Código de confirmação (pela conta ou pelo e-mail) e links de "Esqueci a senha" pendentes.
    await tx
      .delete(t.codigosEmail)
      .where(or(eq(t.codigosEmail.usuarioId, usuarioId), eq(t.codigosEmail.email, usuario.email)));
    await tx.delete(t.redefinicoesSenha).where(eq(t.redefinicoesSenha.usuarioId, usuarioId));
    await tx.delete(t.codigosDeLogin).where(eq(t.codigosDeLogin.usuarioId, usuarioId));
    await tx.delete(t.codigosRecuperacao).where(eq(t.codigosRecuperacao.usuarioId, usuarioId));
    // Chat de ajuda (as mensagens saem junto) e o nome e e-mail das sugestões, que ficam sem dono.
    await tx.delete(t.conversasSuporte).where(eq(t.conversasSuporte.usuarioId, usuarioId));
    await tx
      .update(t.sugestoes)
      .set({ usuarioId: null, nome: NOME_CONTA_EXCLUIDA, email: "" })
      .where(eq(t.sugestoes.usuarioId, usuarioId));
    await tx
      .update(t.usuarios)
      .set({
        nome: NOME_CONTA_EXCLUIDA,
        email: marcador,
        telefone: null,
        senhaHash: null,
        googleId: null,
        emailConfirmadoEm: null,
        mfaSegredo: null,
        mfaAtivadoEm: null,
        mfaUltimoPasso: null,
        excluidoEm: agora,
      })
      .where(eq(t.usuarios.id, usuarioId));

    return rostos;
  });
}
