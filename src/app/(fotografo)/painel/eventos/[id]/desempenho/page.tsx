import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  CalendarClock,
  Crown,
  Download,
  ExternalLink,
  Eye,
  Images,
  Info,
  Receipt,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";

import { CartaoNumero } from "@/components/admin/tabela";
import { GraficoVendas } from "@/components/graficos/grafico-vendas";
import { StatusEventoSelo } from "@/components/painel/status-evento";
import { TopCliques } from "@/components/painel/top-cliques";
import { desempenhoDoEvento, fracaoVendida } from "@/dados";
import { formatarData, formatarPorcentagem, formatarPreco } from "@/lib/formatar";
import { ehIdValido } from "@/lib/validacao";
import { exigirFotografo } from "@/servicos/sessao";

// Desempenho do evento: vendas, público e ganhos numa tela só. O dono vê o evento inteiro; o
// colaborador que aceitou o convite vê a mesma tela com os números só das fotos dele (a regra
// fica em src/dados/desempenho-evento.ts). Qualquer outra pessoa recebe "não encontrado".

export const metadata: Metadata = {
  title: "Desempenho do evento",
  robots: { index: false, follow: false },
};

export default function PaginaDesempenhoDoEvento(
  props: PageProps<"/painel/eventos/[id]/desempenho">,
) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Conteudo {...props} />
    </Suspense>
  );
}

const FUSO = "America/Sao_Paulo";
const diaCurto = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: FUSO,
});
const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO,
});

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

const linkTexto =
  "flex min-h-10 w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline";

