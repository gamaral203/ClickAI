import { configuracaoDaMarca } from "@/dados";
import { ehModeloMarca } from "@/lib/marca-dagua";
import { amostraDaMarca } from "@/servicos/imagens";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";
import { respostaDaManutencao } from "@/servicos/manutencao";

// Amostra de cada modelo de marca d'água numa foto de exemplo (Painel > Marca d'água). Só para
// quem usa o painel; cada modelo é desenhado uma vez por instância e por revisão da configuração
// global (/admin/marca-dagua) e fica em memória.

const amostras = new Map<string, Promise<Buffer>>();

export async function GET(
  request: Request,
  { params }: RouteContext<"/painel/marca-dagua/amostra/[modelo]">,
) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const usuario = await usuarioAtual();
  if (!usuario || !podeUsarPainel(usuario)) return new Response(null, { status: 401 });
  const { modelo } = await params;
  if (!ehModeloMarca(modelo)) return new Response(null, { status: 404 });
  const config = await configuracaoDaMarca();
  const chave = `${modelo}:${config.revisao}`;
  let amostra = amostras.get(chave);
  if (!amostra) {
    if (amostras.size > 40) amostras.clear();
    amostra = amostraDaMarca(modelo, config);
    amostra.catch(() => amostras.delete(chave));
    amostras.set(chave, amostra);
  }
  return new Response(new Uint8Array(await amostra), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300" },
  });
}
