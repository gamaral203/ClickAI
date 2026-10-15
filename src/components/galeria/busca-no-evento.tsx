"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Hash, History, Loader2, Package, ScanFace, ShoppingCart } from "lucide-react";

import { buscarPorNumero, type ResultadoBusca } from "@/app/(publico)/eventos/[slug]/acoes";
import {
  adicionarAoCarrinho,
  escolherPacote,
  MAXIMO_ITENS,
  useCarrinho,
} from "@/components/carrinho/carrinho";
import { AvisoVendoComoFotografo } from "@/components/carrinho/aviso-vendo-como-fotografo";
import { enviarMetrica } from "@/components/metricas/registrar";
import { DialogoBuscaFacial } from "@/components/galeria/dialogo-busca-facial";
import { GaleriaFotos } from "@/components/galeria/galeria-fotos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarPreco } from "@/lib/formatar";
import { prepararSelfie } from "@/lib/preparar-selfie";
import {
  esquecerResultado,
  guardarResultado,
  lerResultado,
  VALIDADE_DA_BUSCA_MS,
} from "@/lib/resultado-da-busca";

const horaCurta = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

type Resultado =
  | (ResultadoBusca & {
      origem: "selfie" | "numero";
      /** Onde está o rosto em cada foto (só na busca por selfie com o provedor real). */
      recortes?: Record<
        string,
        { esquerda: number; topo: number; largura: number; altura: number }
      >;
    })
  | null;

