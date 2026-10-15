"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageUp,
  Loader2,
  Smartphone,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CORES_DE_ARTE,
  FORMATOS_DE_ARTE,
  modelosDoFormato,
  nomeDoModelo,
  type CorDeArte,
  type FormatoDeArte,
  type ModeloDeArte,
} from "@/lib/artes/opcoes";

import { reduzirImagem, TIPOS_DE_IMAGEM } from "./usar-imagem-da-loja";

type Aba = "capa" | "moldura" | "artes" | "banner";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "capa", rotulo: "Capa do evento" },
  { id: "moldura", rotulo: "Moldura" },
  { id: "artes", rotulo: "Editor de artes" },
  { id: "banner", rotulo: "Banner" },
];

/**
 * Aba Design do evento: a capa (o componente de escolha da capa entra como `capa`), a moldura
 * das fotos compradas (entra como `moldura`), o editor de
 * artes para story e feed e o banner horizontal. As artes são geradas no servidor
 * (/painel/eventos/[id]/divulgacao/[formato]) com o modelo, a cor e a imagem escolhidos.
 */
export function DesignDoEvento({
  eventoId,
  slug,
  publicado,
  capa,
  moldura,
}: {
  eventoId: string;
  slug: string;
  publicado: boolean;
  capa: ReactNode;
  moldura: ReactNode;
}) {
  const [aba, setAba] = useState<Aba>("capa");
  const ids = useId();
  return (
    <section
      aria-labelledby={`${ids}-titulo`}
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${ids}-titulo`} className="text-lg font-semibold">
          Design
        </h2>
        <p className="text-sm text-muted-foreground">Gerencie a parte visual do seu evento.</p>
      </div>
      <div
        role="tablist"
        aria-label="Partes do design"
        className="-mx-1 flex gap-1 overflow-x-auto border-b px-1"
      >
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`${ids}-aba-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls={`${ids}-painel-${a.id}`}
            onClick={() => setAba(a.id)}
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-selected:border-primary aria-selected:text-primary"
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${ids}-painel-${aba}`} aria-labelledby={`${ids}-aba-${aba}`}>
        {aba === "capa" ? (
          capa
        ) : aba === "moldura" ? (
          moldura
        ) : !publicado ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Publique o evento para criar as artes: elas levam o QR Code e o link da página do
            evento.
          </p>
        ) : (
          <EditorDeArtes
            key={aba}
            eventoId={eventoId}
            slug={slug}
            formatos={aba === "banner" ? ["banner"] : ["story", "feed"]}
          />
        )}
      </div>
    </section>
  );
}

const ICONE_DO_FORMATO = { story: Smartphone, feed: Square, banner: Square } as const;

function EditorDeArtes({
  eventoId,
  slug,
  formatos,
}: {
  eventoId: string;
  slug: string;
  formatos: FormatoDeArte[];
}) {
  const ids = useId();
  const [formato, setFormato] = useState<FormatoDeArte>(formatos[0]);
  const modelos = modelosDoFormato(formato);
  const [modelo, setModelo] = useState<ModeloDeArte>(modelos[0]);
  const [cor, setCor] = useState<CorDeArte>("azul");
  const [imagem, setImagem] = useState<{ nome: string; blob: Blob } | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ url: string; chave: string } | null>(null);
  const carrossel = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const busca = new URLSearchParams({ modelo, cor });
  const endereco = `/painel/eventos/${eventoId}/divulgacao/${formato}?${busca}`;
  const chave = `${endereco}|${imagem ? imagem.nome + imagem.blob.size : "capa"}`;
  const carregando = previa?.chave !== chave;
  const nomeDoArquivo = `${slug}-${formato}-${modelo}.png`;

  // Gera a arte: com a capa, um GET; com a imagem enviada, um POST (nada fica guardado).
  useEffect(() => {
    const controle = new AbortController();
    const pedido = imagem
      ? (() => {
          const dados = new FormData();
          dados.set("imagem", imagem.blob, "imagem.jpg");
          return fetch(endereco, { method: "POST", body: dados, signal: controle.signal });
        })()
      : fetch(endereco, { signal: controle.signal });
    pedido
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(await resposta.text());
        const url = URL.createObjectURL(await resposta.blob());
        setPrevia((anterior) => {
          if (anterior) URL.revokeObjectURL(anterior.url);
          return { url, chave };
        });
        setErro(null);
      })
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        setErro(
          e instanceof Error && e.message.length < 200
            ? e.message
            : "Não foi possível gerar a arte. Tente de novo.",
        );
        setPrevia((anterior) => anterior && { ...anterior, chave });
      });
    return () => controle.abort();
  }, [endereco, imagem, chave]);

  async function escolherImagem(arquivo: File | undefined) {
    if (!arquivo) return;
    setPreparando(true);
    setErro(null);
    try {
      setImagem({ nome: arquivo.name, blob: await reduzirImagem(arquivo, 2000) });
    } catch {
      setErro("Não deu para usar essa imagem. Escolha um JPG ou PNG.");
    } finally {
      setPreparando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  function rolar(direcao: 1 | -1) {
    carrossel.current?.scrollBy({
      left: direcao * carrossel.current.clientWidth * 0.8,
      behavior: "smooth",
    });
  }

  const banner = formato === "banner";
  return (
    <div className="flex flex-col gap-5 pt-1">
      <p className="text-sm text-muted-foreground">
        {banner
          ? "Banner horizontal para o link no WhatsApp, Facebook e site, com o QR Code do evento."
          : "Crie artes com modelos prontos e divulgue o seu evento nos stories e no feed."}
      </p>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Modelos</legend>
        <div className="relative">
          <div
            ref={carrossel}
            className="-mx-1 flex snap-x [scrollbar-width:thin] gap-3 overflow-x-auto scroll-smooth px-1 pb-2"
          >
            {modelos.map((m) => (
              <label
                key={m}
                className="relative flex shrink-0 cursor-pointer snap-start flex-col items-center gap-1.5"
              >
                <input
                  type="radio"
                  name={`${ids}-modelo`}
                  value={m}
                  checked={modelo === m}
                  onChange={() => setModelo(m)}
                  className="peer sr-only"
                />
                <span
                  className={`relative block overflow-hidden rounded-lg border-2 shadow-sm transition peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 ${
                    modelo === m ? "border-primary" : "border-transparent"
                  } ${banner ? "w-56" : "w-28 sm:w-32"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura estática do modelo */}
                  <img
                    src={`/artes/modelo-${m}.webp`}
                    alt=""
                    loading="lazy"
                    className="block w-full"
                  />
                  {modelo === m && (
                    <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check aria-hidden="true" className="size-4" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span
                  className={`text-sm ${modelo === m ? "font-semibold text-primary" : "text-muted-foreground"}`}
                >
                  {nomeDoModelo(m)}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            aria-label="Modelos anteriores"
            onClick={() => rolar(-1)}
            className="absolute top-1/3 -left-2 hidden size-9 items-center justify-center rounded-full border bg-background shadow sm:flex"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Próximos modelos"
            onClick={() => rolar(1)}
            className="absolute top-1/3 -right-2 hidden size-9 items-center justify-center rounded-full border bg-background shadow sm:flex"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          {formatos.length > 1 && (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Formato</legend>
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                {formatos.map((f) => {
                  const Icone = ICONE_DO_FORMATO[f];
                  const ativo = formato === f;
                  return (
                    <label
                      key={f}
                      className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
                        ativo
                          ? "border-primary text-primary"
                          : "border-transparent bg-muted text-muted-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${ids}-formato`}
                        value={f}
                        checked={ativo}
                        onChange={() => setFormato(f)}
                        className="sr-only"
                      />
                      <Icone aria-hidden="true" className="size-5" />
                      <span className="text-base font-semibold">{FORMATOS_DE_ARTE[f].nome}</span>
                      <span className="text-xs">{FORMATOS_DE_ARTE[f].proporcao}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Cor</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CORES_DE_ARTE) as CorDeArte[]).map((c) => (
                <label
                  key={c}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border-2 py-1 pr-3 pl-1 text-sm transition has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
                    cor === c ? "border-primary font-semibold" : "border-transparent bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${ids}-cor`}
                    value={c}
                    checked={cor === c}
                    onChange={() => setCor(c)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="size-6 rounded-full ring-1 ring-black/10"
                    style={{ background: CORES_DE_ARTE[c].fundo }}
                  />
                  {CORES_DE_ARTE[c].nome}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Imagem</p>
            <p className="text-xs text-muted-foreground">
              Sem escolher nada, a arte usa a capa do evento. A imagem enviada aqui vale só para
              esta arte.
            </p>
            <input
              ref={entrada}
              type="file"
              accept={TIPOS_DE_IMAGEM}
              className="sr-only"
              id={`${ids}-imagem`}
              onChange={(e) => void escolherImagem(e.target.files?.[0])}
            />
            {imagem ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
                <ImageUp aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{imagem.nome}</span>
                <Button variant="ghost" size="sm" onClick={() => setImagem(null)}>
                  <X aria-hidden="true" />
                  Usar a capa
                </Button>
              </div>
            ) : (
              <label
                htmlFor={`${ids}-imagem`}
                className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-primary/40 p-5 text-center text-sm text-muted-foreground hover:bg-primary/5 sm:max-w-sm"
              >
                {preparando ? (
                  <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
                ) : (
                  <ImageUp aria-hidden="true" className="size-6 text-primary" />
                )}
                <span className="font-medium text-foreground">Enviar outra imagem</span>
                JPG ou PNG
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="self-start text-sm font-semibold">Prévia</p>
          <div
            className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-muted ${
              banner
                ? "aspect-[1200/630]"
                : formato === "story"
                  ? "aspect-[9/16] max-w-72"
                  : "aspect-[4/5] max-w-80"
            }`}
          >
            {previa && (
              // eslint-disable-next-line @next/next/no-img-element -- arte gerada na hora (blob)
              <img
                src={previa.url}
                alt={`Prévia da arte, ${nomeDoModelo(modelo)}`}
                className={`size-full object-contain transition-opacity ${carregando ? "opacity-40" : ""}`}
              />
            )}
            {carregando && (
              <Loader2 aria-hidden="true" className="absolute size-8 animate-spin text-primary" />
            )}
          </div>
          {erro && (
            <p role="alert" className="text-center text-sm text-destructive">
              {erro}
            </p>
          )}
          <a
            href={previa && !carregando ? previa.url : undefined}
            download={nomeDoArquivo}
            aria-disabled={!previa || carregando}
            className={`inline-flex h-11 w-full max-w-80 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
              !previa || carregando ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Download aria-hidden="true" className="size-4" />
            Baixar arte
          </a>
        </div>
      </div>
    </div>
  );
}
