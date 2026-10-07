import Link from "next/link";

const itens = [
  { href: "/painel", rotulo: "Início" },
  { href: "/painel/perfil", rotulo: "Perfil e recebimento" },
];

// O menu não decide quem entra: cada página e ação do painel confere a sessão (exigirFotografo).
export default function LayoutPainel({ children }: LayoutProps<"/painel">) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Painel do fotógrafo">
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Painel
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
