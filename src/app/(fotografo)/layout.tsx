import { Cabecalho } from "@/components/site/cabecalho";
import { Rodape } from "@/components/site/rodape";

export default function LayoutFotografo({ children }: LayoutProps<"/">) {
  return (
    <>
      <Cabecalho />
      <main className="flex-1">{children}</main>
      <Rodape />
    </>
  );
}
