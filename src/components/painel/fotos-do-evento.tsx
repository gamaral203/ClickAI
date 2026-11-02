"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
  filtroParaUrl,
  PASTA_TODAS,
  rotuloDoDia,
  SEM_DATA,
  SEM_PASTA,
  type FiltroDoPainel,
} from "@/lib/filtro-painel";
import type { EstadoLiberacao } from "@/lib/liberacao";
import type { FormatoMoldura } from "@/lib/moldura";
import { ritmoObservado, textoDaPrevisao } from "@/lib/previsao-fotos";

import type { ContagensDoPainel } from "@/dados/fotos-do-painel";

import { useEscolhaDeCapa } from "./capa-do-evento";
import { GradeFotosPainel, POR_VEZ, type ItemDoPainel } from "./grade-fotos-painel";
import { MoverParaPasta, type PastaDoSeletor } from "./mover-para-pasta";

type FiltroLiberacao = "todas" | EstadoLiberacao;
type FiltroSituacao = FiltroDoPainel["situacao"];

const SITUACOES: { valor: FiltroSituacao; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "pronta", rotulo: "Prontas" },
  { valor: "processando", rotulo: "Processando" },
  { valor: "erro", rotulo: "Com erro" },
];
/** Intervalo da consulta leve enquanto há fotos em processamento. */
const CONSULTA_A_CADA_MS = 15_000;
/** Fotos pedidas de uma vez ao atualizar o que já está na tela (o teto da rota). */
const ATUALIZA_NO_MAXIMO = 200;

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
 * Fotos do evento no painel, paginadas no servidor. Filtros combináveis e na URL: situação,
 * liberação, pasta (com "Sem pasta") e dia (da captura ou do envio, em Brasília). O dono seleciona
 * fotos uma a uma, as já carregadas ou "todas as N deste filtro" (aí a seleção é o filtro, que o
 * servidor reavalia na hora) e move para uma pasta, libera, agenda ou cancela o agendamento.
 */
