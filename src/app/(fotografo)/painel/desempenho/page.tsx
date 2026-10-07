import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { Celula, Tabela } from "@/components/admin/tabela";
import { desempenhoDoFotografo } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Desempenho", robots: { index: false, follow: false } };

const porcentagem = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function PaginaDesempenho() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Desempenho</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/desempenho");
  const { eventos, fotos } = await desempenhoDoFotografo(conta.id);

  return (
    <>
      <p className="text-muted-foreground">
        Quantas pessoas viram cada evento, quantas colocaram fotos no carrinho e quantas compraram.
        Conversão é pedidos ÷ visitas. Visitas contam uma vez por pessoa a cada visita ao site.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Por evento</h2>
        <Tabela
          colunas={[
            { rotulo: "Evento" },
            { rotulo: "Visitas", direita: true },
            { rotulo: "Carrinhos", direita: true },
            { rotulo: "Pedidos", direita: true },
            { rotulo: "Itens vendidos", direita: true },
            { rotulo: "Conversão", direita: true },
            { rotulo: "Faturamento", direita: true },
          ]}
          vazio="Crie e publique um evento para acompanhar o desempenho."
        >
          {eventos.map((e) => (
            <tr key={e.evento.id}>
              <Celula>
                <span className="flex flex-col">
                  <Link
                    href={`/painel/eventos/${e.evento.id}`}
                    className="font-medium hover:underline"
                  >
                    {e.evento.titulo}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatarData(e.evento.inicioEm)}
                    {e.evento.status !== "publicado" && " · não publicado"}
                  </span>
                </span>
              </Celula>
              <Celula direita>{e.visitas}</Celula>
              <Celula direita>{e.carrinhos}</Celula>
              <Celula direita>{e.pedidos}</Celula>
              <Celula direita>{e.itensVendidos}</Celula>
              <Celula direita>
                {e.conversao === null ? "—" : porcentagem.format(e.conversao)}
              </Celula>
              <Celula direita forte>
                {formatarPreco(e.faturamentoCentavos)}
              </Celula>
            </tr>
          ))}
        </Tabela>
        <p className="text-sm text-muted-foreground">
          Faturamento é o que os clientes pagaram pelos itens do evento (com desconto), incluindo os
          dos colaboradores.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Fotos que mais vendem</h2>
        {fotos.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Assim que as primeiras fotos venderem, elas aparecem aqui.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {fotos.map(({ foto, eventoTitulo, vendas, visitas }) => (
              <li key={foto.id} className="flex flex-col gap-2">
                <Link
                  href={`/fotos/${foto.id}`}
                  className="relative block aspect-square overflow-hidden rounded-lg bg-muted"
                >
                  <Image
                    src={foto.urlMiniatura}
                    alt={`Foto de ${eventoTitulo}`}
                    fill
                    sizes="(min-width: 640px) 25vw, 50vw"
                    className="object-cover"
                  />
                </Link>
                <span className="text-sm">
                  <strong>{vendas === 1 ? "1 venda" : `${vendas} vendas`}</strong>
                  <span className="text-muted-foreground"> · {visitas} visitas</span>
                </span>
                <span className="truncate text-xs text-muted-foreground">{eventoTitulo}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
