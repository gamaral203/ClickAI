import type { Metadata } from "next";
import { Suspense } from "react";

import { FormularioEvento } from "@/components/painel/formulario-evento";
import { listarCategorias } from "@/dados";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Novo evento", robots: { index: false, follow: false } };

export default function PaginaNovoEvento() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Novo evento</h1>
      <p className="text-muted-foreground">
        O evento nasce como rascunho: só você vê. Envie as fotos e publique quando quiser.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Formulario />
      </Suspense>
    </div>
  );
}

async function Formulario() {
  await exigirFotografo("/painel/eventos/novo");
  const categorias = await listarCategorias();
  return (
    <FormularioEvento
      categorias={categorias}
      inicial={{
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
      }}
    />
  );
}
