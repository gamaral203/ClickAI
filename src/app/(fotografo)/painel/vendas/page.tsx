import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgeDollarSign, Clock, Hourglass, TrendingUp, Wallet } from "lucide-react";

import { mascararDocumento } from "@/components/admin/tabela";
import { AntecipacaoFinanceiro } from "@/components/painel/financeiro-antecipacao";
import { HistoricoFinanceiro } from "@/components/painel/financeiro-historico";
import { TransferenciaFinanceiro } from "@/components/painel/financeiro-transferencia";
import { ListaTransferencias } from "@/components/painel/lista-transferencias";
import type { Saque } from "@/dados";
import { formatarCpfCnpj } from "@/lib/documentos";
import { formatarData, formatarPreco } from "@/lib/formatar";
import {
  FREQUENCIA_TRANSFERENCIA_PADRAO,
  liberaEm,
  proximaTransferenciaEm,
  situacaoDoLancamento,
  TAXA_ANTECIPACAO_TEXTO,
} from "@/servicos/financeiro";
import {
  chavePixValida,
  mensagemDeBloqueio,
  SAQUE_MINIMO_CENTAVOS,
  situacaoFinanceira,
} from "@/servicos/saques";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Financeiro", robots: { index: false, follow: false } };

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function PaginaVendas({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const SITUACAO_SAQUE: Record<Saque["status"], string> = {
  processando: "Aguardando o Pix da equipe",
  pago: "Transferência efetuada",
  falhou: "Não realizada: o valor voltou ao saldo",
};

/** Transferências com falha ficam à vista por uma semana; depois, só no histórico. */
const FALHA_VISIVEL_MS = 7 * 24 * 60 * 60 * 1000;

const AVISO =
  "rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-50";

function CartaoSaldo({
  icone,
  titulo,
  valor,
  texto,
  principal = false,
}: {
  icone: React.ReactNode;
  titulo: string;
  valor: number;
  texto: string;
  /** O saldo disponível: o número que importa, em azul e com a linha inteira no celular. */
  principal?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 rounded-xl border p-3 sm:gap-1 sm:p-4 ${
        principal
          ? "col-span-2 border-primary bg-primary text-primary-foreground sm:col-span-1"
          : "bg-card"
      }`}
    >
      <span
        className={`flex items-center gap-1.5 text-xs sm:text-sm ${
          principal ? "text-primary-foreground/85" : "text-muted-foreground"
        }`}
      >
        {icone}
        {titulo}
      </span>
      <span className="text-xl font-bold tabular-nums sm:text-2xl">{formatarPreco(valor)}</span>
      <span
        className={`text-xs ${principal ? "text-primary-foreground/85" : "text-muted-foreground"}`}
      >
        {texto}
      </span>
    </div>
  );
}

function LinhaDetalhe({
  rotulo,
  valor,
  menos = false,
  forte = false,
}: {
  rotulo: string;
  valor: number;
  menos?: boolean;
  forte?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 py-2 text-sm ${forte ? "font-semibold" : "text-muted-foreground"}`}
    >
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">
        {menos ? "− " : ""}
        {formatarPreco(valor)}
      </dd>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const { usuario, conta } = await exigirFotografo("/painel/vendas");
  const { agora, lancamentos, saques, saldo, resumo, liberacaoTeste, bloqueadoAte } =
    await situacaoFinanceira(conta, usuario);
  const temChave = chavePixValida(conta);
  const anteciparCartao = conta.anteciparCartao === true;
  const emAndamento = saques.some((s) => s.status === "processando");
  // Pendentes sempre; com falha só as recentes (o valor já voltou ao saldo, é só um aviso).
  const pendentesEFalhas = saques.filter(
    (s) =>
      s.status === "processando" ||
      (s.status === "falhou" && agora - new Date(s.criadoEm).getTime() < FALHA_VISIVEL_MS),
  );
  // Próxima liberação do que ainda não está disponível, pela configuração atual.
  const proximaLiberacao = lancamentos
    .filter((l) => l.saqueId === null && l.valorCentavos > 0)
    .filter((l) => situacaoDoLancamento(l, agora, anteciparCartao) === "a_receber")
    .map((l) => liberaEm(l, anteciparCartao))
    .sort()[0];

  return (
    <>
      {liberacaoTeste && (
        <p role="alert" className={AVISO}>
          Liberação de teste ativa: prazo de saque ignorado nesta conta. Remova
          SAQUE_SEM_PRAZO_EMAILS depois do teste.
        </p>
      )}
      {conta.demonstracao && (
        <p role="status" className={AVISO}>
          Conta de demonstração: as vendas são fictícias e não podem ser transferidas.
        </p>
      )}

      <section aria-labelledby="titulo-resumo" className="flex flex-col gap-3">
        <h2 id="titulo-resumo" className="sr-only">
          Resumo
        </h2>
        {/* Celular: o disponível na linha inteira e os outros dois por linha. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          <CartaoSaldo
            principal
            icone={<Wallet aria-hidden="true" className="size-4" />}
            titulo="Saldo disponível"
            valor={saldo.disponivelCentavos}
            texto="Já sem as taxas. Pronto para transferir."
          />
          <CartaoSaldo
            icone={<Clock aria-hidden="true" className="size-4" />}
            titulo="Saldo a receber"
            valor={saldo.aReceberLiquidoCentavos}
            texto={
              proximaLiberacao
                ? `Próxima liberação em ${formatarData(proximaLiberacao)}.`
                : "Vendas que ainda não liberaram."
            }
          />
          <CartaoSaldo
            icone={<Hourglass aria-hidden="true" className="size-4" />}
            titulo="Disponível para antecipação"
            valor={saldo.antecipavelLiquidoCentavos}
            texto={
              anteciparCartao
                ? "Antecipação ligada: o cartão já entra no disponível."
                : `Cartão com mais de 1 dia, se antecipar (${TAXA_ANTECIPACAO_TEXTO}).`
            }
          />
          <CartaoSaldo
            icone={<TrendingUp aria-hidden="true" className="size-4" />}
            titulo="Total de vendas"
            valor={resumo.vendasBrutoCentavos}
            texto="Sua parte bruta, com estornos abatidos."
          />
          <CartaoSaldo
            icone={<BadgeDollarSign aria-hidden="true" className="size-4" />}
            titulo="Ganhos líquidos"
            valor={resumo.ganhosLiquidosCentavos}
            texto="Vendas menos comissão e antecipação."
          />
        </div>

        <details className="group rounded-xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Detalhamento dos valores
            <span className="ml-1 font-normal text-muted-foreground group-open:hidden">
              (tocar para abrir)
            </span>
          </summary>
          <dl className="divide-y px-4 pb-2">
            <LinhaDetalhe rotulo="Valor bruto das vendas" valor={resumo.vendasBrutoCentavos} />
            <LinhaDetalhe
              rotulo={`Comissão ClicouAí (${conta.comissaoPct}%)`}
              valor={resumo.comissaoCentavos}
              menos
            />
            {(resumo.taxasAntecipacaoCentavos > 0 || anteciparCartao) && (
              <LinhaDetalhe
                rotulo={`Taxa de antecipação do cartão (${TAXA_ANTECIPACAO_TEXTO})`}
                valor={resumo.taxasAntecipacaoCentavos}
                menos
              />
            )}
            <LinhaDetalhe rotulo="Valor líquido" valor={resumo.ganhosLiquidosCentavos} forte />
            <LinhaDetalhe rotulo="Já transferido" valor={resumo.transferidoCentavos} />
            <LinhaDetalhe rotulo="Pendente (em transferência)" valor={resumo.pendenteCentavos} />
          </dl>
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            A comissão sai uma vez só, na transferência. A taxa de antecipação entra aqui quando é
            cobrada, nas vendas no cartão transferidas antes dos 30 dias.
          </p>
        </details>
      </section>

      <AntecipacaoFinanceiro
        ligado={anteciparCartao}
        comissaoPct={conta.comissaoPct}
        antecipavelCentavos={saldo.antecipavelCentavos}
        antecipavelLiquidoCentavos={saldo.antecipavelLiquidoCentavos}
      />

      <section aria-labelledby="titulo-transferencia" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="titulo-transferencia" className="text-xl font-semibold">
            Transferência de saldo
          </h2>
          <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-semibold text-highlight-foreground">
            Sem tarifa
          </span>
        </div>
        {temChave ? (
          <p className="text-sm text-muted-foreground">
            O Pix vai para a sua chave {formatarCpfCnpj(conta.chavePix ?? "")} (o seu CPF/CNPJ).
          </p>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            Para transferir, confirme sua chave Pix em{" "}
            <Link href="/painel/perfil" className="font-medium text-primary underline">
              Perfil e recebimento
            </Link>
            .
          </p>
        )}
        {bloqueadoAte && (
          <p role="alert" className={AVISO}>
            {mensagemDeBloqueio(bloqueadoAte)} Se não foi você quem trocou, responda o e-mail de
            aviso ou fale com a gente pela central de ajuda.
          </p>
        )}
        {emAndamento && (
          <p role="status" className="text-sm font-medium">
            Há uma transferência em andamento. Uma nova fica liberada quando ela terminar.
          </p>
        )}
        <TransferenciaFinanceiro
          // Só os números: os ids dos lançamentos não precisam ir para o navegador.
          previa={{
            brutoCentavos: saldo.brutoCentavos,
            comissaoCentavos: saldo.comissaoCentavos,
            taxaAntecipacaoCentavos: saldo.taxaAntecipacaoCentavos,
            liquidoCentavos: saldo.liquidoCentavos,
          }}
          comissaoPct={conta.comissaoPct}
          podeTransferir={temChave && !emAndamento && !bloqueadoAte && !conta.demonstracao}
          minimoCentavos={SAQUE_MINIMO_CENTAVOS}
          pedeCodigo={usuario.mfaAtivo}
          automatica={{
            ligada: conta.transferenciaAutomatica === true,
            frequencia: conta.frequenciaTransferencia ?? FREQUENCIA_TRANSFERENCIA_PADRAO,
            proximaEm: proximaTransferenciaEm(conta),
          }}
        />

        {pendentesEFalhas.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Pendentes e com falha</h3>
            <ListaTransferencias
              itens={pendentesEFalhas.map((s) => ({
                id: s.id,
                situacao: SITUACAO_SAQUE[s.status],
                pendente: s.status === "processando",
                quandoIso: s.criadoEm,
                valorCentavos: s.liquidoCentavos,
                detalhes: [
                  `Pix para ${mascararDocumento(s.chavePix)}`,
                  `bruto ${formatarPreco(s.brutoCentavos)}`,
                  `comissão ${formatarPreco(s.comissaoCentavos)}`,
                  ...(s.taxaAntecipacaoCentavos > 0
                    ? [`antecipação ${formatarPreco(s.taxaAntecipacaoCentavos)}`]
                    : []),
                ],
              }))}
            />
          </div>
        )}
      </section>

      {/* Histórico com filtros pela URL: carrega à parte para não segurar o saldo. */}
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <HistoricoFinanceiro fotografoId={conta.id} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
