"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Loader2, MapPin, MapPinOff, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aoRecusarChave, carregarGoogleMaps, latLngDe } from "@/lib/google-maps";
import {
  CENTRO_DO_BRASIL,
  coordenadasEmTexto,
  deGeocoder,
  extrairCidadeEstado,
  nomeDoLocal,
  type ComponenteEndereco,
  type ConfigMapa,
  type PontoNoMapa,
  type Uf,
} from "@/lib/mapa";

/** O que volta para o formulário ao clicar em "Usar este local". */
export type EscolhaNoMapa = {
  ponto: PontoNoMapa;
  /** Nome do lugar ou rua e número; `null` mantém o que o fotógrafo escreveu. */
  local: string | null;
  cidade: string | null;
  estado: Uf | null;
};

type Marcacao = PontoNoMapa & { nome: string | null; componentes: ComponenteEndereco[] };

type Sugestao = {
  id: string;
  principal: string;
  secundario: string;
  previsao: google.maps.places.PlacePrediction;
};

/** Campos do lugar pedidos ao Google (cada campo entra na conta da Places API). */
const CAMPOS_DO_LUGAR = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "addressComponents",
  "viewport",
];

/**
 * Dialog "Escolher no mapa": busca com o Autocomplete da Places API (New), restrita ao Brasil e
 * cobrada como sessão; mapa com marcador arrastável (clicar no mapa também move); endereço
 * formatado embaixo. O Google Maps só carrega quando o dialog abre.
 */
