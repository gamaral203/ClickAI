import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Images } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { comprasPagasDoEmail } from "@/dados";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { linkDoPedido } from "@/servicos/mensagens";
import { emailDoLinkDasCompras } from "@/servicos/recuperar-compras";

export const metadata: Metadata = {
  title: "Suas compras",
  // O link carrega o acesso: nunca indexar.
  robots: { index: false, follow: false },
};

export default function PaginaListaDeCompras(props: PageProps<"/recuperar-compras/lista">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Lista {...props} />
      </Suspense>
    </div>
  );
}

async function Lista({ searchParams }: PageProps<"/recuperar-compras/lista">) {
  const { token } = await searchParams;
  const email = typeof token === "string" ? emailDoLinkDasCompras(token) : null;
  if (!email) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border p-6">
        <h1 className="text-2xl font-bold tracking-tight">Este link venceu</h1>
        <p className="text-muted-foreground">
          O link da lista de compras vale 7 dias. Peça outro: ele chega no mesmo e-mail.
        </p>
        <Link
          href="/recuperar-compras"
          className={buttonVariants({ size: "touch", className: "w-fit" })}
        >
          Pedir outro link
        </Link>
      </div>
    );
  }
  const compras = await comprasPagasDoEmail(email);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Suas compras</h1>
        <p className="text-muted-foreground">
          Compras pagas com <strong className="text-foreground">{email}</strong>. Abra cada uma para
          baixar as fotos.
        </p>
      </div>
      {compras.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          Nenhuma compra paga com este e-mail.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {compras.map((c) => (
            <li key={c.pedidoId}>
              <a
                href={linkDoPedido(c.pedidoId)}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <Images aria-hidden="true" className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{c.eventos.join(", ") || "Fotos"}</span>
                  <span className="text-sm text-muted-foreground">
                    {c.itens} {c.itens === 1 ? "foto" : "fotos"} · {formatarPreco(c.totalCentavos)}{" "}
                    · {formatarDataEHora(c.pagoEm)}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                  Baixar
                  <ChevronRight aria-hidden="true" className="size-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
