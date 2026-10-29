import Link from "next/link";

/** Abas do Painel de uso: gastos e uso do sistema / Financeiro da ClicouAí. */
export function AbasDoPainelDeUso({ atual }: { atual: "uso" | "financeiro" }) {
  const abas = [
    { id: "uso", href: "/admin/uso", rotulo: "Gastos e uso" },
    { id: "financeiro", href: "/admin/uso/financeiro", rotulo: "Financeiro da ClicouAí" },
  ] as const;
  return (
    <nav aria-label="Seções do painel de uso" className="flex gap-1 border-b">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={atual === a.id ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
            atual === a.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
