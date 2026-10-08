import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clock, Hourglass, Wallet } from "lucide-react";

import { Celula, Tabela } from "@/components/admin/tabela";
import { BotoesSaque } from "@/components/painel/botoes-saque";
import type { Saque } from "@/dados";
import { formatarCpfCnpj } from "@/lib/documentos";
import { formatarData, formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { chavePixValida, SAQUE_MINIMO_CENTAVOS, situacaoFinanceira } from "@/servicos/saques";
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

const STATUS_SAQUE: Record<Saque["status"], string> = {
  processando: "Processando",
  pago: "Pago",
  falhou: "Não realizado",
};

function CartaoSaldo({
  icone,
  titulo,
  valor,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  valor: number;
  texto: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icone}
        {titulo}
      </span>
      <span className="text-3xl font-bold tabular-nums">{formatarPreco(valor)}</span>
      <span className="text-sm text-muted-foreground">{texto}</span>
    </div>
  );
}

async function Conteudo() {
  const { usuario, conta } = await exigirFotografo("/painel/vendas");
  const { agora, lancamentos, saques, saldo, liberacaoTeste } = await situacaoFinanceira(
    conta,
    usuario,
  );
  const temChave = chavePixValida(conta);
  const emAndamento = saques.some((s) => s.status === "processando");

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
      <div className="grid gap-4 sm:grid-cols-3">
        <CartaoSaldo
          icone={<Wallet aria-hidden="true" className="size-4" />}
          titulo="Disponível"
          valor={saldo.disponivelCentavos}
          texto="Vendas com 30 dias ou mais."
        />
        <CartaoSaldo
          icone={<Hourglass aria-hidden="true" className="size-4" />}
          titulo="Antecipável"
          valor={saldo.antecipavelCentavos}
          texto="Vendas entre 1 e 30 dias: dá para sacar com 1% a mais."
        />
        <CartaoSaldo
          icone={<Clock aria-hidden="true" className="size-4" />}
          titulo="A liberar"
          valor={saldo.aLiberarCentavos}
          texto="Vendas de hoje: liberam amanhã."
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Sacar</h2>
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
        {emAndamento && (
          <p role="status" className="text-sm font-medium">
            Há um saque em processamento. Um novo saque fica liberado quando ele terminar.
          </p>
        )}
        <BotoesSaque
          normal={saldo.normal}
          antecipado={saldo.antecipado}
          podeSacar={temChave && !emAndamento}
          minimoCentavos={SAQUE_MINIMO_CENTAVOS}
        />
      </section>

      {saques.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Saques</h2>
          <Tabela
            colunas={[
              { rotulo: "Pedido em" },
              { rotulo: "Tipo" },
              { rotulo: "Status" },
              { rotulo: "Bruto", direita: true },
              { rotulo: "Taxas", direita: true },
              { rotulo: "Recebido", direita: true },
            ]}
          >
            {saques.map((s) => (
              <tr key={s.id}>
                <Celula>
                  <span className="whitespace-nowrap">{formatarDataEHora(s.criadoEm)}</span>
                </Celula>
                <Celula>{s.antecipado ? "Antecipado" : "Normal"}</Celula>
                <Celula>{STATUS_SAQUE[s.status]}</Celula>
                <Celula direita>{formatarPreco(s.brutoCentavos)}</Celula>
                <Celula direita>− {formatarPreco(s.taxaCentavos)}</Celula>
                <Celula direita forte>
                  {formatarPreco(s.liquidoCentavos)}
                </Celula>
              </tr>
            ))}
          </Tabela>
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
              const taxa = Math.max(0, Math.floor((l.valorCentavos * conta.comissaoPct) / 100));
              return (
                <tr key={l.id}>
                  <Celula>
                    <span className="flex flex-col">
                      <span className="font-medium">{l.eventoTitulo}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.pagoEm ? formatarDataEHora(l.pagoEm) : "—"}
                        {l.papel === "dono" && " · sua parte como dono (foto de colaborador)"}
                      </span>
                    </span>
                  </Celula>
                  <Celula direita>{formatarPreco(l.valorPagoCentavos)}</Celula>
                  <Celula direita>
                    <span className={l.valorCentavos < 0 ? "text-destructive" : undefined}>
                      {formatarPreco(l.valorCentavos)}
                    </span>
                  </Celula>
                  <Celula direita>− {formatarPreco(taxa)}</Celula>
                  <Celula direita forte>
                    {formatarPreco(l.valorCentavos - taxa)}
                  </Celula>
                  <Celula>{situacao(l, agora)}</Celula>
                </tr>
              );
            })}
          </Tabela>
        )}
        <p className="text-sm text-muted-foreground">
          Cada linha é um item vendido: o que o cliente pagou, a sua parte (todo o valor, ou a sua
          comissão quando a foto é de um colaborador no seu evento), a taxa da plataforma e o que
          você recebe no saque normal. No saque antecipado, o que ainda não tem 30 dias paga 1% a
          mais.
        </p>
      </section>
    </>
  );
}

function situacao(
  l: { saqueId: string | null; disponivelEm: string; antecipavelEm: string },
  agora: number,
) {
  if (l.saqueId) return "Sacado";
  if (new Date(l.disponivelEm).getTime() <= agora) return "Disponível";
  if (new Date(l.antecipavelEm).getTime() <= agora) {
    return `Antecipável · livre em ${formatarData(l.disponivelEm)}`;
  }
  return `Libera em ${formatarData(l.antecipavelEm)}`;
}
