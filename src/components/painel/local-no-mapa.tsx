"use client";

import { useRef, useState, type RefObject } from "react";
import { MapPin } from "lucide-react";

import { DialogoMapa, type EscolhaNoMapa } from "@/components/painel/dialogo-mapa";
import { Button } from "@/components/ui/button";
import { coordenadasEmTexto, type PontoNoMapa } from "@/lib/mapa";

function campoDoFormulario(formulario: HTMLFormElement | null, nome: string) {
  const campo = formulario?.elements.namedItem(nome);
  return campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement ? campo : null;
}

/**
 * Campo "Local" com o botão "Escolher no mapa" (OpenStreetMap) ao lado e o resumo do ponto
 * escolhido embaixo. Guarda o ponto em campos ocultos (o servidor valida de novo). Editar o texto
 * do local à mão não apaga o ponto; só o "Remover".
 */
export function LocalNoMapa({
  inicial,
  formulario,
  campo,
}: {
  inicial: PontoNoMapa | null;
  formulario: RefObject<HTMLFormElement | null>;
  /** O <Input> do local, já com nome, valor inicial e mensagens de erro. */
  campo: React.ReactNode;
}) {
  const [ponto, setPonto] = useState<PontoNoMapa | null>(inicial);
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [consulta, setConsulta] = useState<string | null>(null);
  const botao = useRef<HTMLButtonElement>(null);

  function abrir() {
    // Sem ponto, o mapa começa na cidade digitada (quando houver).
    const cidade = campoDoFormulario(formulario.current, "cidade")?.value.trim();
    const estado = campoDoFormulario(formulario.current, "estado")?.value.trim();
    setConsulta(cidade ? [cidade, estado, "Brasil"].filter(Boolean).join(", ") : null);
    setAberto(true);
  }

  function confirmar(escolha: EscolhaNoMapa) {
    setPonto(escolha.ponto);
    const preencher = (nome: string, valor: string | null) => {
      const campo = campoDoFormulario(formulario.current, nome);
      if (campo && valor) campo.value = valor;
    };
    preencher("local", escolha.local);
    preencher("cidade", escolha.cidade);
    preencher("estado", escolha.estado);
    setAviso(
      `Local escolhido no mapa: ${escolha.ponto.enderecoMapa ?? coordenadasEmTexto(escolha.ponto)}.`,
    );
  }

  function remover() {
    setPonto(null);
    setAviso("Local no mapa removido. O texto do local continua no formulário.");
    campoDoFormulario(formulario.current, "local")?.focus();
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">{campo}</div>
        <Button
          ref={botao}
          type="button"
          variant="outline"
          size="touch"
          onClick={abrir}
          className="shrink-0"
        >
          <MapPin aria-hidden="true" data-icon="inline-start" />
          Escolher no mapa
        </Button>
      </div>
      {/* Campos ocultos: o servidor confere tudo de novo (src/lib/mapa.ts). */}
      <input type="hidden" name="latitude" value={ponto?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={ponto?.longitude ?? ""} />
      <input type="hidden" name="enderecoMapa" value={ponto?.enderecoMapa ?? ""} />
      <p role="status" className="sr-only">
        {aviso}
      </p>
      {ponto && (
        <div className="flex flex-wrap items-center gap-x-1 rounded-lg border bg-muted/40 py-1 pl-3 text-sm">
          <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 py-2 pl-1 break-words">
            <span className="sr-only">Local no mapa: </span>
            {ponto.enderecoMapa ?? `Ponto no mapa (${coordenadasEmTexto(ponto)})`}
          </span>
          <span className="flex">
            <button
              type="button"
              onClick={abrir}
              className="inline-flex h-11 items-center rounded-lg px-3 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Alterar
            </button>
            <button
              type="button"
              onClick={remover}
              className="inline-flex h-11 items-center rounded-lg px-3 font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Remover
            </button>
          </span>
        </div>
      )}
      <DialogoMapa
        aberto={aberto}
        aoMudarAberto={setAberto}
        inicial={ponto}
        consultaInicial={consulta}
        aoConfirmar={confirmar}
        focoAoFechar={botao}
      />
    </>
  );
}
