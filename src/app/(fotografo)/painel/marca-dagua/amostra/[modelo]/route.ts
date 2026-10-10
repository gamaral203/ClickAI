import { ehModeloMarca, type ModeloMarca } from "@/lib/marca-dagua";
import { amostraDaMarca } from "@/servicos/imagens";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";

// Amostra de cada modelo de marca d'água numa foto de exemplo (Painel > Marca d'água). Só para
// quem usa o painel; cada modelo é desenhado uma vez por instância e fica em memória.

const amostras = new Map<ModeloMarca, Promise<Buffer>>();

export async function GET(
  _req: Request,
  { params }: RouteContext<"/painel/marca-dagua/amostra/[modelo]">,
) {
  const usuario = await usuarioAtual();
  if (!usuario || !podeUsarPainel(usuario)) return new Response(null, { status: 401 });
  const { modelo } = await params;
  if (!ehModeloMarca(modelo)) return new Response(null, { status: 404 });
  let amostra = amostras.get(modelo);
  if (!amostra) {
    amostra = amostraDaMarca(modelo);
    amostra.catch(() => amostras.delete(modelo));
    amostras.set(modelo, amostra);
  }
  return new Response(new Uint8Array(await amostra), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" },
  });
}
