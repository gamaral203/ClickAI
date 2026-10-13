import { Cabecalho } from "@/components/site/cabecalho";
import { Rodape } from "@/components/site/rodape";
import { ChatDoSite } from "@/components/suporte/chat-do-site";

export default function LayoutCliente({ children }: LayoutProps<"/">) {
  return (
    <>
      <Cabecalho />
      <main className="flex-1">{children}</main>
      <Rodape />
      {/* Chat de ajuda com a equipe (e o WhatsApp), para cliente e visitante. */}
      <ChatDoSite />
    </>
  );
}
