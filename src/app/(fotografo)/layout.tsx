import { Cabecalho } from "@/components/site/cabecalho";
import { PortaoManutencao } from "@/components/site/manutencao";
import { Rodape } from "@/components/site/rodape";

export default function LayoutFotografo({ children }: LayoutProps<"/">) {
  return (
    // Com a manutenção ligada, quem não é gestor vê só a tela de manutenção (sem cabeçalho).
    <PortaoManutencao>
      <Cabecalho />
      <main className="flex-1">{children}</main>
      <Rodape />
    </PortaoManutencao>
  );
}
