"use client";

import Image from "next/image";
import { useId, useRef, useState, useTransition } from "react";
import { Camera, Check, Copy, ImagePlus, Loader2, ScanFace, ShieldAlert } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import type { EventoDaBusca } from "@/dados";
import { formatarData } from "@/lib/formatar";
import { prepararSelfie } from "@/lib/preparar-selfie";
import type { FotoEncontrada, GrupoDaBusca } from "@/servicos/busca-por-rosto";

import { BaixarOriginal } from "./baixar-original";
import { VisualizadorFoto, type FotoParaVer } from "./visualizador-foto";

// Busca por rosto no painel (src/servicos/busca-por-rosto.ts). A foto escolhida fica só na
// memória desta aba: é reduzida aqui (sem os metadados), vai ao servidor só na busca e ao
// provedor de reconhecimento só durante a requisição. Nada é gravado.

type Escopo = "evento" | "recentes";

export function BuscaPorRosto({
  eventos,
  maximoRecentes,
  exemplo,
}: {
  eventos: EventoDaBusca[];
  maximoRecentes: number;
  /** Sem o provedor configurado (desenvolvimento): resultado simulado. */
  exemplo: boolean;
}) {
  const ids = useId();
  const [escopo, setEscopo] = useState<Escopo>("evento");
  const [eventoId, setEventoId] = useState(eventos[0]?.id ?? "");
  const [autorizacao, setAutorizacao] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    grupos: GrupoDaBusca[];
    consultados: number;
  } | null>(null);
  const [buscando, startTransition] = useTransition();
  const areaResultado = useRef<HTMLDivElement>(null);

  if (eventos.length === 0) {
    return (
      <p className="rounded-xl border p-5 text-sm text-muted-foreground">
        Você ainda não tem eventos. Crie um evento (ou aceite um convite de colaboração) e envie as
        fotos para buscar por rosto.
      </p>
    );
  }

  function buscar() {
    setErro(null);
    if (!arquivo) {
      setErro("Escolha ou tire uma foto do rosto da pessoa.");
      return;
    }
    if (!autorizacao) {
      setErro("Confirme que tem a autorização da pessoa para buscar pelo rosto dela.");
      return;
    }
    startTransition(async () => {
      const corpo = new FormData();
      corpo.set("escopo", escopo);
      if (escopo === "evento") corpo.set("eventoId", eventoId);
      corpo.set("autorizacao", "sim");
      corpo.set("foto", await prepararSelfie(arquivo), "rosto.jpg");
      try {
        const resposta = await fetch("/api/painel/busca-por-rosto", {
          method: "POST",
          body: corpo,
          cache: "no-store",
        });
        const dados = (await resposta.json().catch(() => null)) as {
          grupos?: GrupoDaBusca[];
          eventosConsultados?: number;
          erro?: string;
        } | null;
        if (!resposta.ok || !dados?.grupos) {
          setErro(dados?.erro ?? "A busca falhou. Tente de novo.");
          return;
        }
        setResultado({ grupos: dados.grupos, consultados: dados.eventosConsultados ?? 0 });
        requestAnimationFrame(() =>
          areaResultado.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } catch {
        setErro("Sem conexão. Confira a internet e tente de novo.");
      }
    });
  }

  const recentes = Math.min(maximoRecentes, eventos.length);

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
        className="flex flex-col gap-5 rounded-xl border p-4 sm:p-5"
        aria-describedby={`${ids}-lgpd`}
      >
        <EscolherFoto arquivo={arquivo} aoEscolher={setArquivo} desligado={buscando} />

        <fieldset disabled={buscando} className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Onde procurar</legend>
          <label
            className={cn(
              "flex cursor-pointer flex-col gap-2 rounded-xl border p-4 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              escopo === "evento" ? "border-primary bg-accent/50" : "hover:border-primary/50",
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name={`${ids}-escopo`}
                checked={escopo === "evento"}
                onChange={() => setEscopo("evento")}
                className="size-4 accent-primary"
              />
              Um evento
            </span>
            <select
              aria-label="Evento"
              value={eventoId}
              onChange={(e) => {
                setEventoId(e.target.value);
                setEscopo("evento");
              }}
              className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
            >
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo} · {formatarData(e.inicioEm)}
                  {e.donoNome ? ` · colaboração` : ""}
                </option>
              ))}
            </select>
          </label>
          <label
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-xl border p-4 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              escopo === "recentes" ? "border-primary bg-accent/50" : "hover:border-primary/50",
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name={`${ids}-escopo`}
                checked={escopo === "recentes"}
                onChange={() => setEscopo("recentes")}
                className="size-4 accent-primary"
              />
              Meus eventos recentes
            </span>
            <span className="text-sm text-muted-foreground">
              Procura em até {recentes}{" "}
              {recentes === 1 ? "evento mais recente" : "eventos mais recentes"} com rostos
              cadastrados
              {eventos.length > maximoRecentes
                ? ` (de ${eventos.length}). Para um evento mais antigo, escolha-o acima.`
                : "."}{" "}
              Cada evento é uma busca a mais: demora um pouco mais e conta no seu limite de buscas.
            </span>
          </label>
        </fieldset>

        <div
          id={`${ids}-lgpd`}
          className="flex flex-col gap-3 rounded-lg border border-l-4 border-l-highlight bg-muted p-3 text-sm"
        >
          <p className="flex items-start gap-2 font-medium">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            Use apenas com autorização da pessoa fotografada.
          </p>
          <p className="text-muted-foreground">
            O rosto é dado pessoal sensível (LGPD). A foto que você enviar serve só para esta busca:
            vai ao serviço de reconhecimento e é descartada, sem ficar guardada no ClicouAí.
          </p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={autorizacao}
              onChange={(e) => setAutorizacao(e.target.checked)}
              disabled={buscando}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span>Tenho a autorização desta pessoa para buscar as fotos dela pelo rosto.</span>
          </label>
        </div>

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}

        <div>
          <Button type="submit" size="touch" disabled={buscando}>
            {buscando ? (
              <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <ScanFace aria-hidden="true" data-icon="inline-start" />
            )}
            {buscando ? "Buscando…" : "Buscar fotos"}
          </Button>
        </div>
        {exemplo && (
          <p className="text-xs text-muted-foreground">
            Ambiente de desenvolvimento: sem o serviço de reconhecimento, o resultado é simulado com
            os dados de exemplo.
          </p>
        )}
      </form>

      <div ref={areaResultado} aria-live="polite" className="scroll-mt-24">
        {resultado && <Resultado grupos={resultado.grupos} consultados={resultado.consultados} />}
      </div>
    </div>
  );
}