function LinhaGanho({
  rotulo,
  valor,
  detalhe,
  total,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  total?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-3 ${total ? "font-semibold" : ""}`}
    >
      <dt className="flex flex-col">
        <span>{rotulo}</span>
        {detalhe && (
          <span className="text-xs font-normal text-muted-foreground sm:text-sm">{detalhe}</span>
        )}
      </dt>
      <dd className={`shrink-0 tabular-nums ${total ? "text-lg sm:text-xl" : ""}`}>{valor}</dd>
    </div>
  );
}

async function Conteudo({ params }: PageProps<"/painel/eventos/[id]/desempenho">) {
  const { id } = await params;
  const { conta } = await exigirFotografo(`/painel/eventos/${id}/desempenho`);
  // Sem acesso dá "não encontrado", igual a um id que não existe.
  const d = ehIdValido(id) ? await desempenhoDoEvento(id, conta.id) : null;
  if (!d) notFound();
  const { evento, ganhos } = d;
  const dono = d.papel === "dono";
  const semVendas = d.pedidos === 0;
  const fracao = fracaoVendida(d.fotosVendidas, d.fotosCarregadas);
  const ultimaVenda = d.ultimaVendaEm ? new Date(d.ultimaVendaEm) : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={dono ? `/painel/eventos/${evento.id}` : "/painel/colaboracoes"}
        className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {dono ? "Voltar ao evento" : "Colaborações"}
      </Link>

      <header className="flex flex-col gap-3 rounded-xl border p-5">
        <p className="text-sm font-medium text-primary">Desempenho do evento</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{evento.titulo}</h1>
          <StatusEventoSelo status={evento.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatarData(evento.inicioEm)} · {evento.local}, {evento.cidade}/{evento.estado}
        </p>
        <div className="flex flex-wrap gap-x-5">
          {dono ? (
            <Link href={`/painel/eventos/${evento.id}`} className={linkTexto}>
              <Settings aria-hidden="true" className="size-4" />
              Gerenciar evento
            </Link>
          ) : (
            <Link href="/painel/colaboracoes" className={linkTexto}>
              <Images aria-hidden="true" className="size-4" />
              Enviar fotos
            </Link>
          )}
          {evento.status === "publicado" && (
            <Link href={`/eventos/${evento.slug}`} className={linkTexto}>
              Ver a página pública
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>
        {!dono && (
          <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Você colabora neste evento: vendas, fotos, downloads e ganhos mostram só as fotos que
            você enviou. Visitas e o ranking da equipe são do evento inteiro.
          </p>
        )}
      </header>

      <section aria-labelledby="vendas" className="flex flex-col gap-3">
        <h2 id="vendas" className="text-xl font-semibold">
          Vendas
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <CartaoNumero
            icone={<Banknote aria-hidden="true" className="size-4" />}
            titulo="Total das vendas"
            valor={formatarPreco(d.faturamentoCentavos)}
            texto={dono ? "Pago pelos clientes, com desconto" : "Pago pelas suas fotos"}
          />
          <CartaoNumero
            icone={<ShoppingBag aria-hidden="true" className="size-4" />}
            titulo="Pedidos"
            valor={String(d.pedidos)}
            texto={`${d.porMetodo.pix} Pix · ${d.porMetodo.cartao} cartão`}
          />
          <CartaoNumero
            icone={<Receipt aria-hidden="true" className="size-4" />}
            titulo="Ticket médio"
            valor={formatarPreco(d.ticketMedioCentavos)}
            texto="Valor médio por pedido"
          />
          <CartaoNumero
            icone={<Crown aria-hidden="true" className="size-4" />}
            titulo="Maior pedido"
            valor={formatarPreco(d.maiorPedidoCentavos)}
            texto={dono ? "O pedido de maior valor" : "Somando só as suas fotos"}
          />
          <CartaoNumero
            icone={<CalendarClock aria-hidden="true" className="size-4" />}
            titulo="Última venda"
            valor={ultimaVenda ? diaCurto.format(ultimaVenda) : "—"}
            texto={ultimaVenda ? `às ${hora.format(ultimaVenda)}` : "Nenhuma venda ainda"}
          />
          <CartaoNumero
            icone={<Download aria-hidden="true" className="size-4" />}
            titulo="Downloads"
            valor={String(d.downloads)}
            texto="Originais baixados pelos clientes"
          />
        </div>
      </section>

      <section aria-labelledby="fotos-e-publico" className="flex flex-col gap-3">
        <h2 id="fotos-e-publico" className="text-xl font-semibold">
          Fotos e público
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <CartaoNumero
            icone={<BadgeCheck aria-hidden="true" className="size-4" />}
            titulo="Fotos vendidas"
            valor={String(d.fotosVendidas)}
            texto={
              fracao === null
                ? "Nenhuma foto carregada"
                : `${formatarPorcentagem(fracao)} das carregadas`
            }
          />
          <CartaoNumero
            icone={<Images aria-hidden="true" className="size-4" />}
            titulo="Fotos carregadas"
            valor={String(d.fotosCarregadas)}
            texto={dono ? "Prontas na galeria" : "Enviadas por você"}
          />
          <CartaoNumero
            icone={<Eye aria-hidden="true" className="size-4" />}
            titulo="Visitas"
            valor={String(d.visitas)}
            texto={
              d.visitas === 0
                ? "Nenhuma visita ainda"
                : `${formatarPorcentagem(d.conversao)} viraram pedido`
            }
          />
          <CartaoNumero
            icone={<Users aria-hidden="true" className="size-4" />}
            titulo="Equipe"
            valor={String(d.equipe.quantidade)}
            texto={`${d.equipe.quantidade} ${d.equipe.quantidade === 1 ? "fotógrafo" : "fotógrafos"} neste evento`}
          />
        </div>
      </section>

      <section aria-labelledby="ganhos" className="flex flex-col gap-3">
        <h2 id="ganhos" className="text-xl font-semibold">
          Seus ganhos neste evento
        </h2>
        <div className="flex flex-col gap-3 rounded-xl border p-5">
          <dl className="flex flex-col divide-y">
            <LinhaGanho
              rotulo="Vendas das suas fotos"
              valor={formatarPreco(ganhos.vendasPropriasCentavos)}
            />
            {dono && (
              <LinhaGanho
                rotulo="Comissão sobre os colaboradores"
                detalhe="A sua parte nas vendas das fotos deles"
                valor={formatarPreco(ganhos.comissaoComoDonoCentavos)}
              />
            )}
            <LinhaGanho rotulo="Total bruto" valor={formatarPreco(ganhos.brutoCentavos)} />
            <LinhaGanho
              rotulo={`Taxa da plataforma (${ganhos.comissaoPct}%)`}
              valor={`− ${formatarPreco(ganhos.taxaCentavos)}`}
            />
            <LinhaGanho rotulo="Você recebe" valor={formatarPreco(ganhos.liquidoCentavos)} total />
          </dl>
          <p className="text-sm text-muted-foreground">
            A taxa sai no saque, não na venda. A conta acima é a do saque normal; no saque
            antecipado a taxa é um pouco maior. Estornos já estão descontados. O saldo para sacar
            fica em{" "}
            <Link href="/painel/vendas" className="font-medium text-primary hover:underline">
              Financeiro
            </Link>
            .
          </p>
        </div>
      </section>

      {semVendas ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <p className="text-lg font-semibold">
            {dono ? "Este evento ainda não tem vendas" : "Suas fotos ainda não venderam"}
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">
            {dono
              ? "Divulgue o link ou o QR Code do evento para quem participou. Assim que a primeira venda for paga, o gráfico e as fotos mais vendidas aparecem aqui."
              : "Assim que alguém comprar uma foto que você enviou, o gráfico e as suas fotos mais vendidas aparecem aqui."}
          </p>
          {dono && (
            <Link href={`/painel/eventos/${evento.id}`} className={`${linkTexto} mt-2`}>
              Ir para a divulgação do evento
            </Link>
          )}
        </div>
      ) : (
        <>
          <GraficoVendas
            titulo="Vendas por dia"
            descricao={`${dono ? "Pago pelos clientes" : "Pago pelas suas fotos"}, ${
              d.porDia.length >= 60 ? "nos últimos 60 dias" : "desde a primeira venda"
            }`}
            pontos={d.porDia}
          />

          {d.maisVendidas.length > 0 && (
            <section aria-labelledby="mais-vendidas" className="flex flex-col gap-3">
              <h2 id="mais-vendidas" className="text-xl font-semibold">
                {dono ? "Fotos mais vendidas" : "Suas fotos mais vendidas"}
              </h2>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {d.maisVendidas.map((f) => (
                  <li key={f.fotoId} className="flex min-w-0 flex-col gap-1">
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={f.urlMiniatura}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 120px, 33vw"
                        className="object-cover"
                      />
                    </div>
                    <span className="truncate text-xs text-muted-foreground">{f.nomeArquivo}</span>
                    <span className="text-xs font-medium tabular-nums">
                      {plural(f.vendas, "venda", "vendas")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <TopCliques posicoes={d.equipe.posicoes} destaque={conta.id} />
    </div>
  );
}
