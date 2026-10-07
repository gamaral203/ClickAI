"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { salvarPacoteAcao, type EstadoPacote } from "@/app/(fotografo)/painel/eventos/vendas-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AvisoSalvo, Campo, Escolha, propsDeErro } from "./campos";

export type PacoteNoFormulario = {
  ativo: boolean;
  tipoPreco: "fixo" | "por_foto";
  preco: string;
  mostrarAPartirDe: string;
  expiraEm: string;
};

const inicial: EstadoPacote = {};

/** Pacote "todas as minhas fotos" do evento: aparece para quem achou as fotos pela busca. */
export function FormularioPacote({
  eventoId,
  pacote,
  precoFoto,
}: {
  eventoId: string;
  pacote: PacoteNoFormulario | null;
  /** Preço da foto avulsa no evento, já formatado, para a ajuda do campo. */
  precoFoto: string;
}) {
  const [estado, acao, salvando] = useActionState(salvarPacoteAcao, inicial);
  const [tipoPreco, setTipoPreco] = useState(pacote?.tipoPreco ?? "fixo");
  const erros = estado.erros ?? {};

  return (
    <form action={acao} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="eventoId" value={eventoId} />
      {estado.ok && <AvisoSalvo>Pacote salvo.</AvisoSalvo>}

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={pacote?.ativo ?? true}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        Oferecer o pacote depois da busca por selfie ou número de peito
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Como cobrar</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Escolha
            nome="tipoPreco"
            valor="fixo"
            marcado={tipoPreco === "fixo"}
            titulo="Preço fixo"
            descricao="Um valor por todas as fotos da pessoa, quantas forem"
            aoMudar={() => setTipoPreco("fixo")}
          />
          <Escolha
            nome="tipoPreco"
            valor="por_foto"
            marcado={tipoPreco === "por_foto"}
            titulo="Preço por foto"
            descricao="Um valor menor por foto, multiplicado pelas fotos encontradas"
            aoMudar={() => setTipoPreco("por_foto")}
          />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          rotulo={tipoPreco === "fixo" ? "Preço do pacote (R$)" : "Preço por foto (R$)"}
          id="pacote-preco"
          erro={erros.precoCentavos}
          ajuda={tipoPreco === "por_foto" ? `Menor que a foto avulsa (${precoFoto}).` : undefined}
        >
          <Input
            {...propsDeErro("pacote-preco", erros.precoCentavos)}
            name="preco"
            defaultValue={pacote?.preco}
            inputMode="decimal"
            className="h-11"
          />
        </Campo>
        <Campo
          rotulo="A partir de quantas fotos (opcional)"
          id="pacote-minimo"
          erro={erros.mostrarAPartirDe}
          ajuda="Em branco: oferece sempre."
        >
          <Input
            {...propsDeErro("pacote-minimo", erros.mostrarAPartirDe)}
            name="mostrarAPartirDe"
            defaultValue={pacote?.mostrarAPartirDe}
            inputMode="numeric"
            className="h-11"
          />
        </Campo>
        <Campo
          rotulo="Vale até (opcional)"
          id="pacote-expira"
          erro={erros.expiraEm}
          ajuda="Em branco: não vence."
        >
          <Input
            {...propsDeErro("pacote-expira", erros.expiraEm)}
            name="expiraEm"
            type="datetime-local"
            defaultValue={pacote?.expiraEm}
            className="h-11"
          />
        </Campo>
      </div>
      <p className="text-sm text-muted-foreground">
        Só oferecemos o pacote quando ele sai mais barato que as mesmas fotos avulsas. Ele não se
        combina com cupom nem com desconto progressivo, e não inclui vídeos.
      </p>

      <Button type="submit" size="touch" className="w-fit" disabled={salvando}>
        {salvando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Salvar pacote
      </Button>
    </form>
  );
}
