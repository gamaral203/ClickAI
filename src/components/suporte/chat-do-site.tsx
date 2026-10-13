import { Suspense } from "react";

import { temRespostaNaoLida } from "@/dados";
import { usuarioAtual } from "@/servicos/sessao";
import { visitanteDoChat } from "@/servicos/suporte-visitante";

import { ChatSuporte } from "./chat-suporte";

/**
 * Chat de ajuda do site, para quem compra: o cliente logado ou o visitante sem conta (pelo cookie
 * do chat). Tem o WhatsApp dentro. Lê a sessão e o cookie, então fica no seu próprio <Suspense>
 * para não segurar a página.
 */
export function ChatDoSite() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const usuario = await usuarioAtual();
  const visitanteId = usuario ? null : await visitanteDoChat(false);
  const dono = usuario ? { usuarioId: usuario.id } : visitanteId ? { visitanteId } : null;
  return <ChatSuporte novidade={dono ? await temRespostaNaoLida(dono) : false} />;
}
