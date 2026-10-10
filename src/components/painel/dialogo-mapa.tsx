"use client";

import "leaflet/dist/leaflet.css";

import { Dialog } from "@base-ui/react/dialog";
import type * as Leaflet from "leaflet";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Loader2, MapPin, MapPinOff, Search, X } from "lucide-react";

import {
  buscarEnderecoAcao,
  enderecoDoPontoAcao,
} from "@/app/(fotografo)/painel/eventos/mapa-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CENTRO_DO_BRASIL,
  coordenadasEmTexto,
  MENSAGEM_BUSCA_INDISPONIVEL,
  type LugarNoMapa,
  type PontoNoMapa,
  type Uf,
} from "@/lib/mapa";
import { camadaOsm, carregarLeaflet, iconeDoMarcador } from "@/lib/mapa-leaflet";

/** O que volta para o formulário ao clicar em "Usar este local". */
export type EscolhaNoMapa = {
  ponto: PontoNoMapa;
  /** Nome do lugar ou rua e número; `null` mantém o que o fotógrafo escreveu. */
  local: string | null;
  cidade: string | null;
  estado: Uf | null;
};

type Marcacao = {
  latitude: number;
  longitude: number;
  endereco: string | null;
  nome: string | null;
  cidade: string | null;
  estado: Uf | null;
};

/** Espera depois de soltar o marcador antes de pedir o endereço (o Nominatim aceita 1/s). */
const ESPERA_ENDERECO_MS = 800;

/**
 * Dialog "Escolher no mapa", com OpenStreetMap: busca de endereço pelo servidor (Nominatim, no
 * Enter ou no botão "Buscar"), mapa com marcador arrastável (clicar no mapa também move) e o
 * endereço do ponto embaixo. O Leaflet só carrega quando o dialog abre.
 */
