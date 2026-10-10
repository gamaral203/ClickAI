import { MenuPainel, type ItemMenu } from "@/components/site/menu-painel";

const itens: ItemMenu[] = [
  { href: "/admin", rotulo: "Visão geral", icone: "inicio" },
  { href: "/admin/vendas", rotulo: "Financeiro", icone: "financeiro" },
  { href: "/admin/saques", rotulo: "Saques", icone: "saques" },
  { href: "/admin/suporte", rotulo: "Chat de ajuda", icone: "suporte" },
  { href: "/admin/sugestoes", rotulo: "Sugestões", icone: "sugestoes" },
  { href: "/admin/denuncias", rotulo: "Denúncias", icone: "denuncias" },
  { href: "/admin/mensagens", rotulo: "Mensagens", icone: "mensagens" },
  { href: "/admin/usuarios", rotulo: "Usuários", icone: "usuarios" },
];

// O menu não decide quem entra: cada página e ação da gestão confere o papel (exigirGestor).
export default function LayoutGestao({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-10 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:py-10">
      <MenuPainel titulo="Gestão" itens={itens} raiz="/admin" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
