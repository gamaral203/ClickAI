import { temRespostaNaoLida } from "@/dados";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";

import { ChatSuporte } from "./chat-suporte";

/** Chat de ajuda de quem usa o painel. Lê a sessão: usar dentro de <Suspense>. */
export async function ChatDoPainel() {
  const usuario = await usuarioAtual();
  if (!usuario || !podeUsarPainel(usuario)) return null;
  return <ChatSuporte novidade={await temRespostaNaoLida(usuario.id)} />;
}
