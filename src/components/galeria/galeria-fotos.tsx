"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MAXIMO_ITENS } from "@/components/carrinho/carrinho";
import { BarraSelecao } from "@/components/galeria/barra-selecao";
import { IconeObturador } from "@/components/galeria/obturador";
import { Paginacao } from "@/components/galeria/paginacao";
import { PainelSelecao, rotuloQuantidade } from "@/components/galeria/painel-selecao";
import {
  VisualizadorFoto,
  type FechamentoDoVisualizador,
} from "@/components/galeria/visualizador-foto";
import type { FiltroGaleria } from "@/dados";
import type { Foto } from "@/dados/tipos";
import { formatarPreco } from "@/lib/formatar";
import { formatarDuracao } from "@/lib/tipos-video";
import { enderecoDaGaleria, FOTOS_POR_PAGINA } from "@/lib/galeria";
import { cn } from "@/lib/utils";
import type { Retangulo } from "@/lib/visualizador";
import { fotoParaRolar, guardarOrigem } from "@/lib/volta-da-galeria";

type Props = {
  slug: string;
  tituloEvento: string;
  /** Fotos na tela: a página da galeria ou o resultado da busca. */
  fotos: Foto[];
  /**
   * Galeria principal do evento: página atual, total e o filtro (que entra nos links das
   * páginas). Sem ela (resultado da busca), mostra todas as fotos recebidas, sem páginas.
   */
  paginacao?: { pagina: number; totalPaginas: number; total: number; filtro: FiltroGaleria };
  /** Texto quando não há fotos. */
  vazio?: { titulo: string; detalhe: string };
  /**
   * Onde está o rosto da pessoa em cada foto (resultado da busca por selfie): a miniatura fica
   * ampliada no rosto, para ela se reconhecer mais rápido.
   */
  recortes?: Record<string, CaixaDoRosto>;
  /** Preço do evento para foto sem preço próprio (só para o valor estimado da seleção). */
  precoPadraoCentavos?: number | null;
  /** Preço do evento para vídeo sem preço próprio. */
  precoVideoPadraoCentavos?: number | null;
  /**
   * Liga a seleção de várias fotos com o obturador e a barra no pé da tela. Desligado para conta
   * de fotógrafo ou gestor (que não compra) e no resultado da busca, que tem o próprio
   * "Adicionar todas".
   */
  podeComprar?: boolean;
  /**
   * Mostra o "Comprar" no visualizador da foto (padrão: `podeComprar`). O resultado da busca não
   * usa a seleção, mas quem pode comprar compra pelo visualizador.
   */
  compraNoVisualizador?: boolean;
  /** Nome público de quem fez cada foto, por `enviadaPor` (o visualizador mostra o autor). */
  autores?: Record<string, string>;
};

/** Clique comum (sem Ctrl/Cmd/Shift nem botão do meio, que abrem em outra aba ou janela). */
function cliqueSimples(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function retanguloDe(el: Element | null): Retangulo | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, largura: r.width, altura: r.height };
}

const SEM_AUTORES: Record<string, string> = {};

type CaixaDoRosto = { esquerda: number; topo: number; largura: number; altura: number };

/**
 * Estilo que amplia a imagem no rosto: centraliza o recorte nele e aproxima até o rosto ocupar
 * perto de metade do quadrado (no máximo 3x, para não pixelar a prévia).
 */
