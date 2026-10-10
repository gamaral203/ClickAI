import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown, Clock, Hourglass, Send, Wallet } from "lucide-react";

import { Celula, mascararDocumento, Tabela } from "@/components/admin/tabela";
import { ListaTransferencias } from "@/components/painel/lista-transferencias";
import { BotoesSaque } from "@/components/painel/botoes-saque";
import type { Saque } from "@/dados";
import { formatarCpfCnpj } from "@/lib/documentos";
import { formatarData, formatarDataEHora, formatarPreco } from "@/lib/formatar";
import {
  TAXA_ANTECIPACAO_PCT,
  chavePixValida,
  mensagemDeBloqueio,
  SAQUE_MINIMO_CENTAVOS,
  situacaoFinanceira,
} from "@/servicos/saques";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Vendas", robots: { index: false, follow: false } };

export default function PaginaVendas() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const SITUACAO_SAQUE: Record<Saque["status"], string> = {
  processando: "Aguardando o Pix da equipe",
  pago: "Transferência efetuada",
  falhou: "Não realizada: o valor voltou ao saldo",
};

function CartaoSaldo({
  icone,
  titulo,
  valor,
  texto,
  destaque = false,
}: {
  icone: React.ReactNode;
  titulo: string;
  valor: number;
  texto: string;
  /** Saque pedido e ainda não pago: o cartão fica em evidência. */
  destaque?: boolean;
}) {
  return (
    // No celular os cartões ficam dois por linha: menos espaço e número menor.
    <div
      className={`flex min-w-0 flex-col gap-0.5 rounded-xl border p-3 sm:gap-1 sm:p-5 ${
        destaque ? "border-primary/40 bg-accent/50" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:gap-2 sm:text-sm">
        {icone}
        {titulo}
      </span>
      <span className="text-xl font-bold tabular-nums sm:text-3xl">{formatarPreco(valor)}</span>
      <span className="text-xs text-muted-foreground sm:text-sm">{texto}</span>
    </div>
  );
}

async function Conteudo() {
  const { usuario, conta } = await exigirFotografo("/painel/vendas");
  const { agora, lancamentos, saques, saldo, liberacaoTeste, bloqueadoAte } =
    await situacaoFinanceira(conta, usuario);
  const temChave = chavePixValida(conta);
  const emAndamento = saques.some((s) => s.status === "processando");
  // O que já foi pedido e ainda não caiu: sai dos saldos acima e aparece aqui até a equipe pagar.
  const solicitadoCentavos = saques
    .filter((s) => s.status === "processando")
    .reduce((total, s) => total + s.liquidoCentavos, 0);

  return (
    <>
      {liberacaoTeste && (
        <p
          role="alert"
          className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-50"
        >
          Liberação de teste ativa: prazo de saque ignorado nesta conta. Remova
          SAQUE_SEM_PRAZO_EMAILS depois do teste.
        </p>
      )}
      {/* No celular, 2 por linha; no computador, os 4 lado a lado. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <CartaoSaldo
          icone={<Wallet aria-hidden="true" className="size-4" />}
          titulo="Disponível"
          valor={saldo.disponivelCentavos}
          texto={`Vendas com 30 dias ou mais: saque normal, taxa de ${conta.comissaoPct}%.`}
        />
        <CartaoSaldo
          icone={<Hourglass aria-hidden="true" className="size-4" />}
          titulo="Antecipável"
          valor={saldo.antecipavelCentavos}
          texto={`Vendas de 1 a 29 dias: saque antecipado, taxa de ${conta.comissaoPct + TAXA_ANTECIPACAO_PCT}%.`}
        />
        <CartaoSaldo
          icone={<Clock aria-hidden="true" className="size-4" />}
          titulo="Vendas de hoje"
          valor={saldo.aLiberarCentavos}
          texto="Amanhã passam para Antecipável."
        />
        <CartaoSaldo
          icone={<Send aria-hidden="true" className="size-4" />}
          titulo="Saque solicitado"
          valor={solicitadoCentavos}
          texto={
            solicitadoCentavos > 0
              ? "Aguardando o Pix da equipe (até 1 dia)."
              : "Nenhum saque em andamento."
          }
          destaque={solicitadoCentavos > 0}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Sacar</h2>
        {/* Fechado por padrão: quem já sabe não precisa ler de novo a cada visita. */}
        <details className="group rounded-xl border border-primary/20 bg-accent/60 text-sm text-accent-foreground">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
            Como funciona o saque
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="list-disc space-y-1 px-4 pb-3 pl-9">
            <li>
              <strong>Saque normal:</strong> cada venda fica disponível <strong>30 dias</strong>{" "}
              depois de paga, com taxa de <strong>{conta.comissaoPct}%</strong>.
            </li>
            <li>
              <strong>Saque antecipado:</strong> a partir de <strong>1 dia</strong> depois da venda,
              com taxa de <strong>{conta.comissaoPct + TAXA_ANTECIPACAO_PCT}%</strong> (
              {TAXA_ANTECIPACAO_PCT}% a mais) sobre o que ainda não tem 30 dias.
            </li>
            <li>
              Depois que você pede, a nossa equipe faz o Pix para a sua chave em até{" "}
              <strong>1 dia</strong> e você recebe um aviso.
            </li>
          </ul>
        </details>
        {temChave ? (
          <p className="text-sm text-muted-foreground">
            O Pix vai para a sua chave {formatarCpfCnpj(conta.chavePix ?? "")}. Os valores abaixo
            são brutos; a taxa da plataforma sai no saque.
          </p>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            Para sacar, confirme sua chave Pix em{" "}
            <Link href="/painel/perfil" className="font-medium text-primary underline">
              Perfil e recebimento
            </Link>
            .
          </p>
        )}
        {bloqueadoAte && (
          <p
            role="alert"
            className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          >
            {mensagemDeBloqueio(bloqueadoAte)} Se não foi você quem trocou, responda o e-mail de
            aviso ou fale com a gente pela central de ajuda.
          </p>
        )}
        {emAndamento && (
          <p role="status" className="text-sm font-medium">
            Há um saque em processamento. Um novo saque fica liberado quando ele terminar.
          </p>
        )}
        <BotoesSaque
          normal={saldo.normal}
          antecipado={saldo.antecipado}
          podeSacar={temChave && !emAndamento && !bloqueadoAte}
          minimoCentavos={SAQUE_MINIMO_CENTAVOS}
          pedeCodigo={usuario.mfaAtivo}
          comissaoPct={conta.comissaoPct}
          antecipacaoPct={TAXA_ANTECIPACAO_PCT}
        />
      </section>

      {saques.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Saques</h2>
          <ListaTransferencias
            itens={saques.map((s) => ({
              id: s.id,
              situacao: SITUACAO_SAQUE[s.status],
              pendente: s.status === "processando",
              quandoIso: s.pagoEm ?? s.criadoEm,
              valorCentavos: s.liquidoCentavos,
              detalhes: [
                `Pix para ${mascararDocumento(s.chavePix)}`,
                s.antecipado ? "antecipado" : "normal",
                `bruto ${formatarPreco(s.brutoCentavos)}`,
                `taxa ${formatarPreco(s.taxaCentavos)}`,
              ],
            }))}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Extrato</h2>
        {lancamentos.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Nenhuma venda ainda. Elas aparecem aqui assim que o pagamento é confirmado.
          </p>
        ) : (
          <Tabela
            colunas={[
              { rotulo: "Venda" },
              { rotulo: "Cliente pagou", direita: true },
              { rotulo: "Sua parte", direita: true },
              { rotulo: `Taxa (${conta.comissaoPct}%)`, direita: true },
              { rotulo: "Líquido", direita: true },
              { rotulo: "Previsão de repasse" },
            ]}
          >
            {lancamentos.map((l) => {
              // No estorno, a taxa volta junto (sinal oposto), como no cálculo do saque.
              const taxaAbs = Math.floor((Math.abs(l.valorCentavos) * conta.comissaoPct) / 100);
              const taxa = l.valorCentavos < 0 ? -taxaAbs : taxaAbs;
              const estorno = l.valorCentavos < 0;
              return (
                <tr key={l.id}>
                  <Celula>
                    <span className="flex flex-col">
                      <span className="font-medium">{l.eventoTitulo}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.pagoEm ? formatarDataEHora(l.pagoEm) : "—"}
                        {l.papel === "dono" && " · sua parte como dono (foto de colaborador)"}
                        {estorno && " · estorno: pedido reembolsado ou contestado"}
                        {!estorno && l.estornoDe && " · estorno desfeito: contestação ganha"}
                      </span>
                    </span>
                  </Celula>
                  <Celula direita>{formatarPreco(l.valorPagoCentavos)}</Celula>
                  <Celula direita>
                    <span className={l.valorCentavos < 0 ? "text-destructive" : undefined}>
                      {formatarPreco(l.valorCentavos)}
                    </span>
                  </Celula>
                  <Celula direita>
                    {taxa < 0 ? `+ ${formatarPreco(-taxa)}` : `− ${formatarPreco(taxa)}`}
                  </Celula>
                  <Celula direita forte>
                    {formatarPreco(l.valorCentavos - taxa)}
                  </Celula>
                  <Celula>{situacao(l, agora)}</Celula>
                </tr>
              );
            })}
          </Tabela>
        )}
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium hover:text-foreground">
            Entenda as colunas
          </summary>
          <p className="mt-1">
            Cada linha é um item vendido: o que o cliente pagou, a sua parte (todo o valor, ou a sua
            comissão quando a foto é de um colaborador no seu evento), a taxa da plataforma e o que
            você recebe no saque normal. No saque antecipado, o que ainda não tem 30 dias paga{" "}
            {TAXA_ANTECIPACAO_PCT}% a mais. Nas vendas no cartão, metade da taxa do cartão já sai da
            sua parte (a outra metade o cliente paga).
          </p>
        </details>
      </section>
    </>
  );
}

function situacao(
  l: { saqueId: string | null; disponivelEm: string; antecipavelEm: string; valorCentavos: number },
  agora: number,
) {
  if (l.saqueId) return l.valorCentavos < 0 ? "Abatido num saque" : "Sacado";
  if (l.valorCentavos < 0) return "Abatido do próximo saque";
  if (new Date(l.disponivelEm).getTime() <= agora) return "Disponível";
  if (new Date(l.antecipavelEm).getTime() <= agora) {
    return `Antecipável · livre em ${formatarData(l.disponivelEm)}`;
  }
  return `Libera em ${formatarData(l.antecipavelEm)}`;
}