export function BuscaNoEvento({
  slug,
  tituloEvento,
  temNumeros,
  podeComprar = true,
  precoFotoCentavos = null,
}: {
  slug: string;
  tituloEvento: string;
  /** Mostra a busca por número de peito (eventos de corrida). */
  temNumeros: boolean;
  /** `false` para quem vende: no lugar do pacote e do "Adicionar todas", um aviso. */
  podeComprar?: boolean;
  /** Preço do evento para foto sem preço próprio (o visualizador mostra no "Comprar"). */
  precoFotoCentavos?: number | null;
}) {
  const [aba, setAba] = useState<"selfie" | "numero">("selfie");
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroSelfie, setErroSelfie] = useState<string | null>(null);
  const [buscando, startTransition] = useTransition();
  /** Horário da busca, quando o resultado na tela veio do sessionStorage (página recarregada). */
  const [lembradoEm, setLembradoEm] = useState<number | null>(null);
  /** Aviso de que a busca do evento está sendo preparada (rostos arquivados, reindexando). */
  const [preparando, setPreparando] = useState<string | null>(null);
  const areaResultado = useRef<HTMLDivElement>(null);

  // Página recarregada (ou volta da página de uma foto): mostra o resultado da última busca por
  // selfie desta aba, se ainda vale, sem pedir outra selfie (src/lib/resultado-da-busca.ts).
  useEffect(() => {
    const salvo = lerResultado(slug);
    if (!salvo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o sessionStorage só existe no navegador, depois da hidratação
    setResultado({ fotos: salvo.fotos, pacote: salvo.pacote, origem: "selfie" });
    setLembradoEm(salvo.em);
  }, [slug]);

  function buscarDeNovo() {
    esquecerResultado(slug);
    setLembradoEm(null);
    setResultado(null);
    setErroSelfie(null);
    setDialogoAberto(true);
  }

  function buscarSelfie(arquivo: File) {
    setErroSelfie(null);
    startTransition(async () => {
      const corpo = new FormData();
      corpo.set("slug", slug);
      corpo.set("consentimento", "sim");
      corpo.set("selfie", await prepararSelfie(arquivo), "selfie.jpg");
      try {
        const resposta = await fetch("/api/busca-facial", { method: "POST", body: corpo });
        const dados = (await resposta.json()) as Partial<NonNullable<Resultado>> & {
          erro?: string;
          preparando?: boolean;
          mensagem?: string;
        };
        if (resposta.status === 202 && dados.preparando) {
          // Rostos do evento arquivados por inatividade: o servidor já começou a reindexar.
          setResultado(null);
          setLembradoEm(null);
          setPreparando(dados.mensagem ?? "Estamos preparando a busca por selfie deste evento.");
          setDialogoAberto(false);
          return;
        }
        if (!resposta.ok || !dados.fotos) {
          setErroSelfie(dados.erro ?? "A busca falhou. Tente de novo.");
          return;
        }
        setResultado({
          fotos: dados.fotos,
          pacote: dados.pacote ?? null,
          recortes: dados.recortes,
          origem: "selfie",
        });
        // Lembra só o resultado (fotos e pacote), nunca a selfie nem a posição do rosto.
        guardarResultado(slug, { fotos: dados.fotos, pacote: dados.pacote ?? null });
        setLembradoEm(null);
        setPreparando(null);
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
        const resultado = await buscarPorNumero(slug, numero);
        if (resultado.limitado) {
          setErro("Muitas buscas seguidas. Espere alguns minutos e tente de novo.");
          return;
        }
        setResultado({ ...resultado, origem: "numero" });
        setLembradoEm(null);
        setPreparando(null);
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

      {preparando && aba === "selfie" && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2">
            <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-primary" />
            {preparando}
          </p>
          <Button
            variant="outline"
            size="touch"
            className="w-fit shrink-0"
            disabled={buscando}
            onClick={() => {
              setErroSelfie(null);
              setDialogoAberto(true);
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {resultado && (
        <div ref={areaResultado} className="flex scroll-mt-4 flex-col gap-3">
          {lembradoEm !== null && (
            <div className="flex flex-col gap-2 rounded-lg bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-muted-foreground">
                <History aria-hidden="true" className="size-4 shrink-0" />
                Resultado da sua busca das {horaCurta.format(lembradoEm)}, guardado nesta aba por{" "}
                {VALIDADE_DA_BUSCA_MS / 60_000} minutos. A sua selfie não foi guardada.
              </p>
              <Button
                variant="outline"
                size="touch"
                className="w-fit shrink-0"
                disabled={buscando}
                onClick={buscarDeNovo}
              >
                <ScanFace aria-hidden="true" data-icon="inline-start" />
                Buscar de novo
              </Button>
            </div>
          )}
          <p role="status" className="font-medium">
            {resultado.fotos.length === 0
              ? resultado.origem === "selfie"
                ? "Não encontramos você nas fotos. Tente outra selfie, de frente e com boa luz."
                : "Nenhuma foto com esse número."
              : `${resultado.fotos.length} ${resultado.fotos.length === 1 ? "foto encontrada" : "fotos encontradas"}`}
          </p>
          {!podeComprar ? (
            resultado.fotos.length > 0 && <AvisoVendoComoFotografo />
          ) : resultado.pacote ? (
            <OfertaPacote oferta={resultado.pacote} />
          ) : (
            resultado.fotos.length > 1 && (
              <AdicionarTodas fotoIds={resultado.fotos.map((f) => f.id)} />
            )
          )}
          {resultado.fotos.length > 0 && (
            <GaleriaFotos
              key={resultado.fotos.map((f) => f.id).join()}
              slug={slug}
              tituloEvento={tituloEvento}
              fotos={resultado.fotos}
              recortes={resultado.recortes}
              compraNoVisualizador={podeComprar}
              precoPadraoCentavos={precoFotoCentavos}
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

/**
 * Sem pacote no evento: põe de uma vez todas as fotos encontradas no carrinho. O desconto
 * progressivo do fotógrafo, se houver, vale no carrinho.
 */
function AdicionarTodas({ fotoIds }: { fotoIds: string[] }) {
  const router = useRouter();
  const noCarrinho = useCarrinho();
  const faltam = fotoIds.filter((id) => !noCarrinho.includes(id));
  const cabe = noCarrinho.length + faltam.length <= MAXIMO_ITENS;
  if (faltam.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <Check aria-hidden="true" className="size-4" />
        Todas as suas fotos já estão no carrinho.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-background p-4 sm:flex-row sm:items-center">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <ShoppingCart aria-hidden="true" className="size-5" />
      </span>
      <div className="flex flex-1 flex-col">
        <p className="font-semibold">Leve todas as suas {fotoIds.length} fotos</p>
        <p className="text-sm text-muted-foreground">
          Coloque todas no carrinho de uma vez. Se o fotógrafo der desconto por quantidade, ele
          aparece no carrinho.
        </p>
      </div>
      <Button
        size="touch"
        disabled={!cabe}
        onClick={() => {
          faltam.forEach((id) => {
            adicionarAoCarrinho(id);
            enviarMetrica({ tipo: "carrinho", fotoId: id });
          });
          router.push("/carrinho");
        }}
      >
        Adicionar todas
      </Button>
    </div>
  );
}
