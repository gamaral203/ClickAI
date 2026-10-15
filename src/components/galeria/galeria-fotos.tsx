"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { MAXIMO_ITENS } from "@/components/carrinho/carrinho";
import { BarraSelecao } from "@/components/galeria/barra-selecao";

import { Paginacao } from "@/components/galeria/paginacao";
import { PainelSelecao, rotuloQuantidade } from "@/components/galeria/painel-selecao";
import type { FiltroGaleria } from "@/dados";
import type { Foto } from "@/dados/tipos";
import { formatarPreco } from "@/lib/formatar";
import { formatarDuracao } from "@/lib/tipos-video";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";
import { cn } from "@/lib/utils";
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
};

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
}: Props) {
  const ids = fotos.map((f) => f.id);
  const chaveDosIds = ids.join();

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
              onClick={() => aoAbrirFoto(foto.id)}
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
          <span className="size-5 rounded-full border-2 border-white/60 shadow-md" />
        )}
      </button>
    </>
  );
}
