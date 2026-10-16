"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import Link from "next/link";
import { Camera, Check, ChevronLeft, ChevronRight, Loader2, ShoppingCart, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { paginaDaGaleria } from "@/app/(publico)/eventos/[slug]/acoes";
import { AvisoVendoComoFotografo } from "@/components/carrinho/aviso-vendo-como-fotografo";
import { MAXIMO_ITENS, useCarrinho } from "@/components/carrinho/carrinho";
import { comprarFoto } from "@/components/galeria/comprar-foto";
import { FotoDesfocada, type ControleDaLanterna } from "@/components/galeria/foto-desfocada";
import { prepararPrevia } from "@/components/galeria/previa-desfocada";
import { enviarMetrica } from "@/components/metricas/registrar";
import type { FiltroGaleria } from "@/dados";
import type { Foto } from "@/dados/tipos";
import { formatarPreco } from "@/lib/formatar";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";
import { cn } from "@/lib/utils";
import {
  acaoDoGesto,
  encaixar,
  imagemDoVisualizador,
  indiceDaPosicao,
  partidaDaMiniatura,
  passoDaNavegacao,
  TOQUE_RAPIDO_MS,
  vizinhas,
  type AcaoDoGesto,
  type Paginas,
  type Retangulo,
} from "@/lib/visualizador";
import { trocarFotoAtual } from "@/lib/volta-da-galeria";

/** Duração da abertura e do fechamento (s): rápida, para não atrasar quem navega muito. */
const DURACAO = 0.26;
const SUAVE = [0.22, 1, 0.36, 1] as const;
const SEM_RECORTE = "inset(0px 0px 0px 0px round 0px)";
/** Abaixo disso (px) o arrasto ainda é um toque. */
const FOLGA_DO_TOQUE = 8;

export type FechamentoDoVisualizador = {
  foto: Foto;
  /** Página da galeria em que a foto está (`null` no resultado da busca). */
  pagina: number | null;
  /** Fotos dessa página, para a galeria rolar até a foto na volta. */
  ids: string[];
};

type Props = {
  slug: string;
  tituloEvento: string;
  /** Chave da entrada do histórico (galeria ou busca). */
  chave: string;
  /** Fotos da tela (só fotos; vídeo abre a própria página). */
  fotos: Foto[];
  indiceInicial: number;
  /** Página da galeria (sem ela, só navega na lista recebida, como no resultado da busca). */
  paginas: Paginas | null;
  filtro?: FiltroGaleria;
  /** Total de itens da galeria, para o "20 de 60". */
  total?: number;
  /** Nome público do autor, por `enviadaPor`. */
  autores: Record<string, string>;
  precoDe: (foto: Foto) => number | null;
  podeComprar: boolean;
  /**
   * Opção do evento: prévia desfocada com o círculo de revelação. Desligada (padrão), a prévia
   * aparece nítida, com a marca d'água, e tocar na foto só serve para os gestos.
   */
  previaDesfocada?: boolean;
  /** Onde estava a miniatura tocada, para o zoom de abertura (`null`: só aparece). */
  origem: Retangulo | null;
  /** Onde está a miniatura de uma foto na grade agora (para fechar voltando a ela). */
  retanguloDaMiniatura: (fotoId: string) => Retangulo | null;
  /** A galeria mandou fechar (voltar do navegador, ou depois do pedido de fechar). */
  fechando: boolean;
  /** Pedido de fechar (X, Esc, arrastar para baixo): a galeria decide como voltar. */
  aoPedirFechar: (estado: FechamentoDoVisualizador) => void;
  /** Fim da animação de fechar: a galeria tira o visualizador da tela. */
  aoFechado: (estado: FechamentoDoVisualizador) => void;
};

type PaginaCarregada = { fotos: Foto[]; autores: Record<string, string> };

type Gesto = {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  /** Sobre a foto, o dedo revela; fora dela, arrasta (troca de foto ou fecha). */
  modo: "revelar" | "arrastar";
  eixo: "x" | "y" | null;
};

/**
 * Visualizador da foto da galeria do evento (docs/arquitetura.md, "Galeria e busca"). Abre por
 * cima da galeria com um zoom a partir da miniatura e mostra a prévia DESFOCADA (com a marca
 * d'água; nunca o original): onde o dedo ou o mouse passa, aparece um círculo nítido
 * (`FotoDesfocada`). Embaixo, o cartão com o evento, o autor, o "Comprar · R$" (o mesmo
 * carrinho da página da foto) e "anterior"/"próxima".
 *
 * Gestos: sobre a foto, pressionar e arrastar revela; um deslize rápido (menos de 250 ms) troca
 * de foto ou fecha. Fora da foto, arrastar para os lados troca de foto e para baixo fecha. Teclado:
 * ← → e Esc. Perto do fim da página, pede a vizinha ao servidor pela mesma consulta paginada da
 * galeria. A URL acompanha a foto aberta (`/fotos/<id>`): o link e o recarregar abrem a página
 * da foto.
 */
export function VisualizadorFoto({
  slug,
  tituloEvento,
  chave,
  fotos,
  indiceInicial,
  paginas: paginasIniciais,
  filtro,
  total,
  autores: autoresIniciais,
  precoDe,
  podeComprar,
  previaDesfocada = false,
  origem,
  retanguloDaMiniatura,
  fechando,
  aoPedirFechar,
  aoFechado,
}: Props) {
  const reduzir = useReducedMotion() ?? false;
  const [lista, setLista] = useState(fotos);
  const [autores, setAutores] = useState(autoresIniciais);
  const [paginas, setPaginas] = useState(paginasIniciais);
  const [indice, setIndice] = useState(indiceInicial);
  const [direcao, setDirecao] = useState<1 | -1>(1);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [area, setArea] = useState<{ largura: number; altura: number } | null>(null);
  const montado = useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );
  const telaEstreita = useSyncExternalStore(assinarTelaEstreita, ehTelaEstreita, () => false);
  // Zoom de abertura: só na foto tocada, até a primeira troca de foto.
  const [abertura, setAbertura] = useState(() =>
    fotos[indiceInicial] ? { id: fotos[indiceInicial].id, origem } : null,
  );

  const raiz = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const imagemAtual = useRef<HTMLDivElement | null>(null);
  const lanterna = useRef<ControleDaLanterna>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const gesto = useRef<Gesto | null>(null);
  const cache = useRef(new Map<number, PaginaCarregada | Promise<PaginaCarregada | null>>());
  const filtroRef = useRef(filtro ?? {});

  // Fundo e controles: aparecem na abertura e somem ao arrastar para baixo e ao fechar.
  const presenca = useMotionValue(0);
  const deslocX = useMotionValue(0);
  const deslocY = useMotionValue(0);
  const opacidadeDoFundo = useTransform(() => {
    const y = Math.max(0, deslocY.get());
    return presenca.get() * (1 - Math.min(0.7, y / 400));
  });
  const opacidadeDosControles = useTransform(() => (deslocY.get() > 12 ? 0 : presenca.get()));

  const foto = lista[indice] ?? lista[0];
  const pagina = paginas?.pagina ?? null;
  const deslocamento = pagina ? (pagina - 1) * FOTOS_POR_PAGINA : 0;
  const posicao = deslocamento + indice + 1;
  const totalNaTela = total ?? lista.length;

  // Página inicial no cache, para voltar a ela sem pedir de novo.
  useEffect(() => {
    if (paginasIniciais) {
      cache.current.set(paginasIniciais.pagina, { fotos, autores: autoresIniciais });
    }
    // Só na abertura: depois a lista muda pelo próprio visualizador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tamanho da área da foto (muda ao girar o celular ou redimensionar a janela).
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setArea({ largura: r.width, altura: r.height });
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [montado]);

  // Trava a rolagem da galeria por baixo (sem pular a largura da barra de rolagem).
  useEffect(() => {
    const html = document.documentElement;
    const barra = window.innerWidth - html.clientWidth;
    const antes = { overflow: html.style.overflow, padding: html.style.paddingRight };
    html.style.overflow = "hidden";
    if (barra > 0) html.style.paddingRight = `${barra}px`;
    return () => {
      html.style.overflow = antes.overflow;
      html.style.paddingRight = antes.padding;
    };
  }, []);

  // Abertura: o fundo e os controles aparecem; o zoom da foto fica no `Slide`.
  useEffect(() => {
    const controle = animate(presenca, 1, { duration: reduzir ? 0.12 : 0.2, ease: "easeOut" });
    fechar.current?.focus({ preventScroll: true });
    return () => controle.stop();
  }, [presenca, reduzir]);

  // A URL acompanha a foto aberta (sem nova entrada no histórico) e conta a visita da foto.
  const idAtual = foto?.id;
  const idAnterior = useRef(idAtual);
  useEffect(() => {
    if (!idAtual) return;
    enviarMetrica({ tipo: "visita_foto", fotoId: idAtual });
    const de = idAnterior.current;
    idAnterior.current = idAtual;
    if (de === idAtual || fechando) return;
    if (window.location.pathname !== `/fotos/${idAtual}`) {
      window.history.replaceState({ clicouaiVisualizador: chave }, "", `/fotos/${idAtual}`);
    }
    if (de) trocarFotoAtual(slug, de, idAtual);
  }, [idAtual, chave, slug, fechando]);

  // Prepara a anterior e a próxima: baixa a prévia e já deixa o desfoque pronto na memória.
  useEffect(() => {
    if (!montado) return;
    for (const vizinha of vizinhas(lista, indice)) {
      void prepararPrevia(vizinha.id, imagemDoVisualizador(vizinha, telaEstreita)).catch(() => {});
    }
  }, [lista, indice, montado, telaEstreita]);

  const carregarPagina = useCallback(
    async (numero: number): Promise<PaginaCarregada | null> => {
      const guardada = cache.current.get(numero);
      if (guardada) return guardada;
      const pedido = paginaDaGaleria(slug, numero, filtroRef.current)
        .then((r) => {
          if (r.limitado || r.fotos.length === 0) {
            cache.current.delete(numero);
            if (r.limitado) setAviso("Muitas fotos abertas em pouco tempo. Espere alguns minutos.");
            return null;
          }
          const carregada = { fotos: r.fotos.filter((f) => f.tipo === "foto"), autores: r.autores };
          cache.current.set(numero, carregada);
          return carregada;
        })
        .catch(() => {
          cache.current.delete(numero);
          return null;
        });
      cache.current.set(numero, pedido);
      return pedido;
    },
    [slug],
  );

  // Perto do fim (ou do começo) da página, já pede a vizinha, para a troca ser imediata.
  useEffect(() => {
    if (!paginas) return;
    if (indice >= lista.length - 3 && paginas.pagina < paginas.totalPaginas) {
      void carregarPagina(paginas.pagina + 1);
    }
    if (indice <= 2 && paginas.pagina > 1) void carregarPagina(paginas.pagina - 1);
  }, [indice, lista.length, paginas, carregarPagina]);

  const ir = useCallback(
    async (sentido: 1 | -1) => {
      if (carregando || fechando) return;
      const passo = passoDaNavegacao(indice, lista.length, sentido, paginas);
      if (!passo) return;
      setAviso(null);
      setAbertura(null);
      setDirecao(sentido);
      if (passo.tipo === "indice") {
        setIndice(passo.indice);
        return;
      }
      setCarregando(true);
      const carregada = await carregarPagina(passo.pagina);
      setCarregando(false);
      if (!carregada || carregada.fotos.length === 0 || !paginas) return;
      setLista(carregada.fotos);
      setAutores((atuais) => ({ ...atuais, ...carregada.autores }));
      setPaginas({ pagina: passo.pagina, totalPaginas: paginas.totalPaginas });
      setIndice(indiceDaPosicao(passo.posicao, carregada.fotos.length));
    },
    [carregando, fechando, indice, lista.length, paginas, carregarPagina],
  );

  const estado = useCallback(
    (): FechamentoDoVisualizador => ({ foto, pagina, ids: lista.map((f) => f.id) }),
    [foto, pagina, lista],
  );

  const pedirFechar = useCallback(() => {
    if (!fechando) aoPedirFechar(estado());
  }, [fechando, aoPedirFechar, estado]);

  // Fechar: a foto volta para a miniatura (se ela está na tela) e o fundo some.
  useEffect(() => {
    if (!fechando) return;
    lanterna.current?.esconder();
    const el = imagemAtual.current;
    const destino = foto ? retanguloDaMiniatura(foto.id) : null;
    const animacoes: Promise<unknown>[] = [
      animate(presenca, 0, { duration: reduzir ? 0.12 : DURACAO * 0.9, ease: "easeIn" }).finished,
    ];
    if (el) {
      const atual = el.getBoundingClientRect();
      const partida =
        !reduzir && destino && dentroDaTela(destino)
          ? partidaDaMiniatura(destino, {
              x: atual.x,
              y: atual.y,
              largura: atual.width,
              altura: atual.height,
            })
          : null;
      animacoes.push(
        partida
          ? animate(
              el,
              { x: partida.x, y: partida.y, scale: partida.escala, clipPath: partida.recorte },
              { duration: DURACAO, ease: SUAVE },
            ).finished
          : animate(el, reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.94 }, {
              duration: reduzir ? 0.12 : 0.18,
              ease: "easeIn",
            }).finished,
      );
    }
    let ativo = true;
    void Promise.all(animacoes).then(() => {
      if (ativo) aoFechado(estado());
    });
    return () => {
      ativo = false;
    };
    // Roda uma vez, quando a galeria manda fechar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechando]);

  // Teclado: ← → navegam, Esc fecha, Tab fica dentro do visualizador.
  useEffect(() => {
    const aoApertar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        pedirFechar();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void ir(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        void ir(-1);
      } else if (e.key === "Tab" && raiz.current) {
        const focaveis = [
          ...raiz.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (focaveis.length === 0) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    document.addEventListener("keydown", aoApertar);
    return () => document.removeEventListener("keydown", aoApertar);
  }, [ir, pedirFechar]);

  function executar(acao: AcaoDoGesto) {
    if (acao === "fechar") {
      pedirFechar();
      return;
    }
    if (acao === "proxima" || acao === "anterior") {
      deslocX.jump(0);
      deslocY.jump(0);
      void ir(acao === "proxima" ? 1 : -1);
      return;
    }
    const volta = { duration: reduzir ? 0 : 0.2, ease: SUAVE };
    animate(deslocX, 0, volta);
    animate(deslocY, 0, volta);
  }

  // ---- Ponteiro: revelar (sobre a foto) ou arrastar (fora dela), sem re-render no movimento.

  function aoPressionar(e: React.PointerEvent<HTMLDivElement>) {
    if (fechando || carregando || gesto.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ponto = { x: e.clientX, y: e.clientY };
    const sobre = lanterna.current?.contem(ponto) ?? false;
    gesto.current = {
      id: e.pointerId,
      x0: ponto.x,
      y0: ponto.y,
      t0: e.timeStamp,
      modo: sobre ? "revelar" : "arrastar",
      eixo: null,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (sobre) lanterna.current?.revelar(ponto, e.pointerType !== "mouse");
  }

  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    const ponto = { x: e.clientX, y: e.clientY };
    const g = gesto.current;
    if (!g) {
      // Mouse sem botão: passar sobre a foto revela.
      if (e.pointerType === "mouse") {
        if (lanterna.current?.contem(ponto)) lanterna.current.revelar(ponto);
        else lanterna.current?.esconder();
      }
      return;
    }
    if (g.id !== e.pointerId) return;
    if (g.modo === "revelar") {
      lanterna.current?.revelar(ponto, e.pointerType !== "mouse");
      return;
    }
    const dx = ponto.x - g.x0;
    const dy = ponto.y - g.y0;
    if (!g.eixo && Math.hypot(dx, dy) > FOLGA_DO_TOQUE) {
      g.eixo = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    if (g.eixo === "x") deslocX.set(dx);
    else if (g.eixo === "y") deslocY.set(dy > 0 ? dy : dy * 0.25);
  }

  function aoSoltar(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null;
    const ponto = { x: e.clientX, y: e.clientY };
    const deslocamento = { x: ponto.x - g.x0, y: ponto.y - g.y0 };
    const dt = Math.max(1, e.timeStamp - g.t0);
    const velocidade = { x: (deslocamento.x / dt) * 1000, y: (deslocamento.y / dt) * 1000 };
    const toque = Math.hypot(deslocamento.x, deslocamento.y) <= FOLGA_DO_TOQUE;

    if (g.modo === "revelar") {
      // O mouse continua sobre a foto: segue revelando pelo passar do mouse.
      if (e.pointerType !== "mouse") lanterna.current?.esconder();
      // Deslize rápido sobre a foto também navega ou fecha (revelar é segurar e arrastar).
      executar(dt <= TOQUE_RAPIDO_MS && !toque ? acaoDoGesto(deslocamento, velocidade) : null);
      return;
    }
    // Toque simples fora da foto fecha, como no fundo de qualquer janela por cima.
    if (toque && dt < 400) {
      pedirFechar();
      return;
    }
    executar(acaoDoGesto(deslocamento, velocidade));
  }

  function aoCancelar() {
    gesto.current = null;
    lanterna.current?.esconder();
    executar(null);
  }

  if (!montado || !foto) return null;

  const temAnterior = passoDaNavegacao(indice, lista.length, -1, paginas) !== null;
  const temProxima = passoDaNavegacao(indice, lista.length, 1, paginas) !== null;
  const autor = autores[foto.enviadaPor] ?? null;
  const preco = precoDe(foto);
  const descricao = `Foto ${posicao} de ${tituloEvento}`;
  const tamanho = area
    ? encaixar(foto, { largura: area.largura - 24, altura: area.altura - 16 })
    : null;

  return createPortal(
    <div
      ref={raiz}
      role="dialog"
      aria-modal="true"
      aria-label={`${descricao}, ampliada`}
      className="fixed inset-0 z-50 flex flex-col text-white md:flex-row"
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-grafite"
        style={{ opacity: opacidadeDoFundo }}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <motion.div
          className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-2 px-2 sm:h-14 sm:px-4"
          style={{ opacity: opacidadeDosControles }}
        >
          <div className="flex items-center gap-2 pl-2">
            <p className="text-sm font-semibold text-white/85 tabular-nums" aria-live="polite">
              {posicao} de {totalNaTela}
              <span className="sr-only"> fotos</span>
            </p>
            <SeloDoCarrinho />
          </div>
          <button
            ref={fechar}
            type="button"
            onClick={pedirFechar}
            aria-label="Fechar e voltar para a galeria"
            className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-highlight"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </motion.div>

        <div
          ref={areaRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden"
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoCancelar}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse" && !gesto.current) lanterna.current?.esconder();
          }}
        >
          <motion.div className="absolute inset-0" style={{ x: deslocX, y: deslocY }}>
            <AnimatePresence initial={false} custom={direcao}>
              {tamanho && (
                <Slide
                  key={foto.id}
                  foto={foto}
                  descricao={descricao}
                  src={imagemDoVisualizador(foto, telaEstreita)}
                  tamanho={tamanho}
                  direcao={direcao}
                  reduzir={reduzir}
                  partida={abertura?.id === foto.id ? abertura.origem : null}
                  refImagem={imagemAtual}
                  lanterna={lanterna}
                  desfocada={previaDesfocada}
                  dica={
                    telaEstreita
                      ? "Toque e segure para revelar um detalhe da foto"
                      : "Passe o mouse para revelar um detalhe da foto"
                  }
                />
              )}
            </AnimatePresence>
          </motion.div>

          {carregando && (
            <span
              role="status"
              className="absolute inset-0 z-10 m-auto flex size-12 items-center justify-center rounded-full bg-black/50"
            >
              <Loader2
                aria-hidden="true"
                className="size-6 animate-spin motion-reduce:animate-none"
              />
              <span className="sr-only">Carregando mais fotos</span>
            </span>
          )}

          <motion.div style={{ opacity: opacidadeDosControles }}>
            {temAnterior && <BotaoSeta lado="anterior" aoClicar={() => void ir(-1)} />}
            {temProxima && <BotaoSeta lado="proxima" aoClicar={() => void ir(1)} />}
          </motion.div>
        </div>
      </div>

      <motion.aside
        aria-label="Comprar esta foto"
        className="relative z-10 shrink-0 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:flex md:w-[360px] md:flex-col md:justify-center md:px-5 md:pt-2 md:pb-3"
        style={{ opacity: opacidadeDosControles }}
      >
        {/* No celular, uma linha só (evento e autor pequenos ao lado do Comprar): a foto fica
            com quase toda a tela. A explicação e o anterior/próxima aparecem do tablet em diante
            (no celular, o deslize e as setas sobre a foto já navegam). */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-2 pl-3 backdrop-blur-md md:flex-col md:items-stretch md:gap-3 md:p-4 md:text-center">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-none">
            <p className="truncate text-sm font-bold md:text-base">{tituloEvento}</p>
            {autor && (
              <p className="flex items-center gap-1.5 text-xs text-white/75 md:justify-center md:text-sm">
                <Camera aria-hidden="true" className="size-3.5 shrink-0 text-highlight" />
                <span className="truncate">foto de {autor}</span>
              </p>
            )}
          </div>
          {podeComprar ? (
            <Comprar fotoId={foto.id} precoCentavos={preco} />
          ) : (
            <AvisoVendoComoFotografo />
          )}
          <p className="hidden text-xs leading-relaxed text-white/70 md:block">
            {previaDesfocada
              ? "Aqui a prévia fica desfocada e com a marca do ClicouAí."
              : "Aqui a prévia tem a marca do ClicouAí."}{" "}
            Comprando, você recebe a foto inteira, em alta resolução e sem marca d&apos;água.
          </p>
          {aviso && (
            <p role="status" className="hidden text-sm text-white/85 md:block">
              {aviso}
            </p>
          )}
          <nav aria-label="Outras fotos" className="hidden grid-cols-2 gap-2 md:grid">
            <button
              type="button"
              onClick={() => void ir(-1)}
              disabled={!temAnterior || carregando}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-white/10 text-sm font-semibold outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-highlight disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => void ir(1)}
              disabled={!temProxima || carregando}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-white/10 text-sm font-semibold outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-highlight disabled:opacity-40"
            >
              Próxima
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </nav>
        </div>
      </motion.aside>
    </div>,
    document.body,
  );
}

const TELA_ESTREITA = "(max-width: 767px)";
const semAssinatura = () => () => {};
function ehTelaEstreita() {
  return window.matchMedia(TELA_ESTREITA).matches;
}
function assinarTelaEstreita(aoMudar: () => void) {
  const consulta = window.matchMedia(TELA_ESTREITA);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

function dentroDaTela(r: Retangulo) {
  return r.y + r.altura > 0 && r.y < window.innerHeight && r.largura > 0;
}

const deslize = {
  entra: (d: number) => ({ x: `${d * 40}%`, opacity: 0 }),
  centro: { x: 0, opacity: 1 },
  sai: (d: number) => ({ x: `${d * -40}%`, opacity: 0 }),
};
const somenteOpacidade = {
  entra: { opacity: 0 },
  centro: { opacity: 1 },
  sai: { opacity: 0 },
};

/**
 * Uma foto no visualizador. A camada de fora desliza na troca de foto; a de dentro faz o zoom de
 * abertura a partir da miniatura (e o de fechamento, de volta a ela).
 */
function Slide({
  foto,
  descricao,
  src,
  tamanho,
  direcao,
  reduzir,
  partida,
  refImagem,
  lanterna,
  desfocada,
  dica,
}: {
  foto: Foto;
  descricao: string;
  src: string;
  tamanho: { largura: number; altura: number };
  direcao: 1 | -1;
  reduzir: boolean;
  partida: Retangulo | null;
  refImagem: React.RefObject<HTMLDivElement | null>;
  lanterna: React.RefObject<ControleDaLanterna | null>;
  desfocada: boolean;
  dica: string;
}) {
  const interno = useRef<HTMLDivElement>(null);
  // Saindo (troca de foto), larga a lanterna para a foto que entra.
  const presente = useIsPresent();

  useLayoutEffect(() => {
    const el = interno.current;
    if (!el || !partida) return;
    if (reduzir) {
      animate(el, { opacity: [0, 1] }, { duration: 0.12 });
      return;
    }
    const r = el.getBoundingClientRect();
    const inicio = partidaDaMiniatura(partida, {
      x: r.x,
      y: r.y,
      largura: r.width,
      altura: r.height,
    });
    if (!inicio) return;
    animate(
      el,
      {
        x: [inicio.x, 0],
        y: [inicio.y, 0],
        scale: [inicio.escala, 1],
        clipPath: [inicio.recorte, SEM_RECORTE],
      },
      { duration: DURACAO, ease: SUAVE },
    );
    // Só na montagem: é a foto que abriu o visualizador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      custom={direcao}
      variants={reduzir ? somenteOpacidade : deslize}
      initial="entra"
      animate="centro"
      exit="sai"
      transition={{ duration: reduzir ? 0.12 : 0.22, ease: SUAVE }}
    >
      <div
        ref={presente ? refImagem : undefined}
        style={{ width: tamanho.largura, height: tamanho.altura }}
      >
        <div ref={interno} className="size-full">
          {desfocada ? (
            <FotoDesfocada
              ref={presente ? lanterna : undefined}
              id={foto.id}
              src={src}
              miniatura={foto.urlMiniatura}
              descricao={descricao}
              tamanho={tamanho}
              reduzir={reduzir}
              dica={dica}
            />
          ) : (
            // Opção desligada no evento: a prévia nítida, com a marca d'água nos pixels.
            // eslint-disable-next-line @next/next/no-img-element -- prévia protegida, sem otimizador
            <img
              src={src}
              alt={descricao}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="size-full rounded-xl object-contain imagem-protegida select-none"
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function BotaoSeta({ lado, aoClicar }: { lado: "anterior" | "proxima"; aoClicar: () => void }) {
  const Icone = lado === "anterior" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={aoClicar}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={lado === "anterior" ? "Foto anterior" : "Próxima foto"}
      className={cn(
        "absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm outline-none hover:bg-primary focus-visible:ring-3 focus-visible:ring-highlight md:flex",
        lado === "anterior" ? "left-4" : "right-4",
      )}
    >
      <Icone aria-hidden="true" className="size-7" />
    </button>
  );
}

/** "N no carrinho", no topo, quando o carrinho tem algo. */
function SeloDoCarrinho() {
  const ids = useCarrinho();
  if (ids.length === 0) return null;
  return (
    <Link
      href="/carrinho"
      className="rounded-full bg-highlight px-2.5 py-1 text-xs font-bold text-highlight-foreground outline-none focus-visible:ring-3 focus-visible:ring-white"
    >
      {ids.length} no carrinho
    </Link>
  );
}

/** "Comprar · R$": o mesmo carrinho da página da foto; já no carrinho, leva até ele. */
function Comprar({ fotoId, precoCentavos }: { fotoId: string; precoCentavos: number | null }) {
  const ids = useCarrinho();
  const noCarrinho = ids.includes(fotoId);
  const cheio = ids.length >= MAXIMO_ITENS;
  if (noCarrinho) {
    return (
      <Link
        href="/carrinho"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-highlight px-3 text-sm font-bold text-highlight outline-none hover:bg-highlight/10 focus-visible:ring-3 focus-visible:ring-white"
      >
        <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={3} />
        <span>
          No carrinho
          <span className="hidden font-medium text-white/80 md:inline"> · Ir para o carrinho</span>
        </span>
      </Link>
    );
  }
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <button
        type="button"
        disabled={cheio}
        onClick={() => comprarFoto(fotoId)}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-highlight px-4 font-bold whitespace-nowrap text-highlight-foreground shadow-lg outline-none hover:brightness-95 focus-visible:ring-3 focus-visible:ring-white disabled:opacity-50"
      >
        <ShoppingCart aria-hidden="true" className="size-5" />
        {precoCentavos === null ? "Comprar foto" : `Comprar · ${formatarPreco(precoCentavos)}`}
      </button>
      {cheio && (
        <p className="text-xs text-white/70">
          O carrinho chegou ao limite de {MAXIMO_ITENS} itens.
        </p>
      )}
    </div>
  );
}
