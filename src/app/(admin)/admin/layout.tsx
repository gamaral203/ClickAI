import Link from "next/link";

const itens = [
  { href: "/admin", rotulo: "Visão geral" },
  { href: "/admin/vendas", rotulo: "Vendas" },
  { href: "/admin/saques", rotulo: "Saques" },
  { href: "/admin/usuarios", rotulo: "Usuários" },
];

// O menu não decide quem entra: cada página e ação da gestão confere o papel (exigirEquipe).
export default function LayoutGestao({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Gestão do ClicouAí">
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Gestão
        </p>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {itens.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex h-11 items-center rounded-lg px-3 font-medium whitespace-nowrap hover:bg-accent hover:text-accent-foreground"
              >
                {item.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
