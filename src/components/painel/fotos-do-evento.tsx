"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Loader2, Undo2, Unlock, X } from "lucide-react";

import {
  mudarLiberacaoAcao,
  type ResultadoLiberacao,
} from "@/app/(fotografo)/painel/eventos/liberacao-acoes";
import { AtualizarNaHora } from "@/components/galeria/contagem-regressiva";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DIA_TODOS,
  diasComFotos,
  filtrarItensDoPainel,
  filtroDaUrl,
  filtroParaUrl,
  PASTA_TODAS,
  rotuloDoDia,
  SEM_DATA,
  SEM_PASTA,
  type FiltroDoPainel,
} from "@/lib/filtro-painel";
import type { EstadoLiberacao } from "@/lib/liberacao";
import type { FormatoMoldura } from "@/lib/moldura";

import { useEscolhaDeCapa } from "./capa-do-evento";
import { GradeFotosPainel, POR_VEZ, type ItemDoPainel } from "./grade-fotos-painel";
import { MoverParaPasta, type PastaDoSeletor } from "./mover-para-pasta";

type FiltroLiberacao = "todas" | EstadoLiberacao;

const FILTROS: { valor: FiltroLiberacao; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "liberada", rotulo: "Liberadas" },
  { valor: "agendada", rotulo: "Agendadas" },
  { valor: "manual", rotulo: "Aguardando" },
];

/** Até 5.000 ids por chamada (limite da ação de liberação). */
const LIBERAR_POR_VEZ = 5000;

const numero = new Intl.NumberFormat("pt-BR");
const fotos = (n: number) => `${numero.format(n)} ${n === 1 ? "foto" : "fotos"}`;

type Mudanca = { acao: "liberar" } | { acao: "cancelar" } | { acao: "agendar"; em: string };

/**
 * Fotos do evento no painel. Filtros combináveis e na URL: liberação, pasta (com "Sem pasta") e
 * dia (da captura ou do envio, em Brasília). O dono seleciona fotos uma a uma, a página inteira
 * ou "todas as N deste filtro" (aí a seleção é o filtro, que o servidor reavalia na hora) e
 * move para uma pasta, libera, agenda ou cancela o agendamento.
 */
