import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CreditCard, Images, Search } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { CarrosselInicio, type Slide } from "@/components/site/carrossel-inicio";
import { TopDaSemana } from "@/components/site/top-da-semana";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listarEventosPublicados, vendasDaSemanaPorEvento } from "@/dados";

/** Quantos eventos aparecem na página inicial; o resto fica em /eventos. */
const EVENTOS_NA_INICIAL = 9;

// Fotos de vitrine da página inicial (public/inicio/), já reduzidas e sem metadados.
const slides: Slide[] = [
  {
    src: "/inicio/corrida.webp",
    alt: "Corredor sorridente de óculos escuros e camiseta amarela, com o número de peito 10, numa corrida de rua",
    rotulo: "Corridas",
    vertical: true,
    computador: {
      src: "/inicio/cavaleiros-familia.webp",
      alt: "Pai com o filho pequeno no colo e mulher de chapéu branco montados a cavalo num evento ao ar livre",
      rotulo: "Eventos e cavalgadas",
      foco: "60% 35%",
    },
  },
  {
    src: "/inicio/cavalgada.webp",
    alt: "Silhuetas de dois cavaleiros ao pôr do sol, com o céu dourado ao fundo",
    rotulo: "Cavalgadas",
    foco: "65% 40%",
  },
  {
    src: "/inicio/retrato.webp",
    alt: "Retrato em estúdio de uma mulher de cabelo longo e camisa branca, com a mão no queixo",
    rotulo: "Ensaios e retratos",
    vertical: true,
    computador: {
      src: "/inicio/ensaio-casal.webp",
      alt: "Casal sorridente vestido de branco num ensaio ao ar livre, com montanhas e céu azul ao fundo",
      rotulo: "Ensaios e retratos",
      foco: "50% 30%",
    },
  },
];

const passos = [
  {
    icone: Search,
    titulo: "Encontre o seu evento",
    texto: "Busque pela corrida, festa ou formatura em que você estava.",
  },
  {
    icone: Images,
    titulo: "Escolha as suas fotos",
    texto: "Veja as prévias e separe as fotos em que você aparece.",
  },
  {
    icone: CreditCard,
    titulo: "Pague e baixe",
    texto: "Pague com Pix ou cartão e baixe os originais em alta resolução.",
  },
];

export default function Home() {
  return (
    <>
      <CarrosselInicio slides={slides}>
        <div className="flex max-w-xl flex-col items-start gap-5 text-white">
          <span className="rounded-full bg-highlight px-3 py-1 text-sm font-semibold text-highlight-foreground">
            Em construção
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
            As fotos do seu evento, <span className="text-highlight">a um clique.</span>
          </h1>
          <p className="text-lg text-pretty text-white/90">
            Fotógrafos publicam as fotos de corridas, festas, formaturas e esportes. Você encontra
            as suas, paga e baixa o original.
          </p>
          <Link href="#eventos" className={buttonVariants({ size: "touch" })}>
            Encontrar meu evento
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </div>
      </CarrosselInicio>

      {/* Lê as vendas da semana na requisição; sem vendas, a faixa não aparece. */}
      <Suspense fallback={null}>
        <EmAlta />
      </Suspense>

      <section aria-labelledby="como-funciona" className="border-t bg-muted/50">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="como-funciona" className="text-2xl font-bold tracking-tight">
            Como funciona
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {passos.map(({ icone: Icone, titulo, texto }, i) => (
              <li key={titulo} className="flex flex-col gap-3 rounded-xl border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icone aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">Passo {i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold">{titulo}</h3>
                <p className="text-muted-foreground">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section id="eventos" aria-labelledby="titulo-eventos" className="scroll-mt-20">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="titulo-eventos" className="text-2xl font-bold tracking-tight">
              Eventos recentes
            </h2>
            <form action="/eventos" role="search" className="flex gap-2 sm:w-96">
              <Input
                name="busca"
                type="search"
                maxLength={100}
                aria-label="Buscar evento por nome, cidade ou fotógrafo"
                placeholder="Buscar evento, cidade ou fotógrafo"
                className="h-11"
              />
              <button type="submit" className={buttonVariants({ size: "touch" })}>
                <Search aria-hidden="true" />
                <span className="sr-only">Buscar</span>
              </button>
            </form>
          </div>
          {/* A lista lê a hora (liberação agendada): sai na requisição, o resto vem do build. */}
          <Suspense fallback={<EsqueletoEventos />}>
            <EventosRecentes />
          </Suspense>
        </div>
      </section>
    </>
  );
}

/** Top 10 eventos da semana: só eventos listados (públicos), na ordem de fotos vendidas. */
async function EmAlta() {
  const [vendas, eventos] = await Promise.all([
    vendasDaSemanaPorEvento(),
    listarEventosPublicados(),
  ]);
  const porId = new Map(eventos.map((e) => [e.id, e]));
  const top = vendas.flatMap(([id]) => porId.get(id) ?? []).slice(0, 10);
  return <TopDaSemana eventos={top} />;
}

async function EventosRecentes() {
  const eventos = await listarEventosPublicados();
  if (eventos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        Nenhum evento publicado ainda. Volte em breve!
      </p>
    );
  }
  return (
    <>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {eventos.slice(0, EVENTOS_NA_INICIAL).map((evento) => (
          <li key={evento.id} className="flex">
            <CartaoEvento evento={evento} />
          </li>
        ))}
      </ul>
      {eventos.length > EVENTOS_NA_INICIAL && (
        <Link
          href="/eventos"
          className={buttonVariants({
            variant: "outline",
            size: "touch",
            className: "self-center",
          })}
        >
          Ver todos os {eventos.length} eventos
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      )}
    </>
  );
}

function EsqueletoEventos() {
  return (
    <div aria-hidden="true" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
