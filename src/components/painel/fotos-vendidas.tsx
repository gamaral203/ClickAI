"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { AlertTriangle, Calendar, Check, FolderDown, Mail, UserRound } from "lucide-react";
import { cn } from "cn";

import {
  liberarVendidasAcao,
  loteDeVendidasAcao,
} from "@/app/(fotografo)/painel/eventos/originais-acoes";
import { Button } from "@/components/ui/button";
import type { FiltroVendidas, VendaDoAutor } from "@/dados";
import { formatarBytes, formatarDataCurta, formatarPreco } from "@/lib/formatar";

import { BaixarEmLote } from "./baixar-em-lote";
import { BaixarOriginal } from "./baixar-original";
import { MiniaturaSemMarca } from "./lista-clientes";

/**
 * Fotos vendidas do autor, uma por venda, com a miniatura sem marca d'água, o evento, a data, o
 * comprador (e-mail mascarado) e a parte dele. Tocar numa foto a seleciona; o download em lote
 * baixa as selecionadas ou todas do filtro (cada foto uma vez), pelo mesmo caminho dos lotes do
 * dono: liberação (com o código do app, se o MFA estiver ligado), URLs assinadas conferidas no
 * servidor foto a foto e pasta ou ZIP no navegador.
 */
export function FotosVendidas({
  vendas,
  filtro,
  resumo,
  pedeCodigo,
}: {
  vendas: VendaDoAutor[];
  filtro: FiltroVendidas;
  resumo: { quantidade: number; bytes: number };
  pedeCodigo: boolean;
}) {
  const ids = useId();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<"selecionadas" | "filtro">("filtro");
  const [ocupado, setOcupado] = useState(false);

  const fotosDaPagina = useMemo(() => [...new Set(vendas.map((v) => v.fotoId))], [vendas]);
  const todasDaPagina = fotosDaPagina.every((id) => selecionadas.has(id));
  const somente = alvo === "selecionadas" ? [...selecionadas] : undefined;

  function trocarSelecao(nova: Set<string>) {
    setSelecionadas(nova);
    setAlvo(nova.size > 0 ? "selecionadas" : "filtro");
  }

  function alternar(fotoId: string) {
    const nova = new Set(selecionadas);
    if (nova.has(fotoId)) nova.delete(fotoId);
    else nova.add(fotoId);
    trocarSelecao(nova);
  }

  function alternarPagina() {
    const nova = new Set(selecionadas);
    for (const id of fotosDaPagina) {
      if (todasDaPagina) nova.delete(id);
      else nova.add(id);
    }
    trocarSelecao(nova);
  }

  const liberar = useCallback((codigo?: string) => liberarVendidasAcao(codigo), []);
  const lote = useCallback(
    (liberacao: string, pedido: { depois?: string | null; ids?: string[] }) =>
      loteDeVendidasAcao({ filtro, liberacao, ...pedido }),
    [filtro],
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby={`${ids}-lote`}
        className="flex flex-col gap-5 rounded-xl border p-4 sm:p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id={`${ids}-lote`} className="flex items-center gap-2 text-lg font-semibold">
            <FolderDown aria-hidden="true" className="size-5 text-primary" />
            Baixar originais
          </h2>
          <p className="text-sm text-muted-foreground">
            Cada foto vem uma vez só, mesmo vendida mais de uma vez. O nome do arquivo começa pelo
            evento.
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
        <fieldset disabled={ocupado} className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">O que baixar</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <OpcaoAlvo
              nome={`${ids}-alvo`}
              marcada={alvo === "selecionadas"}
              desligada={selecionadas.size === 0}
              aoEscolher={() => setAlvo("selecionadas")}
              titulo="As selecionadas"
              detalhe={
                selecionadas.size === 0
                  ? "Toque nas fotos abaixo para escolher."
                  : `${selecionadas.size} ${selecionadas.size === 1 ? "foto" : "fotos"}`
              }
            />
            <OpcaoAlvo
              nome={`${ids}-alvo`}
              marcada={alvo === "filtro"}
              aoEscolher={() => setAlvo("filtro")}
              titulo="Todas do filtro"
              detalhe={`${resumo.quantidade} ${resumo.quantidade === 1 ? "foto" : "fotos"}${
                resumo.bytes > 0 ? ` · cerca de ${formatarBytes(resumo.bytes)}` : ""
              }`}
            />
          </div>
        </fieldset>
        <BaixarEmLote
          chave={alvo}
          resumo={resumo}
          somente={somente}
          nomeZip={
            alvo === "selecionadas" ? "fotos-vendidas-selecionadas.zip" : "fotos-vendidas.zip"
          }
          pedeCodigo={pedeCodigo}
          ajudaCodigo="Sua conta tem a verificação em duas etapas ligada. O código libera o download das suas fotos vendidas por 3 horas."
          liberar={liberar}
          lote={lote}
          rotulo={alvo === "selecionadas" ? "Baixar selecionadas" : "Baixar todas do filtro"}
          aoMudarOcupado={setOcupado}
        />
      </section>

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

      <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {vendas.map((venda) => (
          <CartaoVenda
            key={venda.itemId}
            venda={venda}
            selecionada={selecionadas.has(venda.fotoId)}
            aoAlternar={() => alternar(venda.fotoId)}
          />
        ))}
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

function CartaoVenda({
  venda,
  selecionada,
  aoAlternar,
}: {
  venda: VendaDoAutor;
  selecionada: boolean;
  aoAlternar: () => void;
}) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border p-3 transition-colors motion-reduce:transition-none",
        selecionada && "border-primary bg-accent/40",
      )}
    >
      <label className="relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-lg bg-muted">
        <input
          type="checkbox"
          checked={selecionada}
          onChange={aoAlternar}
          aria-label={`Selecionar ${venda.nomeArquivo}, vendida em ${formatarDataCurta(venda.vendidaEm)}`}
          className="peer sr-only"
        />
        <MiniaturaSemMarca foto={venda} />
        <span
          aria-hidden="true"
          className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full border-2 border-white bg-black/30 text-white shadow-sm peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/60"
        >
          {selecionada && <Check className="size-4" strokeWidth={3} />}
        </span>
        {venda.excluida && (
          <span className="absolute top-2 right-2 rounded-full bg-foreground/85 px-2 py-0.5 text-xs font-semibold text-background">
            Excluída
          </span>
        )}
        {venda.tipo === "video" && (
          <span className="absolute right-2 bottom-2 rounded-full bg-foreground/85 px-2 py-0.5 text-xs font-semibold text-background">
            Vídeo
          </span>
        )}
      </label>
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <p className="truncate font-medium" title={venda.eventoTitulo}>
          {venda.eventoTitulo}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={venda.nomeArquivo}>
          {venda.nomeArquivo}
        </p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="sr-only">Vendida em </span>
          {formatarDataCurta(venda.vendidaEm)}
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="sr-only">Comprador: </span>
          <span className="truncate">{venda.compradorNome}</span>
        </p>
        {venda.compradorEmail && (
          <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Mail aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="sr-only">E-mail: </span>
            <span className="truncate">{venda.compradorEmail}</span>
          </p>
        )}
        <p className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">Sua parte</span>
          <span className="font-semibold tabular-nums">{formatarPreco(venda.valorCentavos)}</span>
        </p>
      </div>
      <BaixarOriginal
        eventoId={venda.eventoId}
        fotoId={venda.fotoId}
        nomeArquivo={venda.nomeArquivo}
      />
    </li>
  );
}
