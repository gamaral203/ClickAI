import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookmarkCheck } from "lucide-react";

import { FormularioEvento } from "@/components/painel/formulario-evento";
import { ExcluirModelo, DuplicarRecente } from "@/components/painel/modelos-evento";
import { buscarModelo, listarCategorias, listarEventosDoFotografo, listarModelos } from "@/dados";
import { centavosParaCampo } from "@/lib/dinheiro";
import { formatarData } from "@/lib/formatar";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Novo evento", robots: { index: false, follow: false } };

export default function PaginaNovoEvento({ searchParams }: PageProps<"/painel/eventos/novo">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Novo evento</h1>
      <p className="text-muted-foreground">
        O evento nasce como rascunho: só você vê. Envie as fotos e publique quando quiser.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Formulario searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PADRAO = {
  titulo: "",
  categoriaId: "",
  inicioEm: "",
  fimEm: "",
  local: "",
  cidade: "",
  estado: "",
  precoFoto: "19,90",
  precoVideo: "39,90",
  visibilidade: "publico",
  temSenha: false,
  fotosSoAposBusca: false,
  liberacao: "automatica",
  liberadoEm: "",
  filtroHorario: false,
  listarNaoIdentificadas: false,
  ordenacao: "captura",
} as const;

async function Formulario({
  searchParams,
}: Pick<PageProps<"/painel/eventos/novo">, "searchParams">) {
  const { conta } = await exigirFotografo("/painel/eventos/novo");
  const { modelo: modeloId } = await searchParams;
  const [categorias, modelos, eventos] = await Promise.all([
    listarCategorias(),
    listarModelos(conta.id),
    listarEventosDoFotografo(conta.id),
  ]);
  const modelo =
    typeof modeloId === "string" && /^[0-9a-f-]{36}$/.test(modeloId)
      ? await buscarModelo(modeloId, conta.id)
      : null;
  const recentes = eventos.slice(0, 3);

  return (
    <>
      {(modelos.length > 0 || recentes.length > 0) && (
        <section className="flex flex-col gap-4 rounded-xl border p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Comece mais rápido</h2>
            <p className="text-sm text-muted-foreground">
              Use um modelo salvo para preencher o formulário, ou duplique um evento recente com
              descontos e pacote.
            </p>
          </div>
          {modelos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {modelos.map((m) => (
                <li
                  key={m.id}
                  className={`flex items-center gap-1 rounded-lg border pl-3 ${m.id === modelo?.id ? "border-primary bg-accent" : ""}`}
                >
                  <Link
                    href={`/painel/eventos/novo?modelo=${m.id}`}
                    className="flex h-10 items-center gap-2 text-sm font-medium"
                  >
                    <BookmarkCheck aria-hidden="true" className="size-4 text-primary" />
                    {m.nome}
                  </Link>
                  <ExcluirModelo modeloId={m.id} nome={m.nome} />
                </li>
              ))}
            </ul>
          )}
          {recentes.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {recentes.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="flex flex-col text-sm">
                    <span className="font-medium">{e.titulo}</span>
                    <span className="text-muted-foreground">
                      {formatarData(e.inicioEm)} · {e.cidade}
                    </span>
                  </span>
                  <DuplicarRecente eventoId={e.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {modelo && (
        <p role="status" className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          Formulário preenchido com o modelo <strong>{modelo.nome}</strong>. Falta só o nome e as
          datas do evento.
        </p>
      )}

      <FormularioEvento
        key={modelo?.id ?? "vazio"}
        categorias={categorias}
        inicial={
          modelo
            ? {
                ...PADRAO,
                categoriaId: modelo.config.categoriaId,
                local: modelo.config.local,
                cidade: modelo.config.cidade,
                estado: modelo.config.estado,
                precoFoto: centavosParaCampo(modelo.config.precoFotoCentavos),
                precoVideo: centavosParaCampo(modelo.config.precoVideoCentavos),
                visibilidade: modelo.config.visibilidade,
                fotosSoAposBusca: modelo.config.fotosSoAposBusca,
                liberacao: modelo.config.liberacao,
                filtroHorario: modelo.config.filtroHorario,
                listarNaoIdentificadas: modelo.config.listarNaoIdentificadas,
                ordenacao: modelo.config.ordenacao,
              }
            : PADRAO
        }
      />
    </>
  );
}
