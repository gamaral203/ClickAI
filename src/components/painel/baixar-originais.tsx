"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderDown,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "cn";

import {
  liberarOriginaisAcao,
  loteDeOriginaisAcao,
} from "@/app/(fotografo)/painel/eventos/originais-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  baixados,
  baixarPorLink,
  caminhoDoItem,
  DownloadInterrompido,
  escolherArquivoZip,
  escolherPasta,
  gravarNaPasta,
  itensDosLotes,
  jaEstaNaPasta,
  LIMITE_ZIP_NA_MEMORIA,
  recursosDoNavegador,
  VIDA_UTIL_URL_MS,
  type FonteDeLotes,
  type Progresso,
} from "@/lib/baixar-originais";
import { formatarBytes } from "@/lib/formatar";

type Modo = "vendidas" | "minhas";
type Resumo = { quantidade: number; bytes: number; excluidas: number };
type Destino = "pasta" | "zip" | "links";
type Fase = "parado" | "baixando" | "fim" | "cancelado";

const OPCOES: { modo: Modo; titulo: string; descricao: (r: Resumo) => string }[] = [
  {
    modo: "vendidas",
    titulo: "Fotos vendidas",
    descricao: () =>
      "Todas as fotos deste evento em pedidos pagos, inclusive as dos colaboradores.",
  },
  {
    modo: "minhas",
    titulo: "Todas as minhas fotos",
    descricao: (r) =>
      r.excluidas > 0
        ? `Tudo o que você enviou, inclusive ${r.excluidas} ${r.excluidas === 1 ? "foto excluída" : "fotos excluídas"} (vão para a pasta "excluidas").`
        : "Tudo o que você enviou a este evento.",
  },
];

const NOMES_DESTINO: Record<Destino, { titulo: string; descricao: string }> = {
  pasta: {
    titulo: "Salvar numa pasta",
    descricao: "Recomendado: grava arquivo por arquivo e, se parar, continua de onde estava.",
  },
  zip: { titulo: "Um arquivo ZIP", descricao: "Tudo num arquivo só." },
  links: {
    titulo: "Um download por foto",
    descricao: "O navegador baixa cada foto separada (ele pode pedir permissão uma vez).",
  },
};

/** As APIs do navegador não mudam enquanto a página está aberta. */
function nadaMuda() {
  return () => {};
}

/**
 * "Baixar originais" do painel do evento, só para o dono (o servidor confere de novo em cada
 * lote). Os arquivos vêm direto do R2 por URL assinada; nada passa pelo servidor do site.
 */
