import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { FormularioDenuncia } from "@/components/denuncia/formulario-denuncia";
import { buscarEventoPublicado, fotoEhDoEvento } from "@/dados";

export const metadata: Metadata = {
  title: "Denunciar",
  robots: { index: false, follow: false },
};

const parametros = z.object({
  evento: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  foto: z.uuid().nullable(),
});

export default function PaginaDenunciar({ searchParams }: PageProps<"/denunciar">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Pick<PageProps<"/denunciar">, "searchParams">) {
  const { evento: slug, foto } = await searchParams;
  const dados = parametros.safeParse({
    evento: Array.isArray(slug) ? slug[0] : slug,
    foto: (Array.isArray(foto) ? foto[0] : foto) ?? null,
  });
  if (!dados.success) notFound();
  const evento = await buscarEventoPublicado(dados.data.evento);
  if (!evento) notFound();
  const fotoId = dados.data.foto;
  if (fotoId && !(await fotoEhDoEvento(fotoId, evento.id))) notFound();
  const voltarPara = fotoId ? `/fotos/${fotoId}` : `/eventos/${evento.slug}`;

  return (
    <>
      <Link
        href={voltarPara}
        className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {fotoId ? "Denunciar uma foto" : "Denunciar um evento"}
        </h1>
        <p className="text-muted-foreground">
          {fotoId ? "Foto do evento " : "Evento "}
          <strong>{evento.titulo}</strong>, de {evento.fotografo.nomePublico}. A equipe do ClicouAí
          analisa cada denúncia e pode tirar o conteúdo do ar.
        </p>
      </div>
      <FormularioDenuncia slug={evento.slug} fotoId={fotoId} voltarPara={voltarPara} />
    </>
  );
}
