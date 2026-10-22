"use client";

import Image from "next/image";
import { useCallback, useId, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Download, FolderDown, Loader2 } from "lucide-react";
import { cn } from "cn";

import {
  liberarOriginaisDaGestaoAcao,
  loteDeOriginaisDaGestaoAcao,
} from "@/app/(admin)/admin/eventos/acoes";
import { CampoCodigoEmail } from "@/components/conta/campo-codigo-email";
import { BaixarEmLote } from "@/components/painel/baixar-em-lote";
import { Button } from "@/components/ui/button";
import type { FiltroFotosDaGestao, FotoDaGestao } from "@/dados";
import { formatarBytes } from "@/lib/formatar";

// Fotos de um evento na gestão (/admin/eventos/[id]), com o download dos originais pela gestão
// (src/servicos/originais-da-gestao.ts). A grade mostra só as prévias protegidas (com a marca
// d'água). "Baixar original" de cada foto e os lotes usam a mesma liberação da gestão (token de 3
// horas, com o código do e-mail se o MFA estiver ligado), guardada só na memória desta aba; o
// servidor confere o papel, a liberação e o limite de novo a cada foto e a cada lote.

/** Margem para não usar uma liberação perto de vencer (ela vale 3 horas no servidor). */
const VALIDADE_LOCAL_MS = 2.5 * 60 * 60 * 1000;
let guardada: { token: string; ate: number } | null = null;

type Liberacao = { ok: true; liberacao: string } | { ok: false; erro: string; pedeCodigo: boolean };

/** Liberação da gestão: a guardada nesta aba ou uma nova (com o código, se o MFA pedir). */
async function liberarGestao(codigo?: string): Promise<Liberacao> {
  if (guardada && guardada.ate > Date.now()) return { ok: true, liberacao: guardada.token };
  const resultado = await liberarOriginaisDaGestaoAcao(codigo).catch(() => null);
  if (!resultado) {
    return {
      ok: false,
      erro: "Não foi possível liberar o download. Tente de novo.",
      pedeCodigo: false,
    };
  }
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro, pedeCodigo: Boolean(resultado.pedeCodigo) };
  }
  guardada = { token: resultado.liberacao, ate: Date.now() + VALIDADE_LOCAL_MS };
  return { ok: true, liberacao: resultado.liberacao };
}

/** Pede a URL assinada (em JSON) e abre o link, que o R2 entrega como anexo. Erro ou `null`. */
async function baixarOriginalDaGestao(fotoId: string, token: string): Promise<string | null> {
  const busca = new URLSearchParams({ liberacao: token, formato: "json" });
  let resposta: Response;
  try {
    resposta = await fetch(`/api/gestao/original/${fotoId}?${busca}`, { cache: "no-store" });
  } catch {
    return "Sem conexão. Tente de novo.";
  }
  const dados = (await resposta.json().catch(() => null)) as { url?: string; erro?: string } | null;
  if (!resposta.ok || !dados?.url) {
    if (resposta.status === 403) guardada = null;
    return dados?.erro ?? "Não foi possível baixar. Tente de novo.";
  }
  const link = document.createElement("a");
  link.href = dados.url;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return null;
}