export function BaixarOriginais({
  eventoId,
  slug,
  resumo,
  pedeCodigo,
}: {
  eventoId: string;
  slug: string;
  resumo: Record<Modo, Resumo>;
  pedeCodigo: boolean;
}) {
  const ids = useId();
  const [modo, setModo] = useState<Modo>(resumo.vendidas.quantidade > 0 ? "vendidas" : "minhas");
  // As APIs de arquivos só existem no navegador (no servidor, tudo falso).
  const temPasta = useSyncExternalStore(
    nadaMuda,
    () => recursosDoNavegador().pasta,
    () => false,
  );
  const temSalvar = useSyncExternalStore(
    nadaMuda,
    () => recursosDoNavegador().salvarArquivo,
    () => false,
  );
  const recursos = { pasta: temPasta, salvarArquivo: temSalvar };
  // Sem escolha da pessoa, vale o primeiro destino disponível (a pasta, quando existe).
  const [destino, setDestino] = useState<Destino | null>(null);
  const [codigo, setCodigo] = useState("");
  const [fase, setFase] = useState<Fase>("parado");
  const [ocupado, setOcupado] = useState(false);
  const [esperandoLimite, setEsperandoLimite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<Progresso>({
    feitos: 0,
    bytes: 0,
    falhas: [],
    atual: null,
  });
  const [total, setTotal] = useState({ quantidade: 0, bytes: 0 });
  const liberacao = useRef<string | null>(null);
  const [liberado, setLiberado] = useState(false);
  const cancelar = useRef<AbortController | null>(null);
  // Baixados nesta visita (modo pasta e um por um): "Continuar" não baixa de novo.
  const concluidos = useRef(new Map<Modo, Set<string>>());

  const atual = resumo[modo];
  const zipCabeNaMemoria = atual.bytes <= LIMITE_ZIP_NA_MEMORIA;
  const destinos: Destino[] = [
    ...(recursos.pasta ? (["pasta"] as const) : []),
    ...(recursos.salvarArquivo || zipCabeNaMemoria ? (["zip"] as const) : []),
    "links",
  ];
  const destinoValido = destino && destinos.includes(destino) ? destino : destinos[0];
  const baixando = fase === "baixando";

  async function baixar(somente?: string[]) {
    setErro(null);
    const escolhido = destinoValido;
    const nomeZip = `${slug}-${modo === "vendidas" ? "vendidas" : "minhas-fotos"}${somente ? "-falhas" : ""}.zip`;

    // Primeiro o seletor do sistema: ele só abre logo depois do clique.
    let pasta: Awaited<ReturnType<typeof escolherPasta>> | null = null;
    let arquivoZip: WritableStream<Uint8Array> | null = null;
    try {
      if (escolhido === "pasta") pasta = await escolherPasta();
      if (escolhido === "zip" && recursos.salvarArquivo) {
        arquivoZip = await escolherArquivoZip(nomeZip);
      }
    } catch {
      // Fechou o seletor sem escolher: não começa.
      return;
    }

    setOcupado(true);
    try {
      if (!liberacao.current) {
        const resultado = await liberarOriginaisAcao(eventoId, codigo || undefined);
        if (!resultado.ok) {
          setErro(resultado.erro);
          await arquivoZip?.abort().catch(() => {});
          return;
        }
        liberacao.current = resultado.liberacao;
        setLiberado(true);
        setCodigo("");
      }
      const token = liberacao.current;
      const fonte: FonteDeLotes = (pedido) =>
        loteDeOriginaisAcao({ eventoId, modo, liberacao: token, ...pedido });

      const controle = new AbortController();
      cancelar.current = controle;
      const sinal = controle.signal;
      const feitosAntes = concluidos.current.get(modo) ?? new Set<string>();
      concluidos.current.set(modo, feitosAntes);
      const pular = escolhido === "zip" ? undefined : feitosAntes;
      const quantidade = somente?.length ?? atual.quantidade - (pular?.size ?? 0);
      setTotal({ quantidade, bytes: somente ? 0 : atual.bytes });
      setProgresso({ feitos: 0, bytes: 0, falhas: [], atual: null });
      setFase("baixando");

      const itens = itensDosLotes(fonte, sinal, {
        pular,
        ids: somente,
        aoEsperar: setEsperandoLimite,
      });

      if (escolhido === "links") {
        // Último recurso: um link por arquivo, com pausa para o navegador não bloquear.
        let feitos = 0;
        for await (const item of itens) {
          let url = item.url;
          if (Date.now() - item.obtidoEm > VIDA_UTIL_URL_MS) {
            const novo = await fonte({ ids: [item.id] });
            if (!novo.ok || !novo.itens[0]) continue;
            url = novo.itens[0].url;
          }
          setProgresso((p) => ({ ...p, atual: item.nome }));
          baixarPorLink(url, item.nome);
          feitosAntes.add(item.id);
          feitos++;
          setProgresso((p) => ({ ...p, feitos, bytes: p.bytes + (item.bytes ?? 0) }));
          await new Promise((r) => setTimeout(r, 800));
          if (sinal.aborted) throw new DownloadInterrompido("cancelado", "Cancelado.");
        }
      } else if (pasta) {
        const destinoPasta = pasta;
        for await (const { item, arquivo } of baixados(fonte, itens, sinal, setProgresso, {
          pularSe: (i) => jaEstaNaPasta(destinoPasta, i),
        })) {
          await gravarNaPasta(destinoPasta, item, arquivo);
          feitosAntes.add(item.id);
        }
      } else {
        const { makeZip } = await import("client-zip");
        async function* entradas() {
          for await (const { item, arquivo } of baixados(fonte, itens, sinal, setProgresso)) {
            yield { name: caminhoDoItem(item), input: arquivo, lastModified: new Date() };
          }
        }
        const zip = makeZip(entradas());
        if (arquivoZip) {
          await zip.pipeTo(arquivoZip, { signal: sinal });
        } else {
          const blob = await new Response(zip).blob();
          const url = URL.createObjectURL(blob);
          baixarPorLink(url, nomeZip);
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      }
      setFase("fim");
    } catch (e) {
      if (e instanceof DownloadInterrompido && e.motivo === "cancelado") {
        setFase("cancelado");
      } else if (cancelar.current?.signal.aborted) {
        setFase("cancelado");
      } else {
        if (e instanceof DownloadInterrompido && e.motivo === "liberacao") {
          liberacao.current = null;
          setLiberado(false);
        }
        setErro(
          e instanceof DownloadInterrompido
            ? e.message
            : "O download parou por um erro. Tente de novo: o que já foi salvo na pasta não é baixado outra vez.",
        );
        setFase("cancelado");
      }
      await arquivoZip?.abort().catch(() => {});
    } finally {
      setOcupado(false);
      setEsperandoLimite(false);
      cancelar.current = null;
    }
  }

  const porcentagem =
    total.bytes > 0
      ? Math.min(100, Math.round((progresso.bytes / total.bytes) * 100))
      : total.quantidade > 0
        ? Math.round((progresso.feitos / total.quantidade) * 100)
        : 0;
  const nada = atual.quantidade === 0;

  return (
    <section
      aria-labelledby={`${ids}-titulo`}
      className="flex flex-col gap-5 rounded-xl border p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${ids}-titulo`} className="flex items-center gap-2 text-lg font-semibold">
          <FolderDown aria-hidden="true" className="size-5 text-primary" />
          Baixar originais
        </h2>
        <p className="text-sm text-muted-foreground">
          Os arquivos originais, como foram enviados. Só você, que criou o evento, vê esta opção.
        </p>
      </div>

      <p
        role="note"
        className="flex items-start gap-2 rounded-lg border border-l-4 border-l-highlight bg-muted p-3 text-sm"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        São os originais sem marca d&apos;água. Guarde em lugar seguro e não repasse a quem não
        comprou.
      </p>

      <fieldset disabled={baixando || ocupado} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">O que baixar</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPCOES.map((opcao) => {
            const r = resumo[opcao.modo];
            const escolhida = modo === opcao.modo;
            return (
              <label
                key={opcao.modo}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none",
                  escolhida ? "border-primary bg-accent/50" : "hover:border-primary/50",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name={`${ids}-modo`}
                    value={opcao.modo}
                    checked={escolhida}
                    onChange={() => setModo(opcao.modo)}
                    className="size-4 accent-primary"
                  />
                  {opcao.titulo}
                </span>
                <span className="text-sm text-muted-foreground">{opcao.descricao(r)}</span>
                <span className="text-sm font-medium tabular-nums">
                  {r.quantidade} {r.quantidade === 1 ? "arquivo" : "arquivos"}
                  {r.bytes > 0 && <> · cerca de {formatarBytes(r.bytes)}</>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {destinos.length > 1 && (
        <fieldset disabled={baixando || ocupado} className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Como salvar</legend>
          {destinos.map((d) => (
            <label key={d} className="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name={`${ids}-destino`}
                value={d}
                checked={destinoValido === d}
                onChange={() => setDestino(d)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                <span className="font-medium">{NOMES_DESTINO[d].titulo}</span>
                <span className="block text-muted-foreground">{NOMES_DESTINO[d].descricao}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {pedeCodigo && !liberado && !baixando && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-codigo`} className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
            Código do app autenticador
          </label>
          <Input
            id={`${ids}-codigo`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={40}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="h-11 w-full sm:w-48"
            aria-describedby={`${ids}-codigo-ajuda`}
          />
          <p id={`${ids}-codigo-ajuda`} className="text-xs text-muted-foreground">
            Sua conta tem a verificação em duas etapas ligada. O código libera o download deste
            evento por 3 horas.
          </p>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      {(baixando || fase === "fim" || fase === "cancelado") && total.quantidade > 0 && (
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Progresso do download dos originais"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentagem}
            className="h-2.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
                fase === "fim" && progresso.falhas.length === 0 ? "bg-highlight" : "bg-primary",
              )}
              style={{ width: `${porcentagem}%` }}
            />
          </div>
          <p className="flex flex-wrap justify-between gap-x-4 text-sm tabular-nums">
            <span>
              {Math.min(progresso.feitos, total.quantidade)} de {total.quantidade}
              {progresso.bytes > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {formatarBytes(progresso.bytes)}
                  {total.bytes > 0 && <> de {formatarBytes(total.bytes)}</>}
                </span>
              )}
            </span>
            {baixando && progresso.atual && (
              <span className="min-w-0 truncate text-muted-foreground">{progresso.atual}</span>
            )}
          </p>
          {esperandoLimite && (
            <p className="text-sm text-muted-foreground">
              Muitos arquivos seguidos: esperando um minuto para continuar…
            </p>
          )}
        </div>
      )}

      <div aria-live="polite" className="text-sm">
        {fase === "fim" && progresso.falhas.length === 0 && (
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
            Pronto: {progresso.feitos}{" "}
            {progresso.feitos === 1 ? "arquivo salvo" : "arquivos salvos"}.
          </p>
        )}
        {(fase === "fim" || fase === "cancelado") && progresso.falhas.length > 0 && (
          <p className="text-destructive">
            {progresso.falhas.length}{" "}
            {progresso.falhas.length === 1 ? "arquivo não baixou" : "arquivos não baixaram"}.
          </p>
        )}
        {fase === "cancelado" && !erro && <p>Download interrompido.</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        {baixando ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => cancelar.current?.abort()}
          >
            <X aria-hidden="true" data-icon="inline-start" />
            Cancelar
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="touch"
              disabled={nada || ocupado || (pedeCodigo && !liberado && !codigo.trim())}
              onClick={() => void baixar()}
            >
              {ocupado ? (
                <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
              ) : (
                <Download aria-hidden="true" data-icon="inline-start" />
              )}
              {fase === "cancelado" && destinoValido !== "zip" ? "Continuar" : "Baixar originais"}
            </Button>
            {progresso.falhas.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={ocupado}
                onClick={() => void baixar(progresso.falhas)}
              >
                <RotateCcw aria-hidden="true" data-icon="inline-start" />
                Repetir as falhas
              </Button>
            )}
          </>
        )}
      </div>
      {nada && (
        <p className="text-sm text-muted-foreground">
          {modo === "vendidas"
            ? "Nenhuma foto deste evento foi vendida ainda."
            : "Você ainda não tem fotos prontas neste evento."}
        </p>
      )}
    </section>
  );
}
