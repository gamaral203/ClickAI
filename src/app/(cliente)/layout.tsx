import { FaixaFotosCompradas } from "@/components/carrinho/faixa-fotos-compradas";
import { Cabecalho } from "@/components/site/cabecalho";
import { PortaoManutencao } from "@/components/site/manutencao";
import { Rodape } from "@/components/site/rodape";
import { ChatDoSite } from "@/components/suporte/chat-do-site";

export default function LayoutCliente({ children }: LayoutProps<"/">) {
  return (
    // Com a manutenção ligada, quem não é gestor vê só a tela de manutenção (sem cabeçalho).
    <PortaoManutencao>
      <Cabecalho />
      {/* Quem comprou neste navegador: o atalho para as fotos (some na página do pedido). */}
      <FaixaFotosCompradas />
      <main className="flex-1">{children}</main>
      <Rodape />
      {/* Chat de ajuda com a equipe (e o WhatsApp), para cliente e visitante. */}
      <ChatDoSite />
    </PortaoManutencao>
  );
}
