import { PortaoManutencao } from "@/components/site/manutencao";

// Loja própria do fotógrafo (subdomínio e domínio próprio). Com a manutenção ligada, quem não é
// gestor vê só a tela de manutenção (docs/arquitetura.md, "Modo de manutenção").
export default function LayoutLoja({ children }: LayoutProps<"/loja">) {
  return <PortaoManutencao>{children}</PortaoManutencao>;
}
