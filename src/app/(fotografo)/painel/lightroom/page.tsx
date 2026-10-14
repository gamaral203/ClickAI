import type { Metadata } from "next";
import { Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Lightroom",
  robots: { index: false, follow: false },
};

// Em breve: o plugin do Lightroom Classic ainda não existe. As chaves de acesso e a API do plugin
// já estão prontas (src/servicos/chaves-api.ts, /api/plugin/*, docs/arquitetura.md, "Plugin do
// Lightroom"); quando o plugin sair, esta página volta a mostrar as chaves
// (src/components/painel/chaves-do-lightroom.tsx) e o download do plugin.
export default function PaginaLightroom() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Lightroom</h1>
          <span className="rounded-full bg-highlight/25 px-3 py-1 text-sm font-semibold">
            Em breve
          </span>
        </div>
        <p className="text-muted-foreground">
          Publique as fotos direto do Lightroom Classic nos seus eventos, sem passar pelo navegador.
        </p>
      </div>
      <section className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Estamos preparando o plugin</h2>
          <p className="text-sm text-muted-foreground">
            Em breve você instala o plugin do ClicouAí no Lightroom Classic, escolhe o evento e
            publica as fotos editadas com um clique. Por enquanto, exporte as fotos e envie pela
            página do evento em Meus eventos.
          </p>
        </div>
      </section>
    </div>
  );
}
