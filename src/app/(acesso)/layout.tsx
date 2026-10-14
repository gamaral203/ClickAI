import { Suspense } from "react";

import { FaixaFotosCompradas } from "@/components/carrinho/faixa-fotos-compradas";
import { Cabecalho } from "@/components/site/cabecalho";
import { AvisoManutencaoLogin } from "@/components/site/manutencao";
import { Rodape } from "@/components/site/rodape";
import { ChatDoSite } from "@/components/suporte/chat-do-site";

// Login (/entrar e as etapas dele). Fica num grupo próprio, sem o portão da manutenção: com o
// site em manutenção, o gestor precisa conseguir entrar (docs/arquitetura.md, "Modo de
// manutenção"). Fora isso, é o mesmo layout das páginas do cliente.
export default function LayoutAcesso({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={null}>
        <AvisoManutencaoLogin />
      </Suspense>
      <Cabecalho />
      <FaixaFotosCompradas />
      <main className="flex-1">{children}</main>
      <Rodape />
      <ChatDoSite />
    </>
  );
}
