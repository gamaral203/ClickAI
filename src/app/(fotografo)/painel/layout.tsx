import { Suspense } from "react";

import { MenuPainel, type ItemMenu } from "@/components/site/menu-painel";
import { ChatDoPainel } from "@/components/suporte/chat-do-painel";

const itens: ItemMenu[] = [
  { href: "/painel", rotulo: "Início", icone: "inicio" },
  { href: "/painel/metas", rotulo: "Metas", icone: "metas" },
  { href: "/painel/eventos", rotulo: "Meus eventos", icone: "eventos" },
  { href: "/painel/vendas", rotulo: "Financeiro", icone: "financeiro" },
  { href: "/painel/desempenho", rotulo: "Desempenho", icone: "desempenho" },
  { href: "/painel/descontos", rotulo: "Descontos e cupons", icone: "descontos" },
  { href: "/painel/colaboracoes", rotulo: "Colaborações", icone: "colaboracoes" },
  { href: "/painel/loja", rotulo: "Minha loja", icone: "loja" },
  { href: "/painel/marca-dagua", rotulo: "Marca d'água", icone: "marca" },
  { href: "/painel/perfil", rotulo: "Perfil e recebimento", icone: "perfil" },
];

// O menu não decide quem entra: cada página e ação do painel confere a sessão (exigirFotografo).
export default function LayoutPainel({ children }: LayoutProps<"/painel">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-10 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:py-10 print:block print:p-0">
      <div className="print:hidden">
        <MenuPainel titulo="Painel do fotógrafo" itens={itens} raiz="/painel" />
      </div>
      <div className="min-w-0">{children}</div>
      <Suspense fallback={null}>
        <ChatDoPainel />
      </Suspense>
    </div>
  );
}