export function FotosDoEvento({
  eventoId,
  itens,
  pastas,
  podeLiberar,
  capaFotoId,
  formatosMoldura,
  agora,
}: {
  eventoId: string;
  itens: ItemDoPainel[];
  /** Pastas em árvore, com o caminho no nome ("Largada › Bateria 1"). */
  pastas: PastaDoSeletor[];
  podeLiberar: boolean;
  /** Capa escolhida; sem o campo, a grade não oferece "Usar como capa" (só o dono escolhe). */
  capaFotoId?: string | null;
  /** Formatos com moldura no evento: "Story"/"Feed" nas fotos do próprio autor. */
  formatosMoldura?: FormatoMoldura[];
  /** Hora da requisição (ms), a mesma do estado da liberação calculado no servidor. */
  agora: number;
}) {
  const capa = useEscolhaDeCapa(eventoId, capaFotoId ?? null);
  const router = useRouter();
  const parametros = useSearchParams();
  // Dia pela captura (EXIF) quando alguma foto tem; senão, pelo envio.
  const temCaptura = itens.some((i) => i.capturadaEm);
  const basePadrao: FiltroDoPainel["base"] = temCaptura ? "captura" : "envio";
  const [filtro, setFiltroEstado] = useState<FiltroDoPainel>(() =>
    filtroDaUrl(parametros, basePadrao),
  );
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  /** "Todas as N deste filtro": a seleção é o filtro, não os ids. */
  const [todasDoFiltro, setTodasDoFiltro] = useState(false);
  const [mostrando, setMostrando] = useState(POR_VEZ);
  const [quando, setQuando] = useState("");
  const [resultado, setResultado] = useState<ResultadoLiberacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // Pasta do filtro que deixou de existir (excluída): volta para "Todas".
  const filtroValido = useMemo(
    () =>
      filtro.pasta === PASTA_TODAS ||
      filtro.pasta === SEM_PASTA ||
      pastas.some((p) => p.id === filtro.pasta)
        ? filtro
        : { ...filtro, pasta: PASTA_TODAS },
    [filtro, pastas],
  );
  const comDatas = useMemo(() => itensComDatas(itens), [itens]);

  function setFiltro(novo: FiltroDoPainel) {
    setFiltroEstado(novo);
    setSelecionados(new Set());
    setTodasDoFiltro(false);
    setMostrando(POR_VEZ);
    setResultado(null);
    // Só a URL muda (sem ida ao servidor): recarregar e "voltar" mantêm o filtro.
    const url = new URL(window.location.href);
    url.search = filtroParaUrl(novo, url.searchParams, basePadrao).toString();
    window.history.replaceState(null, "", url);
  }

  const visiveis = useMemo(
    () => filtrarItensDoPainel(comDatas, filtroValido, pastas, agora),
    [comDatas, filtroValido, pastas, agora],
  );
  // Contagens de cada opção com os outros filtros aplicados.
  const contagemLiberacao = useMemo(() => {
    const base = filtrarItensDoPainel(
      comDatas,
      { ...filtroValido, liberacao: "todas" },
      pastas,
      agora,
    );
    const c: Record<FiltroLiberacao, number> = {
      todas: base.length,
      liberada: 0,
      agendada: 0,
      manual: 0,
    };
    for (const item of base) c[item.estadoLiberacao]++;
    return c;
  }, [comDatas, filtroValido, pastas, agora]);
  const contagemPastas = useMemo(() => {
    const base = filtrarItensDoPainel(
      comDatas,
      { ...filtroValido, pasta: PASTA_TODAS },
      pastas,
      agora,
    );
    const diretas = new Map<string | null, number>();
    for (const i of base) diretas.set(i.pastaId, (diretas.get(i.pastaId) ?? 0) + 1);
    const total = (p: PastaDoSeletor) =>
      (diretas.get(p.id) ?? 0) +
      (p.nivel === 1
        ? pastas
            .filter((f) => f.pastaPaiId === p.id)
            .reduce((s, f) => s + (diretas.get(f.id) ?? 0), 0)
        : 0);
    return {
      todas: base.length,
      sem: diretas.get(null) ?? 0,
      porPasta: new Map(pastas.map((p) => [p.id, total(p)])),
    };
  }, [comDatas, filtroValido, pastas, agora]);
  const dias = useMemo(
    () =>
      diasComFotos(
        filtrarItensDoPainel(comDatas, { ...filtroValido, dia: DIA_TODOS }, pastas, agora),
        filtroValido.base,
      ),
    [comDatas, filtroValido, pastas, agora],
  );
  const anoAtual = new Date(agora).getFullYear();

  // Seleção: os ids marcados que ainda existem, ou todas do filtro.
  const marcadas = todasDoFiltro ? visiveis : itens.filter((i) => selecionados.has(i.id));
  const naPagina = visiveis.slice(0, mostrando);
  const paginaToda = naPagina.length > 0 && naPagina.every((i) => selecionados.has(i.id));
  const totalSelecionado = marcadas.length;
  const temSelecao = todasDoFiltro || selecionados.size > 0;

  // Liberação: as não liberadas da seleção; sem seleção, todas as não liberadas do evento.
  const escolhidas = marcadas.filter((i) => i.estadoLiberacao !== "liberada");
  const naoLiberadasDoEvento = itens.filter((i) => i.estadoLiberacao !== "liberada");
  const alvo = temSelecao ? escolhidas : naoLiberadasDoEvento;
  const temAgendada = alvo.some((i) => i.estadoLiberacao === "agendada");
  // Próxima liberação agendada: a grade se atualiza sozinha nesse minuto.
  const proxima = itens
    .filter((i) => i.estadoLiberacao === "agendada" && i.liberarEm)
    .map((i) => i.liberarEm!)
    .sort()[0];

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  function alternar(id: string) {
    if (todasDoFiltro) {
      // Desmarcar uma foto sai do "todas do filtro" e volta para a lista de ids.
      setTodasDoFiltro(false);
      setSelecionados(new Set(visiveis.map((i) => i.id).filter((i) => i !== id)));
      return;
    }
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarPagina() {
    if (todasDoFiltro) return limparSelecao();
    setSelecionados((atual) => {
      const novo = new Set(atual);
      for (const i of naPagina) {
        if (paginaToda) novo.delete(i.id);
        else novo.add(i.id);
      }
      return novo;
    });
  }

  function limparSelecao() {
    setSelecionados(new Set());
    setTodasDoFiltro(false);
  }

  function aplicar(mudanca: Mudanca) {
    setResultado(null);
    if (temSelecao && escolhidas.length === 0) {
      setResultado({ erro: "As fotos selecionadas já estão liberadas." });
      return;
    }
    startTransition(async () => {
      const ids = temSelecao ? escolhidas.map((i) => i.id) : null;
      let alteradas = 0;
      const lotes = ids
        ? Array.from({ length: Math.ceil(ids.length / LIBERAR_POR_VEZ) }, (_, n) =>
            ids.slice(n * LIBERAR_POR_VEZ, (n + 1) * LIBERAR_POR_VEZ),
          )
        : [null];
      for (const lote of lotes) {
        const resposta: ResultadoLiberacao = await mudarLiberacaoAcao({
          eventoId,
          mudanca,
          ...(lote && { fotoIds: lote }),
        }).catch(() => ({ erro: "Não foi possível concluir. Tente de novo." }));
        if (resposta.erro) return setResultado(resposta);
        alteradas += resposta.alteradas ?? 0;
      }
      setResultado({ alteradas });
      limparSelecao();
      router.refresh();
    });
  }

  const textoAlvo = temSelecao
    ? `${escolhidas.length} ${escolhidas.length === 1 ? "foto escolhida" : "fotos escolhidas"} ainda não ${escolhidas.length === 1 ? "liberada" : "liberadas"}`
    : `todas as ${naoLiberadasDoEvento.length} ainda não liberadas`;

  const selecaoParaMover = todasDoFiltro
    ? ({ tipo: "filtro", filtro: filtroValido } as const)
    : ({ tipo: "ids", ids: marcadas.map((i) => i.id) } as const);

  return (
    <div className={`flex flex-col gap-4 ${podeLiberar && temSelecao ? "pb-32 sm:pb-0" : ""}`}>
      {proxima && <AtualizarNaHora alvo={proxima} />}
      {itens.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <div role="group" aria-label="Filtrar pela liberação" className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Button
                key={f.valor}
                size="touch"
                variant={filtroValido.liberacao === f.valor ? "default" : "outline"}
                aria-pressed={filtroValido.liberacao === f.valor}
                onClick={() => setFiltro({ ...filtroValido, liberacao: f.valor })}
              >
                {f.rotulo} ({numero.format(contagemLiberacao[f.valor])})
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`filtro-pasta-${eventoId}`} className="text-sm font-medium">
                Pasta
              </label>
              <select
                id={`filtro-pasta-${eventoId}`}
                value={filtroValido.pasta}
                onChange={(e) => setFiltro({ ...filtroValido, pasta: e.target.value })}
                className={CLASSE_SELECT}
              >
                <option value={PASTA_TODAS}>
                  Todas as pastas ({numero.format(contagemPastas.todas)})
                </option>
                <option value={SEM_PASTA}>Sem pasta ({numero.format(contagemPastas.sem)})</option>
                {pastas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({numero.format(contagemPastas.porPasta.get(p.id) ?? 0)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`filtro-dia-${eventoId}`} className="text-sm font-medium">
                {filtroValido.base === "captura" ? "Dia da captura" : "Dia do envio"}{" "}
                <span className="font-normal text-muted-foreground">(Brasília)</span>
              </label>
              <select
                id={`filtro-dia-${eventoId}`}
                value={filtroValido.dia}
                onChange={(e) => setFiltro({ ...filtroValido, dia: e.target.value })}
                className={CLASSE_SELECT}
              >
                <option value={DIA_TODOS}>Todos os dias</option>
                {dias.map((d) => (
                  <option key={d.dia} value={d.dia}>
                    {d.dia === SEM_DATA ? "Sem data de captura" : rotuloDoDia(d.dia, anoAtual)} ·{" "}
                    {fotos(d.total)}
                  </option>
                ))}
                {/* Dia da URL sem foto nenhuma: continua escolhido, com zero. */}
                {filtroValido.dia !== DIA_TODOS &&
                  !dias.some((d) => d.dia === filtroValido.dia) && (
                    <option value={filtroValido.dia}>
                      {filtroValido.dia === SEM_DATA
                        ? "Sem data de captura"
                        : rotuloDoDia(filtroValido.dia, anoAtual)}{" "}
                      · 0 fotos
                    </option>
                  )}
              </select>
            </div>
            {temCaptura && (
              <div
                role="group"
                aria-label="Data usada para o dia"
                className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1"
              >
                <span className="text-sm font-medium" aria-hidden="true">
                  Usar a data
                </span>
                <div className="flex gap-2">
                  {(["captura", "envio"] as const).map((base) => (
                    <Button
                      key={base}
                      size="touch"
                      className="flex-1"
                      variant={filtroValido.base === base ? "default" : "outline"}
                      aria-pressed={filtroValido.base === base}
                      onClick={() =>
                        setFiltro({
                          ...filtroValido,
                          base,
                          dia:
                            filtroValido.dia === SEM_DATA && base === "envio"
                              ? DIA_TODOS
                              : filtroValido.dia,
                        })
                      }
                    >
                      {base === "captura" ? "Da captura" : "Do envio"}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {fotos(visiveis.length)} neste filtro
            {(filtroValido.liberacao !== "todas" ||
              filtroValido.pasta !== PASTA_TODAS ||
              filtroValido.dia !== DIA_TODOS) && (
              <>
                {" · "}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() =>
                    setFiltro({
                      ...filtroValido,
                      liberacao: "todas",
                      pasta: PASTA_TODAS,
                      dia: DIA_TODOS,
                    })
                  }
                >
                  Limpar filtros
                </Button>
              </>
            )}
          </p>
        </div>
      )}

      {podeLiberar && naoLiberadasDoEvento.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <p className="text-sm">
            Liberação: vale para <strong>{textoAlvo}</strong>.{" "}
            {!temSelecao && (
              <span className="text-muted-foreground">
                Marque “Selecionar” nas fotos para mudar só algumas.
              </span>
            )}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Button size="touch" disabled={pendente} onClick={() => aplicar({ acao: "liberar" })}>
              {pendente ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Unlock aria-hidden="true" />
              )}
              Liberar agora
            </Button>
            <form
              className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (quando) aplicar({ acao: "agendar", em: quando });
                else setResultado({ erro: "Escolha a data e a hora da liberação." });
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`agendar-${eventoId}`} className="text-sm font-medium">
                  Agendar para (horário de Brasília)
                </label>
                <Input
                  id={`agendar-${eventoId}`}
                  type="datetime-local"
                  value={quando}
                  onChange={(e) => setQuando(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button type="submit" size="touch" variant="outline" disabled={pendente}>
                <CalendarClock aria-hidden="true" />
                {temAgendada ? "Agendar ou reagendar" : "Agendar"}
              </Button>
            </form>
            {temAgendada && (
              <Button
                size="touch"
                variant="ghost"
                disabled={pendente}
                onClick={() => aplicar({ acao: "cancelar" })}
              >
                <Undo2 aria-hidden="true" />
                Cancelar agendamento
              </Button>
            )}
          </div>
          {resultado?.erro && (
            <div
              role="alert"
              className="flex flex-col gap-2 text-sm text-destructive sm:flex-row sm:items-center"
            >
              <span>{resultado.erro}</span>
              {resultado.horarioPassado && (
                <Button size="sm" disabled={pendente} onClick={() => aplicar({ acao: "liberar" })}>
                  Liberar agora
                </Button>
              )}
            </div>
          )}
          {resultado && !resultado.erro && (
            <p role="status" className="text-sm text-primary">
              {resultado.alteradas === 0
                ? "Nenhuma foto precisava mudar."
                : `${resultado.alteradas} ${resultado.alteradas === 1 ? "foto atualizada" : "fotos atualizadas"}.`}
            </p>
          )}
        </div>
      )}

      {podeLiberar && visiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={todasDoFiltro || paginaToda}
              onChange={alternarPagina}
              className="size-5 accent-primary"
            />
            Selecionar todas desta página ({numero.format(naPagina.length)})
          </label>
          {visiveis.length > naPagina.length && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={todasDoFiltro}
                onChange={() => {
                  if (todasDoFiltro) return limparSelecao();
                  setTodasDoFiltro(true);
                  setSelecionados(new Set());
                }}
                className="size-5 accent-primary"
              />
              Selecionar todas as {fotos(visiveis.length)} deste filtro
            </label>
          )}
        </div>
      )}

      {capa.erro && (
        <p role="alert" className="text-sm text-destructive">
          {capa.erro}
        </p>
      )}
      <GradeFotosPainel
        eventoId={eventoId}
        itens={visiveis}
        pastas={pastas}
        selecao={
          podeLiberar
            ? {
                selecionados: todasDoFiltro ? new Set(visiveis.map((i) => i.id)) : selecionados,
                alternar,
              }
            : undefined
        }
        capa={capaFotoId === undefined ? undefined : capa.escolha}
        vazio={itens.length === 0 ? undefined : "Nenhuma foto neste filtro."}
        formatosMoldura={formatosMoldura}
        mostrando={mostrando}
        aoMostrarMais={() => setMostrando((n) => n + POR_VEZ)}
      />

      {podeLiberar && temSelecao && (
        // No celular, fixa embaixo (o botão do chat sobe, em globals.css); no computador,
        // grudada no pé da tela enquanto a grade rola.
        <div
          data-barra-selecao-painel
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur-md sm:sticky sm:bottom-4 sm:rounded-xl sm:border sm:p-4 sm:shadow-lg"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-sm" aria-live="polite">
              {todasDoFiltro ? (
                <>
                  <strong>Todas as {fotos(visiveis.length)}</strong> deste filtro estão
                  selecionadas.
                </>
              ) : (
                <>
                  <strong>
                    {numero.format(totalSelecionado)}{" "}
                    {totalSelecionado === 1 ? "selecionada" : "selecionadas"}.
                  </strong>{" "}
                  {visiveis.length > totalSelecionado && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-left whitespace-normal"
                      onClick={() => {
                        setTodasDoFiltro(true);
                        setSelecionados(new Set());
                      }}
                    >
                      Selecionar todas as {fotos(visiveis.length)} deste filtro
                    </Button>
                  )}
                </>
              )}
            </p>
            <div className="flex gap-2">
              <MoverParaPasta
                eventoId={eventoId}
                quantidade={totalSelecionado}
                selecao={selecaoParaMover}
                pastas={pastas}
                aoMover={(movidas, destino) => {
                  limparSelecao();
                  setAviso(
                    `${fotos(movidas)} ${movidas === 1 ? "movida" : "movidas"} ${destino === null ? "para Sem pasta" : `para ${destino}`}`,
                  );
                  router.refresh();
                }}
              />
              <Button size="touch" variant="outline" onClick={limparSelecao}>
                <X aria-hidden="true" />
                Limpar seleção
              </Button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className="fixed top-4 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background shadow-xl"
        >
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-highlight" />
          <span className="flex-1">{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Fechar aviso"
            className="-m-2 flex size-11 items-center justify-center rounded-md"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const CLASSE_SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Os itens com as datas que o filtro usa (o envio sempre existe; a captura, se houver EXIF). */
function itensComDatas(itens: ItemDoPainel[]) {
  return itens.map((i) => ({
    ...i,
    criadoEm: i.criadoEm ?? "1970-01-01T00:00:00.000Z",
    capturadaEm: i.capturadaEm ?? null,
  }));
}
