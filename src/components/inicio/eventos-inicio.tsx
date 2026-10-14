import Image from "next/image";
import Link from "next/link";
import { Calendar, Camera, Images, Lock, MapPin } from "lucide-react";

import { contarItens } from "@/components/galeria/cartao-evento";
import type { EventoResumo } from "@/dados";
import { textoSemCapa } from "@/lib/capa";
import { formatarPeriodo, seloDeData } from "@/lib/formatar";

import { CabecalhoSecao, CONTAINER, SetaRedonda, TRILHO, TRILHO_ATE_LG } from "./comum";

const LINK_TODOS = { href: "/eventos", curto: "Ver todos", longo: "Ver todos os eventos" };

/** Capa do evento ou, sem capa (galeria fechada ou com senha), o fundo da marca com o motivo. */
function Capa({ evento, sizes }: { evento: EventoResumo; sizes: string }) {
  if (evento.capaMiniatura) {
    return (
      <Image
        src={evento.capaMiniatura.urlMiniatura}
        alt=""
        fill
        sizes={sizes}
        className="object-cover object-[50%_20%] transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
      />
    );
  }
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-linear-135 from-primary to-profundo px-3 text-center text-white">
      <Camera aria-hidden="true" className="size-7 text-highlight" />
      <span className="text-xs font-medium text-white/90">{textoSemCapa(evento)}</span>
    </span>
  );
}

/**
 * Eventos em destaque: os que mais venderam na semana (e, com eventos suficientes, os recentes
 * com capa; src/lib/selecao-inicio.ts). Cartão grande com a foto inteira e o texto por cima. No
 * celular, carrossel; no tablet, 2 por linha; no computador, 4.
 */
export function EventosEmDestaque({ eventos }: { eventos: EventoResumo[] }) {
  if (eventos.length === 0) return null;
  return (
    <section aria-labelledby="titulo-destaque" className={`${CONTAINER} py-7 md:py-10`}>
      <CabecalhoSecao id="titulo-destaque" titulo="Eventos em destaque" link={LINK_TODOS} />
      <ul className={`${TRILHO} mt-4 md:mt-6 md:grid-cols-2 md:gap-4 lg:grid-cols-4`}>
        {eventos.map((evento) => (
          <li
            key={evento.id}
            className="w-[86vw] max-w-sm shrink-0 snap-start md:w-auto md:max-w-none"
          >
            {/* isolate + -z-10: a foto e o degradê ficam atrás do texto, e o link do título (que cobre
                o cartão) se posiciona no próprio cartão. */}
            <article className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl bg-profundo text-white">
              <div className="absolute inset-0 -z-10">
                <Capa
                  evento={evento}
                  sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 86vw"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-linear-to-t from-profundo/95 via-profundo/45 via-45% to-transparent"
                />
              </div>
              <span className="absolute top-3 left-3 rounded-md bg-highlight px-2 py-1 text-[0.6875rem] font-bold tracking-wide text-highlight-foreground uppercase">
                Em destaque
              </span>
              {evento.visibilidade === "senha" && <SeloSenha />}
              <div className="flex items-end gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h3 className="line-clamp-2 text-lg leading-snug font-bold text-balance">
                    <Link
                      href={`/eventos/${evento.slug}`}
                      className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none after:focus-visible:ring-3 after:focus-visible:ring-highlight"
                    >
                      {evento.titulo}
                    </Link>
                  </h3>
                  <p className="flex items-center gap-1.5 text-sm text-white/90">
                    <Images aria-hidden="true" className="size-4 shrink-0" />
                    {contarItens(evento)}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-white/90">
                    <Calendar aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">
                      {formatarPeriodo(evento.inicioEm, evento.fimEm)}
                    </span>
                  </p>
                  {/* Data e local em linhas separadas: juntos não cabem no cartão e eram cortados. */}
                  <p className="flex items-center gap-1.5 text-sm text-white/90">
                    <MapPin aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">
                      {evento.cidade} - {evento.estado}
                    </span>
                  </p>
                </div>
                <SetaRedonda className="bg-white text-primary" />
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Eventos recentes: do mais novo para o mais antigo, sem os que já estão no destaque. Cartão com o
 * selo da data sobre a foto. Sem nenhum evento publicado, um estado vazio.
 */
export function EventosRecentes({ eventos, total }: { eventos: EventoResumo[]; total: number }) {
  return (
    <section aria-labelledby="titulo-recentes" className={`${CONTAINER} py-7 md:py-10`}>
      <CabecalhoSecao
        id="titulo-recentes"
        titulo="Eventos recentes"
        link={total > 0 ? LINK_TODOS : undefined}
      />
      {eventos.length === 0 ? (
        <EstadoVazio />
      ) : (
        <ul className={`${TRILHO_ATE_LG} mt-4 md:mt-6 lg:grid-cols-4`}>
          {eventos.map((evento) => {
            const data = seloDeData(evento.inicioEm);
            return (
              <li
                key={evento.id}
                className="w-[62vw] max-w-64 shrink-0 snap-start md:w-60 lg:w-auto lg:max-w-none"
              >
                <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40">
                  <div className="relative aspect-[4/3] bg-muted">
                    <Capa evento={evento} sizes="(min-width: 768px) 25vw, 62vw" />
                    <span className="absolute top-2 left-2 flex min-w-11 flex-col items-center rounded-lg bg-white px-2 py-1 leading-none text-foreground shadow-sm">
                      <span className="text-base font-extrabold tabular-nums">{data.dia}</span>
                      <span className="mt-0.5 text-[0.625rem] font-semibold tracking-wide uppercase">
                        {data.mes}
                      </span>
                    </span>
                    {evento.visibilidade === "senha" && <SeloSenha />}
                  </div>
                  <div className="flex flex-1 items-end gap-2 p-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="line-clamp-2 text-sm leading-snug font-bold md:text-base">
                        <Link
                          href={`/eventos/${evento.slug}`}
                          className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none after:focus-visible:ring-3 after:focus-visible:ring-ring/50"
                        >
                          {evento.titulo}
                        </Link>
                      </h3>
                      <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground md:text-sm">
                        <Images aria-hidden="true" className="size-3.5 shrink-0" />
                        {contarItens(evento)}
                      </p>
                      <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground md:text-sm">
                        <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {evento.cidade} - {evento.estado}
                        </span>
                      </p>
                    </div>
                    <SetaRedonda className="border text-primary group-hover:border-primary/40" />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SeloSenha() {
  return (
    <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-foreground">
      <Lock aria-hidden="true" className="size-3.5" />
      Com senha
    </span>
  );
}

function EstadoVazio() {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center md:mt-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Camera aria-hidden="true" className="size-7" />
      </span>
      <p className="text-lg font-bold">Os primeiros eventos estão chegando</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Assim que os fotógrafos publicarem, os eventos aparecem aqui. Se você fotografa eventos,
        publique o seu primeiro.
      </p>
      <Link
        href="/cadastro?tipo=fotografo"
        className="mt-1 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Quero publicar meus eventos
      </Link>
    </div>
  );
}