export function DialogoMapa({
  aberto,
  aoMudarAberto,
  config,
  inicial,
  consultaInicial,
  aoConfirmar,
  focoAoFechar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  config: ConfigMapa;
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
        // Esc com a lista de sugestões aberta fecha só a lista.
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
            config={config}
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

type Fase = "carregando" | "pronto" | "erro";

type Motor = {
  mapa: google.maps.Map;
  marcador: google.maps.marker.AdvancedMarkerElement;
  geocoder: google.maps.Geocoder | null;
  places: google.maps.PlacesLibrary;
  sessao: google.maps.places.AutocompleteSessionToken;
};

/** Conteúdo do dialog. Monta ao abrir e desmonta ao fechar: cada abertura começa do zero. */
function PainelMapa({
  config,
  inicial,
  consultaInicial,
  listaAberta,
  setListaAberta,
  campoBusca,
  aoConfirmar,
}: {
  config: ConfigMapa;
  inicial: PontoNoMapa | null;
  consultaInicial: string | null;
  listaAberta: boolean;
  setListaAberta: (aberta: boolean) => void;
  campoBusca: RefObject<HTMLInputElement | null>;
  aoConfirmar: (escolha: EscolhaNoMapa) => void;
}) {
  const ids = useId();
  const idLista = `${ids}-sugestoes`;
  const idDescricao = `${ids}-descricao`;
  const divMapa = useRef<HTMLDivElement>(null);
  const maps = useRef<Motor | null>(null);
  // Contadores: uma resposta atrasada não sobrescreve a mais nova.
  const pedidoPonto = useRef(0);
  const pedidoBusca = useRef(0);
  const espera = useRef<number | undefined>(undefined);

  const [fase, setFase] = useState<Fase>("carregando");
  const [marcacao, setMarcacao] = useState<Marcacao | null>(
    inicial ? { ...inicial, nome: null, componentes: [] } : null,
  );
  const [procurandoEndereco, setProcurandoEndereco] = useState(false);
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [ativa, setAtiva] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [avisoBusca, setAvisoBusca] = useState<string | null>(null);

  function moverMarcador(lat: number, lng: number) {
    const g = maps.current;
    if (!g) return;
    g.marcador.position = { lat, lng };
    g.marcador.map = g.mapa;
  }

  /** Clique no mapa ou marcador arrastado: guarda o ponto e procura o endereço dele. */
  function marcarPonto({ lat, lng }: { lat: number; lng: number }) {
    moverMarcador(lat, lng);
    const n = ++pedidoPonto.current;
    setMarcacao({
      latitude: lat,
      longitude: lng,
      placeId: null,
      enderecoMapa: null,
      nome: null,
      componentes: [],
    });
    const geocoder = maps.current?.geocoder;
    if (!geocoder) return;
    setProcurandoEndereco(true);
    geocoder
      .geocode({ location: { lat, lng }, language: "pt-BR" })
      .then(({ results }) => {
        const r = results[0];
        if (n !== pedidoPonto.current || !r) return;
        setMarcacao({
          latitude: lat,
          longitude: lng,
          placeId: r.place_id || null,
          enderecoMapa: r.formatted_address || null,
          nome: null,
          componentes: deGeocoder(r.address_components),
        });
      })
      .catch(() => {})
      .finally(() => {
        if (n === pedidoPonto.current) setProcurandoEndereco(false);
      });
  }

  /** Lugar escolhido na busca ou clicado no mapa: busca os detalhes e centraliza nele. */
  async function usarLugar(lugar: google.maps.places.Place) {
    const g = maps.current;
    if (!g) return;
    const n = ++pedidoPonto.current;
    setProcurandoEndereco(true);
    try {
      await lugar.fetchFields({ fields: CAMPOS_DO_LUGAR });
      if (n !== pedidoPonto.current || !lugar.location) return;
      const { lat, lng } = latLngDe(lugar.location);
      moverMarcador(lat, lng);
      if (lugar.viewport) g.mapa.fitBounds(lugar.viewport);
      else {
        g.mapa.setCenter({ lat, lng });
        g.mapa.setZoom(17);
      }
      setMarcacao({
        latitude: lat,
        longitude: lng,
        placeId: lugar.id || null,
        enderecoMapa: lugar.formattedAddress ?? null,
        nome: lugar.displayName ?? null,
        componentes: (lugar.addressComponents ?? []).map((c) => ({
          longText: c.longText,
          shortText: c.shortText,
          types: c.types,
        })),
      });
    } catch {
      if (n === pedidoPonto.current)
        setAvisoBusca("Não foi possível abrir esse lugar. Tente outro.");
    } finally {
      if (n === pedidoPonto.current) setProcurandoEndereco(false);
    }
  }

  // Carrega o Google Maps e monta o mapa (uma vez por abertura do dialog).
  useEffect(() => {
    let cancelado = false;
    const pararDeOuvir = aoRecusarChave(() => setFase("erro"));

    async function montar() {
      await carregarGoogleMaps({ chave: config.chave, nonce: config.nonce });
      const [{ Map, RenderingType }, { AdvancedMarkerElement }, places] = await Promise.all([
        google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
        google.maps.importLibrary("places") as Promise<google.maps.PlacesLibrary>,
      ]);
      // O Geocoding é opcional: sem a API ativa, o endereço do ponto clicado não aparece.
      const geocoding = (await google.maps
        .importLibrary("geocoding")
        .catch(() => null)) as google.maps.GeocodingLibrary | null;
      if (cancelado || !divMapa.current) return;

      const centro = inicial ? { lat: inicial.latitude, lng: inicial.longitude } : CENTRO_DO_BRASIL;
      const mapa = new Map(divMapa.current, {
        center: { lat: centro.lat, lng: centro.lng },
        zoom: inicial ? 16 : CENTRO_DO_BRASIL.zoom,
        mapId: config.idDoMapa,
        // Raster: o vetorial usa WebGL e workers, que pedem mais da CSP.
        renderingType: RenderingType.RASTER,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
        clickableIcons: true,
      });
      const marcador = new AdvancedMarkerElement({
        map: inicial ? mapa : null,
        position: inicial ? centro : null,
        gmpDraggable: true,
        title: "Local do evento. Arraste para ajustar.",
      });
      marcador.addListener("dragend", () => {
        if (marcador.position) marcarPonto(latLngDe(marcador.position));
      });
      mapa.addListener("click", (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
        // Clique num lugar do mapa (parque, loja): usa o lugar, sem abrir o balão do Google.
        if ("placeId" in e && e.placeId) {
          e.stop();
          void usarLugar(new places.Place({ id: e.placeId, requestedLanguage: "pt-BR" }));
        } else if (e.latLng) {
          marcarPonto(latLngDe(e.latLng));
        }
      });
      maps.current = {
        mapa,
        marcador,
        geocoder: geocoding ? new geocoding.Geocoder() : null,
        places,
        sessao: new places.AutocompleteSessionToken(),
      };
      setFase((f) => (f === "erro" ? f : "pronto"));

      // Sem ponto, centraliza na cidade digitada no formulário (se o Geocoding estiver ativo).
      if (!inicial && consultaInicial && maps.current.geocoder) {
        maps.current.geocoder
          .geocode({ address: consultaInicial, componentRestrictions: { country: "BR" } })
          .then(({ results }) => {
            const viewport = results[0]?.geometry.viewport;
            if (!cancelado && viewport) mapa.fitBounds(viewport);
          })
          .catch(() => {});
      }
    }

    montar().catch(() => {
      if (!cancelado) setFase("erro");
    });
    return () => {
      cancelado = true;
      pararDeOuvir();
      window.clearTimeout(espera.current);
      const g = maps.current;
      maps.current = null;
      if (g) {
        // Com a chave recusada, o próprio Maps pode falhar ao desmontar; o erro não pode
        // derrubar a tela (um erro na limpeza do efeito chega à página de erro do React).
        try {
          g.marcador.map = null;
          google.maps.event.clearInstanceListeners(g.mapa);
          google.maps.event.clearInstanceListeners(g.marcador);
        } catch {
          // Nada a fazer: o dialog já está fechando.
        }
      }
    };
    // Monta uma vez por abertura; as funções abaixo leem o estado por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function digitar(texto: string) {
    setBusca(texto);
    setAvisoBusca(null);
    window.clearTimeout(espera.current);
    if (texto.trim().length < 3) {
      setSugestoes([]);
      setListaAberta(false);
      return;
    }
    espera.current = window.setTimeout(() => void sugerir(texto.trim()), 250);
  }

  async function sugerir(texto: string) {
    const g = maps.current;
    if (!g) return;
    const n = ++pedidoBusca.current;
    setBuscando(true);
    try {
      const { suggestions } = await g.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: texto,
        sessionToken: g.sessao,
        includedRegionCodes: ["br"],
        language: "pt-BR",
        region: "br",
        locationBias: g.mapa.getBounds() ?? undefined,
      });
      if (n !== pedidoBusca.current) return;
      const lista = suggestions.flatMap((s) =>
        s.placePrediction
          ? [
              {
                id: s.placePrediction.placeId,
                principal: s.placePrediction.mainText?.text ?? s.placePrediction.text.text,
                secundario: s.placePrediction.secondaryText?.text ?? "",
                previsao: s.placePrediction,
              },
            ]
          : [],
      );
      setSugestoes(lista);
      setAtiva(-1);
      setListaAberta(true);
      if (lista.length === 0)
        setAvisoBusca("Nenhum lugar encontrado. Tente outro nome ou endereço.");
    } catch {
      if (n === pedidoBusca.current) setAvisoBusca("A busca não respondeu. Tente de novo.");
    } finally {
      if (n === pedidoBusca.current) setBuscando(false);
    }
  }

  function escolherSugestao(s: Sugestao) {
    const g = maps.current;
    setBusca(s.principal);
    setListaAberta(false);
    setSugestoes([]);
    // O toPlace() leva o token da sessão; o fetchFields encerra a sessão. A próxima busca é outra.
    void usarLugar(s.previsao.toPlace());
    if (g) g.sessao = new g.places.AutocompleteSessionToken();
  }

  function teclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && sugestoes.length > 0) {
      e.preventDefault();
      setListaAberta(true);
      setAtiva((i) => (i + 1) % sugestoes.length);
    } else if (e.key === "ArrowUp" && sugestoes.length > 0) {
      e.preventDefault();
      setAtiva((i) => (i <= 0 ? sugestoes.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Nunca envia o formulário do evento.
      e.preventDefault();
      const s = sugestoes[ativa] ?? (sugestoes.length === 1 ? sugestoes[0] : undefined);
      if (listaAberta && s) escolherSugestao(s);
    }
  }

  function confirmar() {
    if (!marcacao) return;
    const { cidade, estado } = extrairCidadeEstado(marcacao.componentes);
    aoConfirmar({
      ponto: {
        latitude: marcacao.latitude,
        longitude: marcacao.longitude,
        placeId: marcacao.placeId,
        enderecoMapa: marcacao.enderecoMapa,
      },
      local: nomeDoLocal(marcacao.componentes, marcacao.nome),
      cidade,
      estado,
    });
  }

  const listaVisivel = listaAberta && sugestoes.length > 0;
  const textoDoPonto = marcacao
    ? (marcacao.enderecoMapa ??
      (procurandoEndereco
        ? "Procurando o endereço…"
        : `Ponto marcado no mapa (${coordenadasEmTexto(marcacao)})`))
    : null;

  return (
    <>
      <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <Dialog.Description id={idDescricao} className="text-sm text-muted-foreground">
          Busque pelo nome do lugar ou pelo endereço, ou toque no mapa. Arraste o marcador para
          ajustar o ponto.
        </Dialog.Description>

        <div className="relative">
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
            aria-activedescendant={listaVisivel && ativa >= 0 ? `${idLista}-${ativa}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Ex.: Parque Ibirapuera, São Paulo"
            value={busca}
            disabled={fase === "erro"}
            onChange={(e) => digitar(e.target.value)}
            onKeyDown={teclar}
            onBlur={() => setListaAberta(false)}
            onFocus={() => sugestoes.length > 0 && setListaAberta(true)}
            className="h-11 pr-10 pl-9"
          />
          {buscando && (
            <Loader2
              aria-hidden="true"
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
          <ul
            id={idLista}
            role="listbox"
            aria-label="Lugares encontrados"
            hidden={!listaVisivel}
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {sugestoes.map((s, i) => (
              <li
                key={s.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={i === ativa}
                // mousedown: escolhe antes do blur do campo fechar a lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolherSugestao(s);
                }}
                onMouseEnter={() => setAtiva(i)}
                className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm ${i === ativa ? "bg-accent text-accent-foreground" : ""}`}
              >
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{s.principal}</span>
                  {s.secundario && (
                    <span className="truncate text-muted-foreground">{s.secundario}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {avisoBusca && <p className="text-sm text-muted-foreground">{avisoBusca}</p>}

        <div className="relative h-[min(360px,45dvh)] w-full overflow-hidden rounded-lg border bg-muted">
          <div
            ref={divMapa}
            role="region"
            aria-label="Mapa para escolher o local do evento"
            className="size-full"
          />
          {fase === "carregando" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-6 animate-spin" />
              Carregando o mapa…
            </div>
          )}
          {fase === "erro" && (
            <div
              role="alert"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-6 text-center"
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
        <Button
          type="button"
          size="touch"
          disabled={!marcacao || fase !== "pronto"}
          onClick={confirmar}
        >
          <MapPin aria-hidden="true" data-icon="inline-start" />
          Usar este local
        </Button>
      </div>
    </>
  );
}
