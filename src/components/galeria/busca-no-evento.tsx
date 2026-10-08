"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Hash, Loader2, Package, ScanFace } from "lucide-react";

import { buscarPorNumero, type ResultadoBusca } from "@/app/(publico)/eventos/[slug]/acoes";
import { escolherPacote } from "@/components/carrinho/carrinho";
import { DialogoBuscaFacial } from "@/components/galeria/dialogo-busca-facial";
import { GaleriaFotos } from "@/components/galeria/galeria-fotos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarPreco } from "@/lib/formatar";

/** Lado maior da selfie enviada: suficiente para o rosto e leve para o celular enviar. */
const LADO_MAXIMO = 1024;

/**
 * Reduz a selfie e a regrava em JPEG no próprio navegador. Além de enviar menos dados, o
 * canvas descarta os metadados (GPS, aparelho) da foto original.
 */
async function prepararSelfie(arquivo: File): Promise<Blob> {
  try {
    const imagem = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagem.width * escala);
    canvas.height = Math.round(imagem.height * escala);
    canvas.getContext("2d")?.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    return blob ?? arquivo;
  } catch {
    // Formato que o navegador não abre: vai o original e o servidor confere o tipo.
    return arquivo;
  }
}

type Resultado = (ResultadoBusca & { origem: "selfie" | "numero" }) | null;

export function BuscaNoEvento({
  slug,
  tituloEvento,
  temNumeros,
}: {
  slug: string;
  tituloEvento: string;
  /** Mostra a busca por número de peito (eventos de corrida). */
  temNumeros: boolean;
}) {
  const [aba, setAba] = useState<"selfie" | "numero">("selfie");
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroSelfie, setErroSelfie] = useState<string | null>(null);
  const [buscando, startTransition] = useTransition();
  const areaResultado = useRef<HTMLDivElement>(null);

  function buscarSelfie(arquivo: File) {
    setErroSelfie(null);
    startTransition(async () => {
      const corpo = new FormData();
      corpo.set("slug", slug);
      corpo.set("consentimento", "sim");
      corpo.set("selfie", await prepararSelfie(arquivo), "selfie.jpg");
      try {
        const resposta = await fetch("/api/busca-facial", { method: "POST", body: corpo });
        const dados = (await resposta.json()) as Partial<ResultadoBusca> & { erro?: string };
        if (!resposta.ok || !dados.fotos) {
          setErroSelfie(dados.erro ?? "A busca falhou. Tente de novo.");
          return;
        }
        setResultado({ fotos: dados.fotos, pacote: dados.pacote ?? null, origem: "selfie" });
        setDialogoAberto(false);
        // Leva a pessoa até as fotos encontradas, que aparecem abaixo do botão.
        requestAnimationFrame(() =>
          areaResultado.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } catch {
        setErroSelfie("Sem conexão. Confira a internet e tente de novo.");
      }
    });
  }

  function buscarNumero(formulario: FormData) {
    setErro(null);
    const numero = String(formulario.get("numero") ?? "").trim();
    if (!/^\d{1,6}$/.test(numero)) {
      setErro("Digite só os números do seu peito, sem letras.");
      return;
    }
    startTransition(async () => {
      try {
        setResultado({ ...(await buscarPorNumero(slug, numero)), origem: "numero" });
      } catch {
        setErro("A busca falhou. Tente de novo.");
      }
    });
  }

  const abaClasse = (ativa: boolean) =>
    `inline-flex h-11 items-center gap-2 rounded-lg px-4 font-medium ${ativa ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"}`;

  return (
    <section
      aria-labelledby="titulo-busca"
      className="flex flex-col gap-4 rounded-xl border bg-accent/40 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="titulo-busca" className="text-lg font-semibold">
          Encontre suas fotos
        </h2>
        <p className="text-sm text-muted-foreground">
          Use uma selfie ou uma foto sua e mostramos só as fotos em que você aparece.
        </p>
      </div>

      {temNumeros && (
        <div role="tablist" aria-label="Tipo de busca" className="flex gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={aba === "selfie"}
            onClick={() => setAba("selfie")}
            className={abaClasse(aba === "selfie")}
          >
            <ScanFace aria-hidden="true" className="size-4" />
            Selfie
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === "numero"}
            onClick={() => setAba("numero")}
            className={abaClasse(aba === "numero")}
          >
            <Hash aria-hidden="true" className="size-4" />
            Número de peito
          </button>
        </div>
      )}

      {aba === "selfie" ? (
        <>
          <Button
            size="touch"
            className="w-fit"
            disabled={buscando}
            onClick={() => {
              setErroSelfie(null);
              setDialogoAberto(true);
            }}
          >
            <ScanFace aria-hidden="true" data-icon="inline-start" />
            Buscar pelo meu rosto
          </Button>
          <DialogoBuscaFacial
            aberto={dialogoAberto}
            aoMudarAberto={setDialogoAberto}
            aoEscolher={buscarSelfie}
            buscando={buscando}
            erro={erroSelfie}
          />
        </>
      ) : (
        <form action={buscarNumero} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="numero">Número de peito</Label>
            <Input
              id="numero"
              name="numero"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="Ex.: 1027"
              className="h-11 sm:w-48"
            />
          </div>
          <Button type="submit" size="touch" disabled={buscando}>
            {buscando && (
              <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            )}
            Buscar
          </Button>
        </form>
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      {resultado && (
        <div ref={areaResultado} className="flex scroll-mt-4 flex-col gap-3">
          <p role="status" className="font-medium">
            {resultado.fotos.length === 0
              ? resultado.origem === "selfie"
                ? "Não encontramos você nas fotos. Tente outra selfie, de frente e com boa luz."
                : "Nenhuma foto com esse número."
              : `${resultado.fotos.length} ${resultado.fotos.length === 1 ? "foto encontrada" : "fotos encontradas"}`}
          </p>
          {resultado.pacote && <OfertaPacote oferta={resultado.pacote} />}
          {resultado.fotos.length > 0 && (
            <GaleriaFotos
              key={resultado.fotos.map((f) => f.id).join()}
              slug={slug}
              tituloEvento={tituloEvento}
              paginaInicial={{ fotos: resultado.fotos, proximoCursor: null }}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** "Todas as minhas fotos": põe as fotos encontradas no carrinho com o preço do pacote. */
function OfertaPacote({ oferta }: { oferta: NonNullable<ResultadoBusca["pacote"]> }) {
  const router = useRouter();
  const economia = oferta.normalCentavos - oferta.precoCentavos;
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-background p-4 sm:flex-row sm:items-center">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Package aria-hidden="true" className="size-5" />
      </span>
      <div className="flex flex-1 flex-col">
        <p className="font-semibold">
          Leve todas as {oferta.quantidade} fotos por {formatarPreco(oferta.precoCentavos)}
        </p>
        <p className="text-sm text-muted-foreground">
          <s>{formatarPreco(oferta.normalCentavos)}</s> · você economiza {formatarPreco(economia)}
        </p>
      </div>
      <Button
        size="touch"
        onClick={() => {
          escolherPacote(oferta.eventoId, oferta.token, oferta.fotoIds);
          router.push("/carrinho");
        }}
      >
        Comprar todas
      </Button>
    </div>
  );
}
