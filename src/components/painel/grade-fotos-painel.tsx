"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { excluirItemAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { definirPrecoAcao } from "@/app/(fotografo)/painel/eventos/vendas-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centavosParaCampo } from "@/lib/dinheiro";
import { formatarPreco } from "@/lib/formatar";

export type ItemDoPainel = {
  id: string;
  urlMiniatura: string;
  nomeArquivo: string;
  status: "processando" | "pronta" | "erro";
  vendido: boolean;
  /** Preço próprio; `null` usa o do evento. */
  precoCentavos: number | null;
  /** Preço do evento para o tipo do item. */
  precoEventoCentavos: number;
};

export function GradeFotosPainel({ itens }: { itens: ItemDoPainel[] }) {
  if (itens.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Nenhuma foto enviada ainda.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {itens.map((item) => (
        <Cartao key={item.id} item={item} />
      ))}
    </ul>
  );
}

function Cartao({ item }: { item: ItemDoPainel }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, startTransition] = useTransition();

  function excluir() {
    startTransition(async () => {
      const resultado = await excluirItemAcao(item.id).catch(() => ({
        erro: "Não foi possível excluir.",
      }));
      if (resultado.erro) setErro(resultado.erro);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        <Image src={item.urlMiniatura} alt="" fill sizes="200px" className="object-cover" />
        <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
          {item.vendido && (
            <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-semibold text-highlight-foreground">
              Vendida
            </span>
          )}
          {item.status !== "pronta" && (
            <span className="rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold">
              {item.status === "processando" ? "Processando" : "Erro"}
            </span>
          )}
        </div>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={item.nomeArquivo}>
        {item.nomeArquivo}
      </p>
      <Preco item={item} />
      {confirmando ? (
        <div className="flex flex-col gap-1.5">
          {item.vendido && (
            <p className="text-xs text-muted-foreground">
              Quem comprou continua baixando; ela só sai da galeria.
            </p>
          )}
          <div className="flex gap-1.5">
            <Button
              variant="destructive"
              size="sm"
              disabled={excluindo}
              onClick={excluir}
              className="flex-1"
            >
              {excluindo ? <Loader2 aria-hidden="true" className="animate-spin" /> : "Excluir"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmando(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmando(true)}
          aria-label={`Excluir ${item.nomeArquivo}`}
        >
          <Trash2 aria-hidden="true" />
          Excluir
        </Button>
      )}
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </li>
  );
}

/** Preço do item: o do evento, ou um próprio (mais caro ou mais barato que o padrão). */
function Preco({ item }: { item: ItemDoPainel }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(
    item.precoCentavos === null ? "" : centavosParaCampo(item.precoCentavos),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  function salvar(texto: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await definirPrecoAcao(item.id, texto).catch(() => ({
        erro: "Não foi possível salvar.",
      }));
      if (resultado.erro) return setErro(resultado.erro);
      setEditando(false);
      router.refresh();
    });
  }

  if (!editando) {
    return (
      <div className="flex items-center justify-between gap-1 text-xs">
        <span>
          {formatarPreco(item.precoCentavos ?? item.precoEventoCentavos)}
          {item.precoCentavos === null && <span className="text-muted-foreground"> (evento)</span>}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Mudar o preço de ${item.nomeArquivo}`}
          onClick={() => setEditando(true)}
        >
          <Pencil aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar(valor);
      }}
    >
      <label htmlFor={`preco-${item.id}`} className="text-xs font-medium">
        Preço desta foto (R$)
      </label>
      <Input
        id={`preco-${item.id}`}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        inputMode="decimal"
        placeholder={centavosParaCampo(item.precoEventoCentavos)}
        aria-invalid={Boolean(erro)}
        className="h-9"
      />
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={salvando} className="flex-1">
          {salvando ? <Loader2 aria-hidden="true" className="animate-spin" /> : "Salvar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditando(false)}
          className="flex-1"
        >
          Cancelar
        </Button>
      </div>
      {item.precoCentavos !== null && (
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={salvando}
          onClick={() => salvar("")}
        >
          Voltar ao preço do evento
        </Button>
      )}
    </form>
  );
}
