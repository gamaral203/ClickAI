import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  ChartColumn,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
} from "lucide-react";

import { AcoesEvento } from "@/components/painel/acoes-evento";
import { Colaboradores } from "@/components/painel/colaboradores";
import { AlternarDescontoProgressivo } from "@/components/painel/alternar-desconto-progressivo";
import { EditorFaixas } from "@/components/painel/editor-faixas";
import { FormularioPacote } from "@/components/painel/formulario-pacote";
import { Pastas } from "@/components/painel/pastas";
import { CompartilharEvento } from "@/components/painel/compartilhar-evento";
import { EnvioFotos } from "@/components/painel/envio-fotos";
import { GradeFotosPainel } from "@/components/painel/grade-fotos-painel";
import { ReaproveitarEvento } from "@/components/painel/reaproveitar-evento";
import { RostosDoEvento } from "@/components/painel/rostos-do-evento";
import { TopCliques } from "@/components/painel/top-cliques";
import { FormularioEvento } from "@/components/painel/formulario-evento";
import { StatusEventoSelo } from "@/components/painel/status-evento";
import { buttonVariants } from "@/components/ui/button";
import {
  buscarEventoDoFotografo,
  buscarPacoteDoEvento,
  listarCategorias,
  listarColaboradores,
  listarFaixas,
  listarItensDoPainel,
  listarPastasDoPainel,
  situacaoDosRostos,
  topCliquesDoEvento,
  totaisDoEvento,
} from "@/dados";
import { isoParaCampo } from "@/lib/datas";
import { centavosParaCampo } from "@/lib/dinheiro";
import { urlDoSite } from "@/lib/endereco";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { gerarQrCode } from "@/lib/qrcode";
import { ehIdValido } from "@/lib/validacao";
import { modoEnvio } from "@/lib/r2";
import { provedorFacial } from "@/lib/reconhecimento";
import { exigirFotografo } from "@/servicos/sessao";

// As Server Actions do envio de fotos rodam nesta página: a confirmação baixa o original do R2,
// gera prévia e miniatura e grava de volta, uma foto por chamada (docs/arquitetura.md, "Upload").
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Gerenciar evento",
  robots: { index: false, follow: false },
};