function EscolherFoto({
  arquivo,
  aoEscolher,
  desligado,
}: {
  arquivo: File | null;
  aoEscolher: (arquivo: File | null) => void;
  desligado: boolean;
}) {
  const ids = useId();
  const [previa, setPrevia] = useState<string | null>(null);

  function escolher(lista: FileList | null) {
    const novo = lista?.[0] ?? null;
    if (previa) URL.revokeObjectURL(previa);
    // Prévia local (blob: desta aba); nada sai do aparelho até a busca.
    setPrevia(novo ? URL.createObjectURL(novo) : null);
    aoEscolher(novo);
  }

  const botao =
    "inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:border-primary/50 hover:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:pointer-events-none has-disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Foto do rosto da pessoa</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {previa ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), não otimizável
            <img src={previa} alt="Foto escolhida" className="size-full object-cover" />
          ) : (
            <ScanFace aria-hidden="true" className="size-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={botao}>
            <input
              id={`${ids}-arquivo`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={desligado}
              onChange={(e) => escolher(e.target.files)}
              className="sr-only"
            />
            <ImagePlus aria-hidden="true" className="size-4" />
            {arquivo ? "Trocar foto" : "Escolher foto"}
          </label>
          <label className={cn(botao, "sm:hidden")}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={desligado}
              onChange={(e) => escolher(e.target.files)}
              className="sr-only"
            />
            <Camera aria-hidden="true" className="size-4" />
            Usar a câmera
          </label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Um rosto bem visível, de frente. A foto é reduzida no seu aparelho antes de ir para a busca.
      </p>
    </div>
  );
}