export function FotosDoEvento({
  eventoId,
  itensIniciais,
  contagensIniciais,
  filtroInicial,
  temCaptura: temCapturaInicial,
  pastas,
  podeLiberar,
  capaFotoId,
  formatosMoldura,
  agora,
}: {
  eventoId: string;
  /** A primeira página, já com o filtro da URL. */
  itensIniciais: ItemDoPainel[];
  contagensIniciais: ContagensDoPainel;
  filtroInicial: FiltroDoPainel;
  /** Alguma foto do evento tem data de captura (define a data padrão do filtro por dia). */
  temCaptura: boolean;
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
  const [temCaptura, setTemCaptura] = useState(temCapturaInicial);
  // Dia pela captura (EXIF) quando alguma foto tem; senão, pelo envio.
  const basePadrao: FiltroDoPainel["base"] = temCaptura ? "captura" : "envio";
  const [filtro, setFiltroEstado] = useState<FiltroDoPainel>(filtroInicial);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  /** "Todas as N deste filtro": a seleção é o filtro, não os ids. */
  const [todasDoFiltro, setTodasDoFiltro] = useState(false);
  const [itens, setItens] = useState(itensIniciais);
  const [contagens, setContagens] = useState(contagensIniciais);
  const [carregando, setCarregando] = useState(false);
  const [falhaAoCarregar, setFalhaAoCarregar] = useState(false);
  /**
   * A liberação de cada foto já vista, em qualquer filtro: a seleção por id continua contando
   * certo quando a foto marcada não está mais carregada.
   */
  const [conhecidasDeFora, setConhecidasDeFora] = useState<Map<string, EstadoLiberacao>>(
    () => new Map(),
  );
  const estadoDa = (id: string) =>
    itens.find((i) => i.id === id)?.estadoLiberacao ?? conhecidasDeFora.get(id);
  const [ritmo, setRitmo] = useState<number | undefined>(undefined);
  const [quando, setQuando] = useState("");
  const [resultado, setResultado] = useState<ResultadoLiberacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // Pasta do filtro que deixou de existir (excluída): volta para "Todas".
  const filtroValido =
    filtro.pasta === PASTA_TODAS ||
    filtro.pasta === SEM_PASTA ||
    pastas.some((p) => p.id === filtro.pasta)
      ? filtro
      : { ...filtro, pasta: PASTA_TODAS };
  const chaveDoFiltro = JSON.stringify(filtroValido);
  /** A última consulta pedida: resposta de um filtro antigo que chega depois é descartada. */
  const consultaAtual = useRef(0);

  /** Pede ao servidor as fotos e as contagens do filtro. `lista` substitui o que está na tela. */
  const consultar = useCallback(
    async (alvoDoFiltro: FiltroDoPainel, desde: number, limite: number) => {
      const pedido = ++consultaAtual.current;
      const parametros = paramsDoFiltro(alvoDoFiltro);
      parametros.set("desde", String(desde));
      parametros.set("limite", String(limite));
      const resposta = await fetch(`/api/painel/eventos/${eventoId}/fotos?${parametros}`);
      if (!resposta.ok) throw new Error("Consulta recusada");
      const dados = (await resposta.json()) as {
        itens: ItemDoPainel[];
        contagens: ContagensDoPainel;
        temCaptura: boolean;
      };
      return pedido === consultaAtual.current ? dados : null;
    },
    [eventoId],
  );

  /** Atualiza o que já está na tela, sem perder as fotos carregadas além do teto. */
  const quantasNaTela = itens.length;
  const atualizarLista = useCallback(async () => {
    try {
      const alvoDoFiltro = JSON.parse(chaveDoFiltro) as FiltroDoPainel;
      const quantas = Math.min(ATUALIZA_NO_MAXIMO, Math.max(POR_VEZ, quantasNaTela));
      const dados = await consultar(alvoDoFiltro, 0, quantas);
      if (!dados) return;
      setItens((atuais) => {
        const novos = new Set(dados.itens.map((i) => i.id));
        const resto = atuais.slice(quantas).filter((i) => !novos.has(i.id));
        return [...dados.itens, ...resto];
      });
      setContagens(dados.contagens);
      setTemCaptura(dados.temCaptura);
      setFalhaAoCarregar(false);
    } catch {
      setFalhaAoCarregar(true);
    }
  }, [chaveDoFiltro, consultar, quantasNaTela]);

  function setFiltro(novo: FiltroDoPainel) {
    setFiltroEstado(novo);
    setSelecionados(new Set());
    setTodasDoFiltro(false);
    setResultado(null);
    // Só a URL muda (sem recarregar a página): recarregar e "voltar" mantêm o filtro.
    const url = new URL(window.location.href);
    url.search = filtroParaUrl(novo, url.searchParams, basePadrao).toString();
    window.history.replaceState(null, "", url);
    setCarregando(true);
    consultar(novo, 0, POR_VEZ)
      .then((dados) => {
        if (!dados) return;
        setItens(dados.itens);
        setContagens(dados.contagens);
        setFalhaAoCarregar(false);
        setCarregando(false);
      })
      .catch(() => {
        setFalhaAoCarregar(true);
        setCarregando(false);
      });
  }

  async function mostrarMais() {
    setCarregando(true);
    try {
      const dados = await consultar(filtroValido, itens.length, POR_VEZ);
      if (!dados) return;
      setItens((atuais) => {
        const ja = new Set(atuais.map((i) => i.id));
        return [...atuais, ...dados.itens.filter((i) => !ja.has(i.id))];
      });
      setContagens(dados.contagens);
      setFalhaAoCarregar(false);
    } catch {
      setFalhaAoCarregar(true);
    } finally {
      setCarregando(false);
    }
  }

  // Quem chama router.refresh() (excluir, mudar preço, novo envio) muda a hora da requisição: a
  // lista, que mora aqui, acompanha sem precisar de outro aviso.
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    void atualizarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a página recarrega.
  }, [agora]);

  // Fotos em processamento (o servidor as termina sozinho): uma consulta leve, só das contagens e
  // só com a aba visível. A lista só é pedida de novo quando alguma coisa mudou.
  const processandoNoEvento = contagens.evento.processando;
  const situacaoVista = useRef<(ContagensDoPainel["evento"] & { em: number }) | null>(null);
  const atualizarListaAgora = useRef(atualizarLista);
  useEffect(() => {
    atualizarListaAgora.current = atualizarLista;
  }, [atualizarLista]);
  useEffect(() => {
    if (processandoNoEvento === 0) return;
    const intervalo = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetch(`/api/painel/eventos/${eventoId}/situacao`)
        .then((r) => (r.ok ? r.json() : null))
        .then((agoraNoServidor: ContagensDoPainel["evento"] | null) => {
          if (!agoraNoServidor) return;
          const antes = situacaoVista.current;
          // A primeira consulta é só a referência do ritmo.
          if (!antes) {
            situacaoVista.current = { ...agoraNoServidor, em: Date.now() };
            return;
          }
          if (agoraNoServidor.processando === antes.processando) return;
          const passou = Date.now() - antes.em;
          const observado = ritmoObservado(antes.processando - agoraNoServidor.processando, passou);
          if (observado) setRitmo(observado);
          situacaoVista.current = { ...agoraNoServidor, em: Date.now() };
          void atualizarListaAgora.current();
          // Acabou: o cabeçalho da página (fotos prontas, liberadas) também precisa do novo total.
          if (agoraNoServidor.processando === 0) router.refresh();
        })
        .catch(() => {});
    }, CONSULTA_A_CADA_MS);
    return () => clearInterval(intervalo);
  }, [processandoNoEvento, eventoId, router]);

  const anoAtual = new Date(agora).getFullYear();
  const contagemLiberacao = contagens.liberacao;
  const contagemPastas = contagens.pastas;
  const dias = contagens.dias;
  const totalNoFiltro = contagens.total;

  // Seleção: os ids marcados, ou todas do filtro.
  const naPagina = itens;
  const paginaToda = naPagina.length > 0 && naPagina.every((i) => selecionados.has(i.id));
  const totalSelecionado = todasDoFiltro ? totalNoFiltro : selecionados.size;
  const temSelecao = todasDoFiltro || selecionados.size > 0;

  // Liberação: as não liberadas da seleção; sem seleção, todas as não liberadas do evento.
  const idsEscolhidos = [...selecionados].filter((id) => estadoDa(id) !== "liberada");
  const quantasEscolhidas = todasDoFiltro
    ? contagemLiberacao.agendada + contagemLiberacao.manual
    : idsEscolhidos.length;
  const naoLiberadasDoEvento = contagens.naoLiberadas;
  const temAgendada = !temSelecao
    ? contagens.agendadas > 0
    : todasDoFiltro
      ? contagemLiberacao.agendada > 0
      : idsEscolhidos.some((id) => estadoDa(id) === "agendada");
  // Próxima liberação agendada: a grade se atualiza sozinha nesse minuto.
  const proxima = contagens.proximaLiberacao;

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function alternar(id: string) {
    if (todasDoFiltro) {
      // Desmarcar uma foto sai do "todas do filtro" e volta para a lista de ids: as outras fotos
      // do filtro continuam marcadas, mesmo as que ainda não foram carregadas.
      const parametros = paramsDoFiltro(filtroValido);
      parametros.set("ids", "1");
      try {
        const resposta = await fetch(`/api/painel/eventos/${eventoId}/fotos?${parametros}`);
        if (!resposta.ok) throw new Error("Consulta recusada");
        const dados = (await resposta.json()) as {
          itens: { id: string; estadoLiberacao: EstadoLiberacao }[];
        };
        setConhecidasDeFora(new Map(dados.itens.map((i) => [i.id, i.estadoLiberacao])));
        setTodasDoFiltro(false);
        setSelecionados(new Set(dados.itens.map((i) => i.id).filter((i) => i !== id)));
      } catch {
        setAviso("Não foi possível desmarcar. Tente de novo.");
      }
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
    if (temSelecao && quantasEscolhidas === 0) {
      setResultado({ erro: "As fotos selecionadas já estão liberadas." });
      return;
    }
    startTransition(async () => {
      // "Todas deste filtro" vai como filtro, que o servidor reavalia num UPDATE só.
      const ids = temSelecao && !todasDoFiltro ? idsEscolhidos : null;
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
          ...(todasDoFiltro && { filtro: filtroValido }),
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
    ? `${quantasEscolhidas} ${quantasEscolhidas === 1 ? "foto escolhida" : "fotos escolhidas"} ainda não ${quantasEscolhidas === 1 ? "liberada" : "liberadas"}`
    : `todas as ${naoLiberadasDoEvento} ainda não liberadas`;

  const selecaoParaMover = todasDoFiltro
    ? ({ tipo: "filtro", filtro: filtroValido } as const)
    : { tipo: "ids" as const, ids: [...selecionados] };

  const noEvento = contagens.evento;
  const totalDoEvento = noEvento.pronta + noEvento.processando + noEvento.erro;

  return (
    <div className={`flex flex-col gap-4 ${podeLiberar && temSelecao ? "pb-32 sm:pb-0" : ""}`}>
      {proxima && <AtualizarNaHora alvo={proxima} />}
      {noEvento.processando > 0 && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground"
        >
          <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin" />
          <span>
            <strong className="tabular-nums">
              {numero.format(noEvento.processando)} processando
            </strong>
            {" · "}previsão de {textoDaPrevisao(noEvento.processando, ritmo)}. Pode fechar esta
            página: o servidor termina sozinho.
          </span>
        </p>
      )}
      {totalDoEvento > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <div role="group" aria-label="Filtrar pela situação" className="flex flex-wrap gap-2">
            {SITUACOES.filter(
              (s) =>
                s.valor === "todas" ||
                s.valor === "pronta" ||
                contagens.situacao[s.valor] > 0 ||
                filtroValido.situacao === s.valor,
            ).map((s) => (
              <Button
                key={s.valor}
                size="touch"
                variant={filtroValido.situacao === s.valor ? "default" : "outline"}
                aria-pressed={filtroValido.situacao === s.valor}
                onClick={() => setFiltro({ ...filtroValido, situacao: s.valor })}
              >
                {s.rotulo} ({numero.format(contagens.situacao[s.valor])})
              </Button>
            ))}
          </div>
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
                    {p.nome} ({numero.format(contagemPastas.porPasta[p.id] ?? 0)})
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
            {fotos(totalNoFiltro)} neste filtro
            {carregando && (
              <Loader2 aria-hidden="true" className="ml-1.5 inline size-3.5 animate-spin" />
            )}
            {(filtroValido.situacao !== "todas" ||
              filtroValido.liberacao !== "todas" ||
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
                      situacao: "todas",
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
          {falhaAoCarregar && (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível atualizar as fotos. Confira a conexão e tente de novo.
            </p>
          )}
        </div>
      )}

      {podeLiberar && naoLiberadasDoEvento > 0 && (
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

      {podeLiberar && totalNoFiltro > 0 && (
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
          {totalNoFiltro > naPagina.length && (
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
              Selecionar todas as {fotos(totalNoFiltro)} deste filtro
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
        itens={itens}
        pastas={pastas}
        selecao={
          podeLiberar
            ? {
                selecionados: todasDoFiltro ? new Set(itens.map((i) => i.id)) : selecionados,
                alternar: (id) => void alternar(id),
              }
            : undefined
        }
        capa={capaFotoId === undefined ? undefined : capa.escolha}
        vazio={totalDoEvento === 0 ? undefined : "Nenhuma foto neste filtro."}
        formatosMoldura={formatosMoldura}
        mostrando={itens.length}
        total={totalNoFiltro}
        carregandoMais={carregando}
        aoMostrarMais={() => void mostrarMais()}
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
                  <strong>Todas as {fotos(totalNoFiltro)}</strong> deste filtro estão selecionadas.
                </>
              ) : (
                <>
                  <strong>
                    {numero.format(totalSelecionado)}{" "}
                    {totalSelecionado === 1 ? "selecionada" : "selecionadas"}.
                  </strong>{" "}
                  {totalNoFiltro > totalSelecionado && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-left whitespace-normal"
                      onClick={() => {
                        setTodasDoFiltro(true);
                        setSelecionados(new Set());
                      }}
                    >
                      Selecionar todas as {fotos(totalNoFiltro)} deste filtro
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

/** O filtro nos parâmetros da consulta, sempre com a data escolhida (sem depender do padrão). */
function paramsDoFiltro(filtro: FiltroDoPainel) {
  const parametros = filtroParaUrl(filtro, new URLSearchParams(), filtro.base);
  parametros.set("data", filtro.base);
  return parametros;
}

const CLASSE_SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
