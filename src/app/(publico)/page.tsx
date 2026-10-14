import { redirect } from "next/navigation";
import { Suspense } from "react";

import { filtrandoEventos } from "@/components/galeria/filtros-eventos";
import { CategoriasPopulares } from "@/components/inicio/categorias-populares";
import { BannerFotografos, ComoFuncionaInicio } from "@/components/inicio/como-funciona-inicio";
import { CONTAINER } from "@/components/inicio/comum";
import { EventosEmDestaque, EventosRecentes } from "@/components/inicio/eventos-inicio";
import { FotografosEmDestaque } from "@/components/inicio/fotografos-destaque";
import { HeroInicio } from "@/components/inicio/hero-inicio";
import {
  colaboradoresDosEventos,
  comissaoPadraoPct,
  listarEventosPublicados,
  vendasDaSemanaPorEvento,
  vendasPorAutor,
} from "@/dados";
import { destinoDaVitrine } from "@/lib/navegacao";
import { fotografosDaInicial, separarEventosDaInicial } from "@/lib/selecao-inicio";
import { lerFiltroEventos } from "@/lib/validacao";
import { usuarioAtual } from "@/servicos/sessao";

// A página espera a sessão antes de qualquer conteúdo (para o redirecionamento sair como 307),
// então bloqueia no servidor em vez de gerar uma casca instantânea.
export const instant = false;

/**
 * Página inicial: hero com a busca, categorias, eventos em destaque e recentes, fotógrafos, como
 * funciona e a faixa para os fotógrafos. A busca e os filtros ficam em /eventos.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  // A vitrine é de quem compra: fotógrafo e gestor logados vão para o painel (ou a gestão).
  const destino = destinoDaVitrine(await usuarioAtual(), "/");
  if (destino) redirect(destino);
  // Links antigos com os filtros na inicial (`/?categoria=corrida#eventos`): a lista filtrada agora
  // fica em /eventos, com os mesmos parâmetros.
  const filtro = lerFiltroEventos(await searchParams);
  if (filtrandoEventos(filtro)) {
    const consulta = new URLSearchParams(
      Object.entries(filtro).filter((par): par is [string, string] => Boolean(par[1])),
    );
    redirect(`/eventos?${consulta}`);
  }
  return (
    <>
      <HeroInicio />
      <CategoriasPopulares />
      {/* A lista lê a hora (liberação agendada) e as vendas da semana: sai na requisição. */}
      <Suspense fallback={<EsqueletoEventos />}>
        <EventosEFotografos />
      </Suspense>
      <ComoFuncionaInicio />
      <BannerFotografos comissaoPct={comissaoPadraoPct()} />
    </>
  );
}

/**
 * Destaque, recentes e fotógrafos saem de uma leitura só dos eventos listados (as mesmas regras
 * de /eventos: publicado, listado, liberação, senha e capa), dos colaboradores deles, das vendas
 * da semana por evento e das vendas por autor (dono ou colaborador, pelas próprias fotos).
 */
async function EventosEFotografos() {
  const [eventos, vendas, porAutor] = await Promise.all([
    listarEventosPublicados(),
    vendasDaSemanaPorEvento(),
    vendasPorAutor(),
  ]);
  const colaboradores = await colaboradoresDosEventos(eventos.map((e) => e.id));
  const { destaques, recentes, total } = separarEventosDaInicial(eventos, vendas);
  return (
    <>
      <EventosEmDestaque eventos={destaques} />
      <EventosRecentes eventos={recentes} total={total} />
      <FotografosEmDestaque fotografos={fotografosDaInicial(eventos, colaboradores, porAutor)} />
    </>
  );
}

function EsqueletoEventos() {
  return (
    <div aria-hidden="true" className={`${CONTAINER} py-7 md:py-10`}>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="mt-6 flex gap-3 overflow-hidden md:grid md:grid-cols-4 md:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="aspect-[6/5] w-[86vw] max-w-sm shrink-0 animate-pulse rounded-2xl bg-muted md:aspect-[4/3] md:w-auto md:max-w-none lg:aspect-[4/5]"
          />
        ))}
      </div>
    </div>
  );
}