function BotaoOriginal({ fotoId, nomeArquivo }: { fotoId: string; nomeArquivo: string }) {
  const ids = useId();
  const [pedeCodigo, setPedeCodigo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function liberarEBaixar(comCodigo?: string) {
    setErro(null);
    startTransition(async () => {
      const liberacao = await liberarGestao(comCodigo);
      if (!liberacao.ok) {
        if (liberacao.pedeCodigo) setPedeCodigo(true);
        if (!liberacao.pedeCodigo || comCodigo) setErro(liberacao.erro);
        return;
      }
      setPedeCodigo(false);
      setCodigo("");
      const falha = await baixarOriginalDaGestao(fotoId, liberacao.liberacao);
      if (falha) setErro(falha);
    });
  }

  if (pedeCodigo) {
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          liberarEBaixar(codigo);
        }}
      >
        <CampoCodigoEmail
          finalidade="gestao_originais"
          id={`${ids}-codigo`}
          valor={codigo}
          aoMudar={setCodigo}
          enviarAoMostrar
        />
        <p className="text-xs text-muted-foreground">Libera o download pela gestão por 3 horas.</p>
        {erro && (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        )}
        <div className="flex gap-1.5">
          <Button type="submit" size="sm" disabled={pendente || !codigo.trim()} className="flex-1">
            {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : "Baixar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => {
              setPedeCodigo(false);
              setErro(null);
            }}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() => liberarEBaixar()}
        aria-label={`Baixar o original de ${nomeArquivo}, sem marca d'água`}
      >
        {pendente ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        Baixar original
      </Button>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

type Alvo = "selecionadas" | "filtro" | "evento";
type Resumo = { quantidade: number; bytes: number };

export function FotosDaGestao({
  eventoId,
  eventoSlug,
  fotos,
  filtro,
  filtrando,
  resumoFiltro,
  resumoEvento,
  caminhoDasPastas,
  pedeCodigo,
}: {
  eventoId: string;
  eventoSlug: string;
  fotos: FotoDaGestao[];
  filtro: FiltroFotosDaGestao;
  /** Há filtro de pasta ou de autor (senão "todas do filtro" é o mesmo que o evento). */
  filtrando: boolean;
  resumoFiltro: Resumo;
  resumoEvento: Resumo;
  /** "Largada › Bateria 1" por id da pasta. */
  caminhoDasPastas: Record<string, string>;
  pedeCodigo: boolean;
}) {
  const ids = useId();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<Alvo>(filtrando ? "filtro" : "evento");
  const [ocupado, setOcupado] = useState(false);

  const daPagina = useMemo(() => fotos.map((f) => f.id), [fotos]);
  const todasDaPagina = daPagina.length > 0 && daPagina.every((id) => selecionadas.has(id));
  const padrao: Alvo = filtrando ? "filtro" : "evento";

  function trocarSelecao(nova: Set<string>) {
    setSelecionadas(nova);
    setAlvo(nova.size > 0 ? "selecionadas" : padrao);
  }

  function alternar(id: string) {
    const nova = new Set(selecionadas);
    if (nova.has(id)) nova.delete(id);
    else nova.add(id);
    trocarSelecao(nova);
  }

  function alternarPagina() {
    const nova = new Set(selecionadas);
    for (const id of daPagina) {
      if (todasDaPagina) nova.delete(id);
      else nova.add(id);
    }
    trocarSelecao(nova);
  }

  const filtroDoAlvo = useMemo<FiltroFotosDaGestao>(
    () => (alvo === "evento" ? { excluidas: Boolean(filtro.excluidas) } : filtro),
    [alvo, filtro],
  );
  const liberar = useCallback(async (codigo?: string) => {
    const r = await liberarGestao(codigo);
    return r.ok ? r : { ok: false as const, erro: r.erro };
  }, []);
  const lote = useCallback(
    (liberacao: string, pedido: { depois?: string | null; ids?: string[] }) =>
      loteDeOriginaisDaGestaoAcao({ eventoId, filtro: filtroDoAlvo, liberacao, ...pedido }),
    [eventoId, filtroDoAlvo],
  );

  const resumo = alvo === "evento" ? resumoEvento : resumoFiltro;
  const somente = alvo === "selecionadas" ? [...selecionadas] : undefined;
  const textoResumo = (r: Resumo) =>
    `${r.quantidade} ${r.quantidade === 1 ? "arquivo" : "arquivos"}${
      r.bytes > 0 ? ` · cerca de ${formatarBytes(r.bytes)}` : ""
    }`;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby={`${ids}-lote`}
        className="flex flex-col gap-5 rounded-xl border p-4 sm:p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id={`${ids}-lote`} className="flex items-center gap-2 text-lg font-semibold">
            <FolderDown aria-hidden="true" className="size-5 text-primary" />
            Baixar originais (gestão)
          </h2>
          <p className="text-sm text-muted-foreground">
            Os arquivos saem em <code className="text-xs">{eventoSlug}/pasta/subpasta/</code>, com
            as excluídas numa pasta <code className="text-xs">excluidas</code>.
          </p>
        </div>
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-l-4 border-l-highlight bg-muted p-3 text-sm"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          São os originais sem marca d&apos;água, só para suporte e operação. Cada download fica
          registrado com o seu nome e o IP.
        </p>
        <fieldset disabled={ocupado} className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">O que baixar</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <OpcaoAlvo
              nome={`${ids}-alvo`}
              marcada={alvo === "selecionadas"}
              desligada={selecionadas.size === 0}
              aoEscolher={() => setAlvo("selecionadas")}
              titulo="As selecionadas"
              detalhe={
                selecionadas.size === 0
                  ? "Toque nas fotos abaixo para escolher."
                  : `${selecionadas.size} ${selecionadas.size === 1 ? "arquivo" : "arquivos"}`
              }
            />
            {filtrando && (
              <OpcaoAlvo
                nome={`${ids}-alvo`}
                marcada={alvo === "filtro"}
                aoEscolher={() => setAlvo("filtro")}
                titulo="Todas do filtro"
                detalhe={textoResumo(resumoFiltro)}
              />
            )}
            <OpcaoAlvo
              nome={`${ids}-alvo`}
              marcada={alvo === "evento"}
              aoEscolher={() => setAlvo("evento")}
              titulo="Todas do evento"
              detalhe={textoResumo(resumoEvento)}
            />
          </div>
        </fieldset>
        <BaixarEmLote
          chave={`${alvo}:${JSON.stringify(filtroDoAlvo)}`}
          resumo={resumo}
          somente={somente}
          nomeZip={`${eventoSlug}${alvo === "selecionadas" ? "-selecionadas" : alvo === "filtro" ? "-filtro" : ""}.zip`}
          pedeCodigo={pedeCodigo}
          finalidade="gestao_originais"
          ajudaCodigo="Sua conta tem a verificação em duas etapas ligada. O código libera o download pela gestão por 3 horas."
          liberar={liberar}
          lote={lote}
          rotulo={
            alvo === "selecionadas"
              ? "Baixar selecionadas"
              : alvo === "filtro"
                ? "Baixar todas do filtro"
                : "Baixar todas do evento"
          }
          aoMudarOcupado={setOcupado}
        />
      </section>

      {fotos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="touch" onClick={alternarPagina}>
            {todasDaPagina ? "Desmarcar esta página" : "Selecionar esta página"}
          </Button>
          {selecionadas.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="touch"
              onClick={() => trocarSelecao(new Set())}
            >
              Limpar seleção ({selecionadas.size})
            </Button>
          )}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {fotos.map((foto) => {
          const selecionada = selecionadas.has(foto.id);
          return (
            <li
              key={foto.id}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl border p-2 transition-colors motion-reduce:transition-none",
                selecionada && "border-primary bg-accent/40",
              )}
            >
              <label className="relative block aspect-square cursor-pointer overflow-hidden rounded-lg bg-muted">
                <input
                  type="checkbox"
                  checked={selecionada}
                  onChange={() => alternar(foto.id)}
                  aria-label={`Selecionar ${foto.nomeArquivo}`}
                  className="peer sr-only"
                />
                <Image
                  src={foto.urlMiniatura}
                  alt=""
                  fill
                  sizes="(min-width: 1536px) 16vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                />
                <span
                  aria-hidden="true"
                  className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full border-2 border-white bg-black/30 text-white shadow-sm peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/60"
                >
                  {selecionada && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="pointer-events-none absolute right-2 bottom-2 flex flex-wrap justify-end gap-1">
                  {foto.excluida && (
                    <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-white">
                      Excluída
                    </span>
                  )}
                  {foto.tipo === "video" && (
                    <span className="rounded-full bg-foreground/85 px-2 py-0.5 text-xs font-semibold text-background">
                      Vídeo
                    </span>
                  )}
                </span>
              </label>
              <div className="flex min-w-0 flex-col gap-0.5 text-xs">
                <p className="truncate font-medium" title={foto.nomeArquivo}>
                  {foto.nomeArquivo}
                </p>
                <p className="truncate text-muted-foreground" title={foto.autorNome}>
                  <span className="sr-only">Autor: </span>
                  {foto.autorNome}
                </p>
                <p className="truncate text-muted-foreground">
                  <span className="sr-only">Pasta: </span>
                  {foto.pastaId ? (caminhoDasPastas[foto.pastaId] ?? "Pasta") : "Sem pasta"}
                </p>
              </div>
              <BotaoOriginal fotoId={foto.id} nomeArquivo={foto.nomeArquivo} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OpcaoAlvo({
  nome,
  marcada,
  desligada,
  aoEscolher,
  titulo,
  detalhe,
}: {
  nome: string;
  marcada: boolean;
  desligada?: boolean;
  aoEscolher: () => void;
  titulo: string;
  detalhe: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-60 motion-reduce:transition-none",
        marcada ? "border-primary bg-accent/50" : "hover:border-primary/50",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        <input
          type="radio"
          name={nome}
          checked={marcada}
          disabled={desligada}
          onChange={aoEscolher}
          className="size-4 accent-primary"
        />
        {titulo}
      </span>
      <span className="text-sm text-muted-foreground tabular-nums">{detalhe}</span>
    </label>
  );
}