export function DialogoMapa({
  aberto,
  aoMudarAberto,
  inicial,
  consultaInicial,
  aoConfirmar,
  focoAoFechar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  inicial: PontoNoMapa | null;
  /** "Cidade, UF" digitados no formulário, para centralizar o mapa quando não há ponto. */
  consultaInicial: string | null;
  aoConfirmar: (escolha: EscolhaNoMapa) => void;
  focoAoFechar: RefObject<HTMLElement | null>;
}) {
  // Fica aqui (e não no painel) para o Esc com a lista aberta fechar só a lista.
  const [listaAberta, setListaAberta] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);

  return (
    <Dialog.Root
      open={aberto}
      onOpenChange={(abrir, detalhes) => {
        if (!abrir && detalhes.reason === "escape-key" && listaAberta) {
          detalhes.cancel();
          setListaAberta(false);
          return;
        }
        setListaAberta(false);
        aoMudarAberto(abrir);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-foreground/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute motion-reduce:transition-none" />
        <Dialog.Popup
          initialFocus={campoBusca}
          finalFocus={focoAoFechar}
          className="fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl bg-background text-foreground shadow-xl transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
        >
          <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
            <Dialog.Title className="text-base font-semibold sm:text-lg">
              Escolher o local no mapa
            </Dialog.Title>
            <Dialog.Close
              aria-label="Fechar"
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <PainelMapa
            inicial={inicial}
            consultaInicial={consultaInicial}
            listaAberta={listaAberta}
            setListaAberta={setListaAberta}
            campoBusca={campoBusca}
            aoConfirmar={(escolha) => {
              aoConfirmar(escolha);
              aoMudarAberto(false);
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Motor = { L: typeof Leaflet; mapa: Leaflet.Map; marcador: Leaflet.Marker };

/** Conteúdo do dialog. Monta ao abrir e desmonta ao fechar: cada abertura começa do zero. */
function PainelMapa({
  inicial,
  consultaInicial,
  listaAberta,
  setListaAberta,
  campoBusca,
  aoConfirmar,
}: {
  inicial: PontoNoMapa | null;
  consultaInicial: string | null;
  listaAberta: boolean;
  setListaAberta: (aberta: boolean) => void;
  campoBusca: RefObject<HTMLInputElement | null>;
  aoConfirmar: (escolha: EscolhaNoMapa) => void;
}) {
  const ids = useId();
  const idLista = `${ids}-resultados`;
  const divMapa = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  // Contadores: uma resposta atrasada não sobrescreve a mais nova.
  const pedidoPonto = useRef(0);
  const pedidoBusca = useRef(0);
  const espera = useRef<number | undefined>(undefined);

  const [mapaPronto, setMapaPronto] = useState(false);
  const [mapaFalhou, setMapaFalhou] = useState(false);
  const [marcacao, setMarcacao] = useState<Marcacao | null>(
    inicial
      ? {
          latitude: inicial.latitude,
          longitude: inicial.longitude,
          endereco: inicial.enderecoMapa,
          nome: null,
          cidade: null,
          estado: null,
        }
      : null,
  );
  const [procurandoEndereco, setProcurandoEndereco] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<LugarNoMapa[]>([]);
  const [ativa, setAtiva] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");

  function moverMarcador(lat: number, lng: number) {
    const m = motor.current;
    if (!m) return;
    m.marcador.setLatLng([lat, lng]);
    if (!m.mapa.hasLayer(m.marcador)) m.marcador.addTo(m.mapa);
  }

  /** Clique no mapa ou marcador arrastado: guarda o ponto e, depois de 800 ms, o endereço. */
  function marcarPonto(lat: number, lng: number) {
    moverMarcador(lat, lng);
    const n = ++pedidoPonto.current;
    setMarcacao({
      latitude: lat,
      longitude: lng,
      endereco: null,
      nome: null,
      cidade: null,
      estado: null,
    });
    setProcurandoEndereco(true);
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(async () => {
      const r = await enderecoDoPontoAcao(lat, lng).catch(() => null);
      if (n !== pedidoPonto.current) return;
      setProcurandoEndereco(false);
      if (!r || !r.ok) {
        setAviso(r?.erro ?? MENSAGEM_BUSCA_INDISPONIVEL);
        return;
      }
      const lugar = r.valor;
      if (!lugar) return;
      setAviso(null);
      setMarcacao({
        latitude: lat,
        longitude: lng,
        endereco: lugar.endereco || null,
        nome: lugar.nome,
        cidade: lugar.cidade,
        estado: lugar.estado,
      });
    }, ESPERA_ENDERECO_MS);
  }

  function enquadrar(lugar: Pick<LugarNoMapa, "latitude" | "longitude" | "caixa">) {
    const m = motor.current;
    if (!m) return;
    if (lugar.caixa) {
      const [sul, norte, oeste, leste] = lugar.caixa;
      m.mapa.fitBounds(
        [
          [sul, oeste],
          [norte, leste],
        ],
        { maxZoom: 17 },
      );
    } else {
      m.mapa.setView([lugar.latitude, lugar.longitude], 17);
    }
  }

  // Carrega o Leaflet e monta o mapa (uma vez por abertura do dialog).
  useEffect(() => {
    let cancelado = false;
    let observador: ResizeObserver | null = null;

    async function montar() {
      const L = await carregarLeaflet();
      if (cancelado || !divMapa.current) return;
      const centro: [number, number] = inicial
        ? [inicial.latitude, inicial.longitude]
        : [CENTRO_DO_BRASIL.lat, CENTRO_DO_BRASIL.lng];
      const mapa = L.map(divMapa.current, {
        center: centro,
        zoom: inicial ? 16 : CENTRO_DO_BRASIL.zoom,
      });
      camadaOsm(L, () => setMapaFalhou(true)).addTo(mapa);
      const marcador = L.marker(centro, {
        icon: iconeDoMarcador(L),
        draggable: true,
        title: "Local do evento. Arraste para ajustar.",
        alt: "Local do evento",
      });
      if (inicial) marcador.addTo(mapa);
      marcador.on("dragend", () => {
        const { lat, lng } = marcador.getLatLng();
        marcarPonto(lat, lng);
      });
      mapa.on("click", (e: Leaflet.LeafletMouseEvent) => marcarPonto(e.latlng.lat, e.latlng.lng));
      motor.current = { L, mapa, marcador };
      // O dialog abre com animação: o Leaflet precisa medir o tamanho final.
      observador = new ResizeObserver(() => mapa.invalidateSize());
      observador.observe(divMapa.current);
      setMapaPronto(true);

      // Sem ponto, centraliza na cidade digitada no formulário (mesma busca, com cache).
      if (!inicial && consultaInicial) {
        const r = await buscarEnderecoAcao(consultaInicial).catch(() => null);
        const cidade = r?.ok ? r.valor[0] : undefined;
        if (!cancelado && cidade && !motor.current?.mapa.hasLayer(marcador)) {
          if (cidade.caixa) {
            const [sul, norte, oeste, leste] = cidade.caixa;
            mapa.fitBounds([
              [sul, oeste],
              [norte, leste],
            ]);
          } else {
            mapa.setView([cidade.latitude, cidade.longitude], 12);
          }
        }
      }
    }

    montar().catch(() => {
      if (!cancelado) setMapaFalhou(true);
    });
    return () => {
      cancelado = true;
      observador?.disconnect();
      window.clearTimeout(espera.current);
      const m = motor.current;
      motor.current = null;
      try {
        m?.mapa.remove();
      } catch {
        // O dialog já está fechando; um erro aqui não pode derrubar a tela.
      }
    };
    // Monta uma vez por abertura; as funções acima só leem refs e mudam estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar() {
    const texto = busca.trim();
    if (texto.length < 3) {
      setAviso("Digite pelo menos 3 letras para buscar.");
      return;
    }
    const n = ++pedidoBusca.current;
    setBuscando(true);
    setAviso(null);
    const r = await buscarEnderecoAcao(texto).catch(() => null);
    if (n !== pedidoBusca.current) return;
    setBuscando(false);
    if (!r || !r.ok) {
      setResultados([]);
      setListaAberta(false);
      setAviso(r?.erro ?? MENSAGEM_BUSCA_INDISPONIVEL);
      setAnuncio("");
      return;
    }
    setResultados(r.valor);
    setAtiva(r.valor.length > 0 ? 0 : -1);
    setListaAberta(r.valor.length > 0);
    if (r.valor.length === 0) {
      setAviso("Nenhum lugar encontrado. Tente outro nome ou endereço, ou marque o ponto no mapa.");
    }
    setAnuncio(
      r.valor.length === 1
        ? "1 lugar encontrado. Use as setas para escolher."
        : `${r.valor.length} lugares encontrados. Use as setas para escolher.`,
    );
  }

  function escolher(lugar: LugarNoMapa) {
    ++pedidoPonto.current;
    window.clearTimeout(espera.current);
    setProcurandoEndereco(false);
    setListaAberta(false);
    setAviso(null);
    moverMarcador(lugar.latitude, lugar.longitude);
    enquadrar(lugar);
    setMarcacao({
      latitude: lugar.latitude,
      longitude: lugar.longitude,
      endereco: lugar.endereco || null,
      nome: lugar.nome,
      cidade: lugar.cidade,
      estado: lugar.estado,
    });
  }

  function teclar(e: React.KeyboardEvent<HTMLInputElement>) {
    const visivel = listaAberta && resultados.length > 0;
    if (e.key === "ArrowDown" && resultados.length > 0) {
      e.preventDefault();
      setListaAberta(true);
      setAtiva((i) => (i + 1) % resultados.length);
    } else if (e.key === "ArrowUp" && resultados.length > 0) {
      e.preventDefault();
      setListaAberta(true);
      setAtiva((i) => (i <= 0 ? resultados.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Nunca envia o formulário do evento.
      e.preventDefault();
      if (visivel && resultados[ativa]) escolher(resultados[ativa]);
      else void buscar();
    }
  }

  function confirmar() {
    if (!marcacao) return;
    aoConfirmar({
      ponto: {
        latitude: marcacao.latitude,
        longitude: marcacao.longitude,
        enderecoMapa: marcacao.endereco,
      },
      local: marcacao.nome,
      cidade: marcacao.cidade,
      estado: marcacao.estado,
    });
  }

  const listaVisivel = listaAberta && resultados.length > 0;
  const textoDoPonto = marcacao
    ? (marcacao.endereco ??
      (procurandoEndereco
        ? "Procurando o endereço…"
        : `Ponto marcado no mapa (${coordenadasEmTexto(marcacao)})`))
    : null;

  return (
    <>
      <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <Dialog.Description className="text-sm text-muted-foreground">
          Busque pelo nome do lugar ou pelo endereço, ou toque no mapa. Arraste o marcador para
          ajustar o ponto.
        </Dialog.Description>

        <div className="relative">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <label htmlFor={`${ids}-busca`} className="sr-only">
                Buscar lugar ou endereço
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={campoBusca}
                id={`${ids}-busca`}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={listaVisivel}
                aria-controls={idLista}
                aria-activedescendant={
                  listaVisivel && ativa >= 0 ? `${idLista}-${ativa}` : undefined
                }
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Endereço ou lugar"
                value={busca}
                maxLength={200}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setListaAberta(false);
                }}
                onKeyDown={teclar}
                onBlur={() => setListaAberta(false)}
                className="h-11 pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => void buscar()}
              disabled={buscando}
              className="w-full shrink-0 px-4 sm:w-auto"
            >
              {buscando ? (
                <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
              ) : (
                <Search aria-hidden="true" data-icon="inline-start" />
              )}
              Buscar
            </Button>
          </div>
          <ul
            id={idLista}
            role="listbox"
            aria-label="Lugares encontrados"
            hidden={!listaVisivel}
            className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {resultados.map((l, i) => (
              <li
                key={l.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={i === ativa}
                // mousedown: escolhe antes do blur do campo fechar a lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(l);
                }}
                onMouseEnter={() => setAtiva(i)}
                className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm ${i === ativa ? "bg-accent text-accent-foreground" : ""}`}
              >
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{l.nome ?? l.endereco}</span>
                  {l.nome && l.endereco && (
                    <span className="text-muted-foreground">{l.endereco}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
        {aviso && (
          <p role="alert" className="text-sm text-muted-foreground">
            {aviso}
          </p>
        )}

        <div className="relative isolate h-[min(360px,45dvh)] w-full overflow-hidden rounded-lg border bg-muted">
          <div
            ref={divMapa}
            role="region"
            aria-label="Mapa para escolher o local do evento"
            className="size-full"
          />
          {!mapaPronto && !mapaFalhou && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-6 animate-spin" />
              Carregando o mapa…
            </div>
          )}
          {mapaFalhou && (
            <div
              role="alert"
              className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 bg-muted p-6 text-center"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground">
                <MapPinOff aria-hidden="true" className="size-6" />
              </span>
              <p className="font-semibold">Não foi possível carregar o mapa</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Tente de novo mais tarde. Enquanto isso, preencha o local, a cidade e o estado à mão
                no formulário.
              </p>
            </div>
          )}
        </div>

        <p
          role="status"
          className="flex min-h-11 items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm"
        >
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          {textoDoPonto ? (
            <span>
              <span className="sr-only">Local escolhido: </span>
              {textoDoPonto}
            </span>
          ) : (
            <span className="text-muted-foreground">Nenhum ponto escolhido ainda.</span>
          )}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
        <Dialog.Close render={<Button type="button" variant="outline" size="touch" />}>
          Cancelar
        </Dialog.Close>
        <Button type="button" size="touch" disabled={!marcacao} onClick={confirmar}>
          <MapPin aria-hidden="true" data-icon="inline-start" />
          Usar este local
        </Button>
      </div>
    </>
  );
}
