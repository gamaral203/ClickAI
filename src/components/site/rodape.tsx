import Link from "next/link";

const links = [
  { href: "/como-funciona", rotulo: "Como funciona" },
  { href: "/eventos", rotulo: "Eventos" },
  { href: "/cadastro?tipo=fotografo", rotulo: "Venda suas fotos" },
  { href: "/privacidade", rotulo: "Privacidade" },
];

export function Rodape() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>© ClicouAí · Instagram @clicouai</span>
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex h-8 items-center hover:text-foreground">
                  {l.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
