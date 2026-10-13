import { FaixaFotosCompradas } from "@/components/carrinho/faixa-fotos-compradas";
import { Cabecalho } from "@/components/site/cabecalho";
import { Rodape } from "@/components/site/rodape";
import { ChatDoSite } from "@/components/suporte/chat-do-site";

export default function LayoutCliente({ children }: LayoutProps<"/">) {
  return (
    <>
      <Cabecalho />
      {/* Quem comprou neste navegador: o atalho para as fotos (some na página do pedido). */}
      <FaixaFotosCompradas />
      <main className="flex-1">{children}</main>
      <Rodape />
      {/* Chat de ajuda com a equipe (e o WhatsApp), para cliente e visitante. */}
      <ChatDoSite />
    </>
  );
}
