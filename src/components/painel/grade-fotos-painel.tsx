"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ImageIcon, Loader2, Pencil, Star, Trash2 } from "lucide-react";

import { excluirItemAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { moverParaPastaAcao } from "@/app/(fotografo)/painel/eventos/pastas-acoes";
import { definirPrecoAcao } from "@/app/(fotografo)/painel/eventos/vendas-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { podeSerCapa } from "@/lib/capa";
import { centavosParaCampo } from "@/lib/dinheiro";
import { formatarPreco } from "@/lib/formatar";
import { rotuloDaLiberacao, type EstadoLiberacao } from "@/lib/liberacao";

export type ItemDoPainel = {
  id: string;
  urlMiniatura: string;
  nomeArquivo: string;
  /** Só foto pode ser capa (a prévia do vídeo é o próprio vídeo). Sem o campo, vale foto. */
  tipo?: "foto" | "video";
  status: "processando" | "pronta" | "erro";
  /** Por que a foto ficou em `erro` (ex.: o arquivo não chegou ao armazenamento). */
  erroMensagem: string | null;
  vendido: boolean;
  /** Preço próprio; `null` usa o do evento. */
  precoCentavos: number | null;
  /** Preço do evento para o tipo do item. */
  precoEventoCentavos: number;
  pastaId: string | null;
  /** Liberação da foto, calculada no servidor (src/lib/liberacao.ts). */
  estadoLiberacao: EstadoLiberacao;
  liberarEm: string | null;
};

/** Seleção de fotos para liberar ou agendar (só o dono do evento). */
export type SelecaoDeFotos = {
  selecionados: ReadonlySet<string>;
  alternar: (id: string) => void;
};

/** Escolha da capa do evento (só o dono do evento). */
export type EscolhaDeCapa = {
  /** Foto escolhida como capa, ou `null` (capa automática). */
  fotoId: string | null;
  definir: (fotoId: string) => void;
  /** Foto cuja escolha está sendo gravada agora. */
  gravando: string | null;
};

type PastaOpcao = { id: string; nome: string };

export function GradeFotosPainel({
  itens,
  pastas,
  selecao,
  capa,
  vazio = "Nenhuma foto enviada ainda.",
}: {
  itens: ItemDoPainel[];
  pastas: PastaOpcao[];
  selecao?: SelecaoDeFotos;
  capa?: EscolhaDeCapa;
  vazio?: string;
}) {
  // Evento com centenas de fotos: mostra aos poucos, para a página não ficar gigante (no
  // celular, eram dezenas de milhares de pixels) nem pesada de carregar.
  const [mostrando, setMostrando] = useState(POR_VEZ);
  const router = useRouter();
  const processando = itens.some((item) => item.status === "processando");
  // Fotos que ainda não ficaram prontas (o servidor as termina em segundo plano): atualiza a
  // grade sozinha até todas ficarem prontas, só com a aba visível.
  useEffect(() => {
    if (!processando) return;
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ATUALIZAR_A_CADA_MS);
    return () => clearInterval(intervalo);
  }, [processando, router]);
  if (itens.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {vazio}
      </p>
    );
  }
  const restantes = itens.length - mostrando;
  return (
    <div className="flex flex-col items-center gap-4">
      <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {itens.slice(0, mostrando).map((item) => (
          <Cartao key={item.id} item={item} pastas={pastas} selecao={selecao} capa={capa} />
        ))}
      </ul>
      {restantes > 0 && (
        <Button variant="outline" size="touch" onClick={() => setMostrando((n) => n + POR_VEZ)}>
          Mostrar mais {Math.min(POR_VEZ, restantes)} de {restantes}
        </Button>
      )}
    </div>
  );
}

const POR_VEZ = 24;
/** Intervalo da atualização automática enquanto há fotos em processamento. */
const ATUALIZAR_A_CADA_MS = 15_000;

function Cartao({
  item,
  pastas,
  selecao,
  capa,
}: {
  item: ItemDoPainel;
  pastas: PastaOpcao[];
  selecao?: SelecaoDeFotos;
  capa?: EscolhaDeCapa;
}) {
  const ehCapa = capa?.fotoId === item.id;
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
        {item.status === "pronta" ? (
          <Image src={item.urlMiniatura} alt="" fill sizes="200px" className="object-cover" />
        ) : item.status === "processando" ? (
          // A miniatura só existe depois que a foto fica pronta. Enquanto isso, um espaço
          // esmaecido, sem rótulo: o progresso do envio fica no círculo da tela de envio.
          <div className="flex size-full items-center justify-center text-muted-foreground/40 motion-safe:animate-pulse">
            <ImageIcon aria-hidden="true" className="size-8" />
            <span className="sr-only">Foto ainda chegando</span>
          </div>
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon aria-hidden="true" className="size-8" />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
          {ehCapa && (
            <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              <Star aria-hidden="true" className="size-3 fill-current" />
              Capa
            </span>
          )}
          {item.vendido && (
            <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-semibold text-highlight-foreground">
              Vendida
            </span>
          )}
          {item.status === "erro" && (
            <span className="rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold">
              Erro
            </span>
          )}
        </div>
      </div>
      <p className="truncate text-xs text-muted-foreground" title={item.nomeArquivo}>
        {item.nomeArquivo}
      </p>
      <SeloLiberacao item={item} />
      {selecao && item.estadoLiberacao !== "liberada" && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={selecao.selecionados.has(item.id)}
            onChange={() => selecao.alternar(item.id)}
            className="size-5 accent-primary"
          />
          Selecionar
        </label>
      )}
      {item.status === "erro" && item.erroMensagem && (
        <p className="text-xs text-destructive">{item.erroMensagem}</p>
      )}
      {capa && podeSerCapa(item) && !ehCapa && (
        <Button
          variant="outline"
          size="sm"
          disabled={capa.gravando !== null}
          onClick={() => capa.definir(item.id)}
          aria-label={`Usar ${item.nomeArquivo} como capa do evento`}
        >
          {capa.gravando === item.id ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Star aria-hidden="true" />
          )}
          Usar como capa
        </Button>
      )}
      <Preco item={item} />
      {pastas.length > 0 && <SeletorPasta item={item} pastas={pastas} />}
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

/** Estado da liberação: o texto diz tudo (a cor só acompanha). */
function SeloLiberacao({ item }: { item: ItemDoPainel }) {
  const classe =
    item.estadoLiberacao === "liberada"
      ? "bg-accent text-accent-foreground"
      : item.estadoLiberacao === "agendada"
        ? "bg-primary/10 text-primary"
        : "bg-highlight/40 text-highlight-foreground";
  return (
    <p className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>
      {rotuloDaLiberacao(item.estadoLiberacao, item.liberarEm)}
    </p>
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

/** Pasta do item: muda na hora, sem botão de salvar. */
function SeletorPasta({ item, pastas }: { item: ItemDoPainel; pastas: PastaOpcao[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [movendo, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Pasta de ${item.nomeArquivo}`}
        value={item.pastaId ?? ""}
        disabled={movendo}
        onChange={(e) => {
          const destino = e.target.value || null;
          setErro(null);
          startTransition(async () => {
            const resultado = await moverParaPastaAcao([item.id], destino).catch(() => ({
              erro: "Não foi possível mover.",
            }));
            if (resultado.erro) setErro(resultado.erro);
            router.refresh();
          });
        }}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">Sem pasta</option>
        {pastas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