function estiloDoRecorte(c: CaixaDoRosto): React.CSSProperties {
  const x = (c.esquerda + c.largura / 2) * 100;
  const y = (c.topo + c.altura / 2) * 100;
  const escala = Math.min(3, Math.max(1, 0.45 / Math.max(c.largura, c.altura)));
  const origem = `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  return {
    objectPosition: origem,
    transformOrigin: origem,
    transform: `scale(${escala.toFixed(2)})`,
  };
}

const VAZIO_PADRAO = {
  titulo: "Ainda não há fotos neste evento.",
  detalhe: "O fotógrafo pode estar enviando agora. Volte daqui a pouco.",
};

const numero = new Intl.NumberFormat("pt-BR");

export function GaleriaFotos({
  slug,
  tituloEvento,
  fotos,
  paginacao,
  vazio = VAZIO_PADRAO,
  recortes,
  precoPadraoCentavos = null,
  precoVideoPadraoCentavos = null,
  podeComprar = false,
  compraNoVisualizador = podeComprar,
  autores = SEM_AUTORES,
}: Props) {
  const router = useRouter();
  const ids = fotos.map((f) => f.id);
  const chaveDosIds = ids.join();
  // Visualizador: só fotos (vídeo abre a página dele, com o player).
  const fotosDoVisualizador = fotos.filter((f) => f.tipo === "foto");
  const chaveDoHistorico = `${slug}:${paginacao ? "galeria" : "busca"}`;
  const [visualizador, setVisualizador] = useState<{
    indice: number;
    origem: Retangulo | null;
  } | null>(null);
  const [fechando, setFechando] = useState(false);
  /** Fechar numa foto de outra página: a galeria vai para ela depois da animação. */
  const irParaOutraPagina = useRef(false);

  // Seleção: guarda a foto inteira (não só o id) para o painel mostrar também as escolhidas em
  // outras páginas da galeria. Só a miniatura com marca d'água é usada.
  const [selecionadas, setSelecionadas] = useState<ReadonlyMap<string, Foto>>(() => new Map());
  const [painelAberto, setPainelAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const selecionando = podeComprar && selecionadas.size > 0;

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  function alternar(foto: Foto) {
    setAviso(null);
    setSelecionadas((atual) => {
      const nova = new Map(atual);
      if (nova.has(foto.id)) nova.delete(foto.id);
      else if (nova.size < MAXIMO_ITENS) nova.set(foto.id, foto);
      return nova;
    });
  }

  function remover(fotoId: string) {
    setSelecionadas((atual) => {
      const nova = new Map(atual);
      nova.delete(fotoId);
      return nova;
    });
  }

  function precoDe(foto: Foto) {
    return (
      foto.precoCentavos ??
      (foto.tipo === "video" ? precoVideoPadraoCentavos : precoPadraoCentavos) ??
      null
    );
  }

  const listaSelecionada = [...selecionadas.values()];
  // Estimativa com os preços cheios; o servidor recalcula o total e aplica os descontos.
  const totalCentavos = listaSelecionada.reduce<number | null>((soma, foto) => {
    const preco = precoDe(foto);
    return soma === null || preco === null ? null : soma + preco;
  }, 0);
  const resumo =
    aviso ??
    (listaSelecionada.length === 0
      ? "Selecione fotos"
      : totalCentavos === null
        ? rotuloQuantidade(listaSelecionada)
        : `${rotuloQuantidade(listaSelecionada)} · ${formatarPreco(totalCentavos)}`);

  const selecao = podeComprar && (
    <>
      <BarraSelecao
        quantidade={selecionadas.size}
        resumo={resumo}
        painelAberto={painelAberto}
        aoAbrir={() => setPainelAberto(true)}
        aoLimpar={() => setSelecionadas(new Map())}
      />
      <PainelSelecao
        aberto={painelAberto}
        aoMudarAberto={setPainelAberto}
        fotos={listaSelecionada}
        totalCentavos={totalCentavos}
        aoRemover={remover}
        aoAdicionar={(novas) => {
          setSelecionadas(new Map());
          setPainelAberto(false);
          setAviso(
            novas === 0
              ? "Já estavam no carrinho"
              : novas === 1
                ? "1 item no carrinho"
                : `${novas} itens no carrinho`,
          );
        }}
      />
    </>
  );

  // Volta da página da foto: rola até a foto que estava aberta, se ela está nesta tela. A página
  // em si vem da URL (`?pagina=N`). Pelo histórico, a foto vem do sessionStorage; pelo link, da
  // âncora `#foto-<id>` (a galeria chega depois do esqueleto do Suspense, então a rolagem da
  // âncora feita pelo Next não acharia a foto).
  useEffect(() => {
    const naTela = chaveDosIds.split(",");
    const daAncora = /^#foto-([0-9a-f-]{36})$/.exec(window.location.hash)?.[1];
    const alvo =
      fotoParaRolar(slug, naTela) ?? (daAncora && naTela.includes(daAncora) ? daAncora : null);
    if (!alvo) return;
    const quadro = requestAnimationFrame(() => {
      document
        .querySelector(`[data-foto="${CSS.escape(alvo)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => cancelAnimationFrame(quadro);
  }, [slug, chaveDosIds]);

  function aoAbrirFoto(fotoId: string) {
    guardarOrigem({ slug, fotoAtual: fotoId, ids });
  }

  /**
   * Abre o visualizador por cima da galeria. A URL vira a da foto (`/fotos/<id>`, pela History
   * API, que o Next acompanha): compartilhar e recarregar abrem a página da foto, e o voltar do
   * navegador (ou o gesto do celular) fecha o visualizador e volta à galeria no mesmo ponto.
   */
  function abrirVisualizador(foto: Foto, miniatura: Element) {
    const indice = fotosDoVisualizador.findIndex((f) => f.id === foto.id);
    if (indice < 0) return;
    aoAbrirFoto(foto.id);
    window.history.pushState({ clicouaiVisualizador: chaveDoHistorico }, "", `/fotos/${foto.id}`);
    irParaOutraPagina.current = false;
    setFechando(false);
    setVisualizador({ indice, origem: retanguloDe(miniatura) });
  }

  // Aberto: o voltar do navegador fecha; a rolagem fica onde está (sem a restauração automática,
  // que levaria a galeria de volta ao ponto da abertura e desencontraria a miniatura).
  const aberto = visualizador !== null;
  useEffect(() => {
    if (!aberto) return;
    const restauracao = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const aoVoltar = () => {
      if (!window.location.pathname.startsWith("/fotos/")) setFechando(true);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      window.history.scrollRestoration = restauracao;
    };
  }, [aberto]);

  function retanguloDaMiniatura(fotoId: string) {
    return retanguloDe(document.querySelector(`[data-foto="${CSS.escape(fotoId)}"] a`));
  }

  function aoPedirFechar(estado: FechamentoDoVisualizador) {
    const naTela = chaveDosIds.split(",").includes(estado.foto.id);
    if (naTela) {
      // A foto aberta agora está nesta página: deixa a miniatura na tela para a volta do zoom.
      document
        .querySelector(`[data-foto="${CSS.escape(estado.foto.id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "instant" });
      if (window.history.state?.clicouaiVisualizador === chaveDoHistorico) {
        // O popstate do voltar liga o `fechando`.
        window.history.back();
        return;
      }
      setFechando(true);
      return;
    }
    // Foto de outra página (o visualizador passou do fim da página): vai para ela ao fechar.
    irParaOutraPagina.current = true;
    setFechando(true);
  }

  function aoFechado(estado: FechamentoDoVisualizador) {
    setVisualizador(null);
    setFechando(false);
    const filtro = paginacao?.filtro ?? {};
    if (irParaOutraPagina.current && estado.pagina) {
      irParaOutraPagina.current = false;
      // Substitui a entrada da foto pela página da galeria em que ela está; a galeria nova
      // rola até a foto (sessionStorage e âncora, como na volta da página da foto).
      guardarOrigem({ slug, fotoAtual: estado.foto.id, ids: estado.ids });
      router.replace(
        enderecoDaGaleria(slug, filtro, {
          pagina: estado.pagina,
          ancora: `foto-${estado.foto.id}`,
        }),
        { scroll: false },
      );
      return;
    }
    if (window.location.pathname.startsWith("/fotos/")) {
      // Fechou sem voltar no histórico (a entrada não era a do visualizador): volta a URL.
      window.history.replaceState(
        null,
        "",
        enderecoDaGaleria(slug, filtro, { pagina: paginacao?.pagina ?? 1, ancora: false }),
      );
    }
    document
      .querySelector<HTMLElement>(`[data-foto="${CSS.escape(estado.foto.id)}"] a`)
      ?.focus({ preventScroll: true });
  }

  if (fotos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">{vazio.titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{vazio.detalhe}</p>
        {selecao}
      </div>
    );
  }

  // Posição da primeira foto na lista inteira, para o "Foto N" do texto alternativo.
  const deslocamento = paginacao ? (paginacao.pagina - 1) * FOTOS_POR_PAGINA : 0;
  const paginas = paginacao && paginacao.totalPaginas > 1 ? paginacao : null;

  return (
    <div className={cn("flex flex-col items-center gap-6", podeComprar && "pb-28")}>
      {paginas && (
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums" role="status">
            Fotos {numero.format(deslocamento + 1)} a {numero.format(deslocamento + fotos.length)}{" "}
            de {numero.format(paginas.total)}
          </p>
          <div className="sm:w-auto">
            <Paginacao
              slug={slug}
              filtro={paginas.filtro}
              pagina={paginas.pagina}
              totalPaginas={paginas.totalPaginas}
              rotulo="Páginas (topo da galeria)"
            />
          </div>
        </div>
      )}

      <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {fotos.map((foto, i) => (
          <li
            key={foto.id}
            id={`foto-${foto.id}`}
            data-foto={foto.id}
            className="group/card relative scroll-mt-4"
          >
            <Link
              onContextMenu={(e) => e.preventDefault()}
              href={`/fotos/${foto.id}`}
              onClick={(e) => {
                // Foto: o visualizador por cima da galeria. Vídeo, Ctrl/Cmd+clique e sem
                // JavaScript: a página da foto, como antes.
                if (foto.tipo === "foto" && cliqueSimples(e)) {
                  e.preventDefault();
                  abrirVisualizador(foto, e.currentTarget);
                  return;
                }
                aoAbrirFoto(foto.id);
              }}
              className="group relative block aspect-square overflow-hidden rounded-lg bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {recortes?.[foto.id] ? (
                // Ampliada no rosto: usa a prévia (maior) para não pixelar com o zoom.
                <Image
                  src={foto.urlPrevia}
                  alt={`Foto ${deslocamento + i + 1} de ${tituloEvento}, ampliada no seu rosto`}
                  fill
                  draggable={false}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover imagem-protegida"
                  style={estiloDoRecorte(recortes[foto.id])}
                />
              ) : (
                <Image
                  src={foto.urlMiniatura}
                  alt={`Foto ${deslocamento + i + 1} de ${tituloEvento}`}
                  fill
                  draggable={false}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover transition-transform duration-200 imagem-protegida group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              )}
              {foto.tipo === "video" && (
                // Vídeo: o play no meio e a duração no canto.
                <>
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-black/55 text-white"
                  >
                    <Play className="ml-0.5 size-6 fill-current" />
                  </span>
                  {foto.duracaoS ? (
                    <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
                      {formatarDuracao(foto.duracaoS)}
                    </span>
                  ) : null}
                  <span className="sr-only">Vídeo</span>
                </>
              )}
              {selecionadas.has(foto.id) && (
                // Selecionada: véu azul-profundo e borda verde-limão.
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg border-4 border-highlight bg-profundo/40"
                />
              )}
            </Link>
            {podeComprar && (
              <BotaoSelecionar
                numero={deslocamento + i + 1}
                selecionada={selecionadas.has(foto.id)}
                selecionando={selecionando}
                aoAlternar={() => alternar(foto)}
              />
            )}
          </li>
        ))}
      </ul>

      {paginas && (
        <Paginacao
          slug={slug}
          filtro={paginas.filtro}
          pagina={paginas.pagina}
          totalPaginas={paginas.totalPaginas}
        />
      )}
      {selecao}
      {visualizador && (
        <VisualizadorFoto
          slug={slug}
          tituloEvento={tituloEvento}
          chave={chaveDoHistorico}
          fotos={fotosDoVisualizador}
          indiceInicial={visualizador.indice}
          paginas={
            paginacao ? { pagina: paginacao.pagina, totalPaginas: paginacao.totalPaginas } : null
          }
          filtro={paginacao?.filtro}
          total={paginacao?.total}
          autores={autores}
          precoDe={precoDe}
          podeComprar={compraNoVisualizador}
          origem={visualizador.origem}
          retanguloDaMiniatura={retanguloDaMiniatura}
          fechando={fechando}
          aoPedirFechar={aoPedirFechar}
          aoFechado={aoFechado}
        />
      )}
    </div>
  );
}

/**
 * Obturador no canto da foto, que seleciona sem abrir a foto. Com alguma foto selecionada (modo
 * seleção), tocar em qualquer ponto da foto também seleciona; sem seleção, a foto abre como
 * antes. No computador o obturador aparece ao passar o mouse; no celular fica sempre visível.
 */
function BotaoSelecionar({
  numero,
  selecionada,
  selecionando,
  aoAlternar,
}: {
  numero: number;
  selecionada: boolean;
  selecionando: boolean;
  aoAlternar: () => void;
}) {
  return (
    <>
      {selecionando && (
        // Cobre a foto inteira no modo seleção; para leitor de tela, o botão do canto basta.
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={aoAlternar}
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 z-10 cursor-pointer rounded-lg"
        />
      )}
      <button
        type="button"
        onClick={aoAlternar}
        aria-pressed={selecionada}
        aria-label={
          selecionada ? `Tirar a foto ${numero} da seleção` : `Selecionar a foto ${numero}`
        }
        className={cn(
          "absolute top-1 right-1 z-20 flex size-11 items-center justify-center rounded-full transition-opacity duration-150 outline-none focus-visible:opacity-100 motion-reduce:transition-none",
          "[&:focus-visible>span]:ring-3 [&:focus-visible>span]:ring-highlight",
          !selecionando &&
            "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/card:opacity-100 [@media(hover:hover)]:group-hover/card:opacity-100",
        )}
      >
        {selecionada ? (
          <span className="flex size-7 items-center justify-center rounded-full bg-highlight text-highlight-foreground shadow-md">
            <Check aria-hidden="true" className="size-4" strokeWidth={3} />
          </span>
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full bg-profundo/50 shadow-md">
            <IconeObturador className="size-7" />
          </span>
        )}
      </button>
    </>
  );
}