export default function PaginaGerenciarEvento(props: PageProps<"/painel/eventos/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/painel/eventos"
        className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Meus eventos
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo {...props} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/painel/eventos/[id]">) {
  const { id } = await params;
  const { conta } = await exigirFotografo(`/painel/eventos/${id}`);
  // Evento de outro fotógrafo dá "não encontrado", igual a um id que não existe.
  const evento = ehIdValido(id) ? await buscarEventoDoFotografo(id, conta.id) : null;
  if (!evento) notFound();
  const { criado, publicado, copiado } = await searchParams;
  const categorias = await listarCategorias();
  const liberacaoManualPendente = evento.liberacao === "manual" && !evento.liberadoEm;
  const [
    itensDoPainel,
    faixasDoEvento,
    faixasPadrao,
    pacote,
    colaboradores,
    pastas,
    rostos,
    top,
    totais,
  ] = await Promise.all([
    listarItensDoPainel(evento.id, conta.id),
    listarFaixas(conta.id, evento.id),
    listarFaixas(conta.id, null),
    buscarPacoteDoEvento(evento.id, conta.id),
    listarColaboradores(evento.id, conta.id),
    listarPastasDoPainel(evento.id, conta.id),
    situacaoDosRostos(evento.id),
    topCliquesDoEvento(evento.id),
    totaisDoEvento(evento.id, conta.id),
  ]);
  const itens = itensDoPainel ?? [];
  const regraPadrao = (faixasPadrao ?? [])
    .map((f) => `${f.descontoPct}% a partir de ${f.quantidadeMin} fotos`)
    .join(", ");
  const urlPublica = urlDoSite(`/eventos/${evento.slug}`);
  const qrCode = evento.status === "publicado" ? await gerarQrCode(urlPublica) : null;

  return (
    <>
      {criado === "1" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          Evento criado como rascunho. Envie as fotos e publique quando estiver pronto.
        </p>
      )}
      {copiado === "1" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          Cópia criada como rascunho, com a mesma configuração, descontos e pacote. Ajuste o nome e
          as datas em Configurações, envie as fotos e publique.
        </p>
      )}
      {publicado === "1" && evento.status === "publicado" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          Evento publicado. Agora é só divulgar o link ou o QR Code abaixo.
        </p>
      )}

      <header className="flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{evento.titulo}</h1>
          <StatusEventoSelo status={evento.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {evento.totalItens} {evento.totalItens === 1 ? "foto pronta" : "fotos prontas"} ·{" "}
          {evento.vendidos} {evento.vendidos === 1 ? "vendida" : "vendidas"}
          {evento.liberacao === "agendada" &&
            evento.liberadoEm &&
            ` · liberação em ${formatarDataEHora(evento.liberadoEm)}`}
          {liberacaoManualPendente && " · fotos ainda não liberadas"}
        </p>
        {totais && totais.pedidos > 0 && (
          <p className="text-sm">
            <strong className="tabular-nums">{formatarPreco(totais.faturamentoCentavos)}</strong>{" "}
            <span className="text-muted-foreground">
              em {totais.pedidos} {totais.pedidos === 1 ? "pedido pago" : "pedidos pagos"}
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {evento.status === "publicado" && (
            <Link
              href={`/eventos/${evento.slug}`}
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Ver a página pública
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          )}
          <Link
            href={`/painel/eventos/${evento.id}/relatorio`}
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Relatório do evento (PDF)
            <FileText aria-hidden="true" className="size-4" />
          </Link>
          <Link
            href={`/painel/eventos/${evento.id}/desempenho`}
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            <ChartColumn aria-hidden="true" data-icon="inline-start" />
            Desempenho
          </Link>
        </div>
        <AcoesEvento
          eventoId={evento.id}
          status={evento.status}
          liberacaoManualPendente={liberacaoManualPendente}
        />
      </header>

      <RostosDoEvento
        eventoId={evento.id}
        prontas={rostos.prontas}
        comRosto={rostos.comRosto}
        pendentes={rostos.pendentes}
        configurado={provedorFacial() === "rekognition"}
      />

      <TopCliques posicoes={top} destaque={conta.id} />

      {qrCode && (
        <CompartilharEvento
          url={urlPublica}
          titulo={evento.titulo}
          slug={evento.slug}
          visibilidade={evento.visibilidade}
          qrSvg={qrCode.svg}
          qrPngDataUrl={qrCode.pngDataUrl}
          eventoId={evento.id}
        />
      )}

      <ReaproveitarEvento eventoId={evento.id} titulo={evento.titulo} />

      <details className="group rounded-xl border p-5 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Descontos do evento</h2>
          <ChevronDown
            aria-hidden="true"
            className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mt-4 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              Cupons valem para todos os seus eventos e ficam em{" "}
              <Link href="/painel/descontos" className="font-medium text-primary hover:underline">
                Descontos e cupons
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">Desconto progressivo</h3>
            <AlternarDescontoProgressivo
              eventoId={evento.id}
              ligado={evento.descontoProgressivo !== false}
            />
            <EditorFaixas
              eventoId={evento.id}
              inicial={(faixasDoEvento ?? []).map((f) => ({
                quantidadeMin: f.quantidadeMin,
                descontoPct: f.descontoPct,
              }))}
              semFaixas={
                regraPadrao
                  ? `Sem faixas próprias: vale a sua regra padrão (${regraPadrao}). Adicione faixas para usar outras só neste evento.`
                  : "Sem faixas: cada foto sai pelo preço cheio. Adicione faixas ou crie uma regra padrão em Descontos e cupons."
              }
            />
          </div>
          <div className="flex flex-col gap-3 border-t pt-6">
            <h3 className="font-semibold">Pacote “todas as minhas fotos”</h3>
            <FormularioPacote
              eventoId={evento.id}
              precoFoto={formatarPreco(evento.precoFotoCentavos)}
              pacote={
                pacote && {
                  ativo: pacote.ativo,
                  tipoPreco: pacote.tipoPreco,
                  preco: centavosParaCampo(pacote.precoCentavos),
                  mostrarAPartirDe:
                    pacote.mostrarAPartirDe === null ? "" : String(pacote.mostrarAPartirDe),
                  expiraEm: pacote.expiraEm ? isoParaCampo(pacote.expiraEm) : "",
                }
              }
            />
          </div>
        </div>
      </details>

      <details className="group rounded-xl border p-5 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">
            Colaboradores{colaboradores?.length ? ` (${colaboradores.length})` : ""}
          </h2>
          <ChevronDown
            aria-hidden="true"
            className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              Outros fotógrafos que cobrem o evento com você. Cada um recebe pelas fotos que enviou,
              menos a sua comissão.
            </p>
          </div>
          <Colaboradores
            eventoId={evento.id}
            colaboradores={(colaboradores ?? []).map((c) => ({
              id: c.id,
              nomePublico: c.nomePublico,
              comissaoDonoPct: c.comissaoDonoPct,
              nota: c.nota,
              totalItens: c.totalItens,
              aceito: c.aceitoEm !== null,
            }))}
          />
        </div>
      </details>

      <details className="group rounded-xl border p-5 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">
            Pastas{pastas?.length ? ` (${pastas.length})` : ""}
          </h2>
          <ChevronDown
            aria-hidden="true"
            className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mt-4">
          <Pastas
            eventoId={evento.id}
            pastas={(pastas ?? []).map((p) => ({
              id: p.id,
              nome: p.nome,
              totalItens: p.totalItens,
            }))}
          />
        </div>
      </details>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Fotos ({itens.length})</h2>
        <EnvioFotos eventoId={evento.id} modo={modoEnvio()} />
        <GradeFotosPainel
          itens={itens.map((i) => ({
            id: i.id,
            urlMiniatura: i.urlMiniatura,
            nomeArquivo: i.nomeArquivo,
            status: i.status,
            erroMensagem: i.erroMensagem,
            vendido: i.vendido,
            precoCentavos: i.precoCentavos,
            precoEventoCentavos:
              i.tipo === "video" ? evento.precoVideoCentavos : evento.precoFotoCentavos,
            pastaId: i.pastaId,
          }))}
          pastas={(pastas ?? []).map((p) => ({ id: p.id, nome: p.nome }))}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Configurações</h2>
        <FormularioEvento
          eventoId={evento.id}
          categorias={categorias}
          inicial={{
            titulo: evento.titulo,
            categoriaId: evento.categoriaId,
            inicioEm: isoParaCampo(evento.inicioEm),
            fimEm: isoParaCampo(evento.fimEm),
            local: evento.local,
            cidade: evento.cidade,
            estado: evento.estado,
            precoFoto: centavosParaCampo(evento.precoFotoCentavos),
            precoVideo: centavosParaCampo(evento.precoVideoCentavos),
            visibilidade: evento.visibilidade,
            temSenha: evento.temSenha,
            fotosSoAposBusca: evento.fotosSoAposBusca,
            liberacao: evento.liberacao,
            liberadoEm: evento.liberadoEm ? isoParaCampo(evento.liberadoEm) : "",
            filtroHorario: evento.filtroHorario,
            listarNaoIdentificadas: evento.listarNaoIdentificadas,
            ordenacao: evento.ordenacao,
          }}
        />
      </section>
    </>
  );
}