function Resultado({ grupos, consultados }: { grupos: GrupoDaBusca[]; consultados: number }) {
  const total = grupos.reduce((s, g) => s + g.minhas.length + g.deOutros.length, 0);
  if (consultados === 0) {
    // Nenhum evento do escopo tem rosto cadastrado: o servidor nem chamou o reconhecimento.
    return (
      <p className="rounded-xl border p-5 text-sm text-muted-foreground">
        Nenhum rosto cadastrado ainda nos eventos escolhidos. Confira, no evento, o quadro “Busca
        por selfie”.
      </p>
    );
  }
  if (total === 0) {
    return (
      <p className="rounded-xl border p-5 text-sm text-muted-foreground">
        Nenhuma foto encontrada {consultados > 1 ? `nos ${consultados} eventos` : "neste evento"}.
        Tente outra foto, com o rosto mais visível, ou outro evento.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">
        {total} {total === 1 ? "foto encontrada" : "fotos encontradas"}
      </h2>
      {grupos.map((grupo) => (
        <GrupoDoEvento key={grupo.evento.id} grupo={grupo} />
      ))}
    </div>
  );
}

function GrupoDoEvento({ grupo }: { grupo: GrupoDaBusca }) {
  const ids = useId();
  const [aberta, setAberta] = useState<number | null>(null);
  const todas = [...grupo.minhas, ...grupo.deOutros];
  const paraVer: FotoParaVer[] = todas.map((f) => ({
    id: f.id,
    nomeArquivo: f.nomeArquivo,
    urlPrevia: f.urlPrevia,
    doAutor: f.propria,
    detalhe: f.propria ? undefined : `Foto de ${f.autorNome}`,
  }));
  const { evento } = grupo;

  return (
    <section
      aria-labelledby={`${ids}-titulo`}
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id={`${ids}-titulo`} className="text-lg font-semibold">
          {evento.titulo}
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatarData(evento.inicioEm)}
          {evento.donoNome ? ` · colaboração no evento de ${evento.donoNome}` : ""}
        </p>
      </div>

      {grupo.minhas.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">
            Suas fotos{" "}
            <span className="font-normal text-muted-foreground">({grupo.minhas.length})</span>
          </h4>
          <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {grupo.minhas.map((foto) => (
              <CartaoMinha key={foto.id} foto={foto} aoVer={() => setAberta(todas.indexOf(foto))} />
            ))}
          </ul>
        </div>
      )}

      {grupo.deOutros.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">
            De outros fotógrafos do evento{" "}
            <span className="font-normal text-muted-foreground">({grupo.deOutros.length})</span>
          </h4>
          <p className="text-xs text-muted-foreground">
            Só a prévia com marca d&apos;água: o original fica com quem enviou a foto.
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {grupo.deOutros.map((foto) => (
              <li key={foto.id} className="flex min-w-0 flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setAberta(todas.indexOf(foto))}
                  className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={`Ver a prévia de ${foto.nomeArquivo}, foto de ${foto.autorNome}`}
                >
                  <Miniatura foto={foto} />
                </button>
                <p className="truncate text-xs text-muted-foreground">Foto de {foto.autorNome}</p>
                <SeloSemelhanca nivel={foto.semelhanca} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <VisualizadorFoto
        eventoId={evento.id}
        fotos={paraVer}
        indice={aberta}
        aoMudar={setAberta}
        aoFechar={() => setAberta(null)}
      />
    </section>
  );
}

function Miniatura({ foto }: { foto: FotoEncontrada }) {
  return (
    <Image
      src={foto.urlMiniatura}
      alt={foto.nomeArquivo}
      fill
      sizes="(min-width: 1024px) 25vw, (min-width: 420px) 50vw, 100vw"
      className="object-cover"
    />
  );
}

function SeloSemelhanca({ nivel }: { nivel: FotoEncontrada["semelhanca"] }) {
  return (
    <span
      className={cn(
        "w-fit rounded-full px-2 py-0.5 text-xs font-medium",
        nivel === "alta" ? "bg-highlight text-highlight-foreground" : "bg-muted text-foreground",
      )}
    >
      Semelhança {nivel === "alta" ? "alta" : "média"}
    </span>
  );
}

function CartaoMinha({ foto, aoVer }: { foto: FotoEncontrada; aoVer: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function copiar() {
    setErro(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/fotos/${foto.id}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não deu para copiar. Abra a foto e copie o endereço.");
    }
  }

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-primary/40 bg-accent/30 p-3">
      <button
        type="button"
        onClick={aoVer}
        className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Ver ${foto.nomeArquivo}`}
      >
        <Miniatura foto={foto} />
        {foto.tipo === "video" && (
          <span className="absolute right-2 bottom-2 rounded-full bg-foreground/85 px-2 py-0.5 text-xs font-semibold text-background">
            Vídeo
          </span>
        )}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs" title={foto.nomeArquivo}>
          {foto.nomeArquivo}
        </p>
        <SeloSemelhanca nivel={foto.semelhanca} />
      </div>
      <div className="flex flex-col gap-2">
        <BaixarOriginal eventoId={foto.eventoId} fotoId={foto.id} nomeArquivo={foto.nomeArquivo} />
        {foto.liberada ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void copiar()}>
            {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copiado ? "Link copiado" : "Copiar link da foto"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Ainda não está no site (evento não publicado ou foto não liberada): o link não abre.
          </p>
        )}
        {erro && (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        )}
      </div>
    </li>
  );
}
