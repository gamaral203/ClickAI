import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CreditCard, Images, Search } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { FiltrosEventos, filtrandoEventos } from "@/components/galeria/filtros-eventos";
import { CarrosselInicio, type Slide } from "@/components/site/carrossel-inicio";
import { TopDaSemana } from "@/components/site/top-da-semana";
import { buttonVariants } from "@/components/ui/button";
import {
  listarEventosPublicados,
  listarOpcoesFiltroEventos,
  vendasDaSemanaPorEvento,
} from "@/dados";
import { destinoDaVitrine } from "@/lib/navegacao";
import { lerFiltroEventos } from "@/lib/validacao";
import { usuarioAtual } from "@/servicos/sessao";

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

// A página espera a sessão antes de qualquer conteúdo (para o redirecionamento sair como 307),
// então bloqueia no servidor em vez de gerar uma casca instantânea.
export const instant = false;

export default async function Home({ searchParams }: PageProps<"/">) {
  // A vitrine é de quem compra: fotógrafo e gestor logados vão para o painel (ou a gestão).
  const destino = destinoDaVitrine(await usuarioAtual(), "/");
  if (destino) redirect(destino);
  return (
    <>
      <CarrosselInicio slides={slides}>
        <div className="flex max-w-xl flex-col items-start gap-5 text-white">
          <span className="rounded-full bg-highlight px-3 py-1 text-sm font-semibold text-highlight-foreground">
            Em construção
          </span>
          {/* Tamanho fluido: 32 px no celular de 320 px, chegando a 60 px no computador. */}
          <h1 className="text-[clamp(2rem,1.25rem+3.75vw,3.75rem)] leading-[1.05] font-extrabold tracking-tight text-balance">
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

      <section aria-labelledby="como-funciona" className="border-t bg-muted/50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
          <h2 id="como-funciona" className="text-2xl font-bold tracking-tight">
            Como funciona
          </h2>
          {/* No celular, cada passo é uma linha compacta (ícone ao lado do texto); do tablet em
              diante, três cartões lado a lado. */}
          <ol className="mt-5 grid gap-2.5 sm:mt-8 sm:grid-cols-3 sm:gap-6">
            {passos.map(({ icone: Icone, titulo, texto }, i) => (
              <li
                key={titulo}
                className="flex items-start gap-3 rounded-xl border bg-card p-3.5 sm:flex-col sm:gap-3 sm:p-6"
              >
                <div className="flex shrink-0 items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground sm:size-10">
                    <Icone aria-hidden="true" className="size-4 sm:size-5" />
                  </span>
                  <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
                    Passo {i + 1}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 sm:gap-3">
                  <h3 className="text-sm font-semibold sm:text-lg">
                    <span className="text-muted-foreground sm:hidden">{i + 1}. </span>
                    {titulo}
                  </h3>
                  <p className="text-xs text-muted-foreground sm:text-base">{texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      {/* Lê as vendas da semana na requisição; sem vendas, a faixa não aparece. */}
      <Suspense fallback={null}>
        <EmAlta />
      </Suspense>

      <section id="eventos" aria-labelledby="titulo-eventos" className="scroll-mt-20">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
          <h2 id="titulo-eventos" className="text-2xl font-bold tracking-tight">
            Eventos recentes
          </h2>
          {/* A lista lê a hora (liberação agendada): sai na requisição, o resto vem do build. */}
          <Suspense fallback={<EsqueletoEventos />}>
            <EventosRecentes searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
    </>
  );
}

/** Os 3 eventos que mais venderam na semana: só eventos listados (públicos). */
async function EmAlta() {
  const [vendas, eventos] = await Promise.all([
    vendasDaSemanaPorEvento(),
    listarEventosPublicados(),
  ]);
  const porId = new Map(eventos.map((e) => [e.id, e]));
  const top = vendas.flatMap(([id]) => porId.get(id) ?? []).slice(0, 3);
  return <TopDaSemana eventos={top} />;
}

/** Eventos da inicial, com os filtros de data, cidade e categoria (vêm na URL). */
async function EventosRecentes({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const filtro = lerFiltroEventos(await searchParams);
  const filtrando = filtrandoEventos(filtro);
  const [eventos, opcoes] = await Promise.all([
    listarEventosPublicados(filtro),
    listarOpcoesFiltroEventos(),
  ]);
  if (eventos.length === 0 && !filtrando) {
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        Nenhum evento publicado ainda. Volte em breve!
      </p>
    );
  }
  // O link "ver todos" leva os mesmos filtros para /eventos.
  const consulta = new URLSearchParams(
    Object.entries(filtro).filter((par): par is [string, string] => Boolean(par[1])),
  ).toString();
  return (
    <>
      <FiltrosEventos
        action="/#eventos"
        filtro={filtro}
        opcoes={opcoes}
        limpar="/#eventos"
        idPrefixo="inicio"
      />
      {filtrando && (
        <p role="status" className="text-sm text-muted-foreground">
          {eventos.length === 1 ? "1 evento encontrado" : `${eventos.length} eventos encontrados`}
        </p>
      )}
      {eventos.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">Nenhum evento encontrado.</p>
          <p className="mt-1 text-sm text-muted-foreground">Tire algum dos filtros.</p>
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
        {eventos.slice(0, EVENTOS_NA_INICIAL).map((evento) => (
          <li key={evento.id} className="flex">
            <CartaoEvento evento={evento} />
          </li>
        ))}
      </ul>
      {eventos.length > EVENTOS_NA_INICIAL && (
        <Link
          href={consulta ? `/eventos?${consulta}` : "/eventos"}
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
