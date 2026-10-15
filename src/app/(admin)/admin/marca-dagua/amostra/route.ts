import { ehModeloMarca } from "@/lib/marca-dagua";
import { esquemaConfigMarca } from "@/lib/protecao-previas";
import { amostraDaMarca } from "@/servicos/imagens";
import { usuarioAtual } from "@/servicos/sessao";

// Amostra da marca com a configuração que o gestor está ajustando em /admin/marca-dagua, antes
// de salvar: a mesma foto de exemplo do painel do fotógrafo, desenhada pelo mesmo código das
// prévias de verdade. Só gestor; os valores passam pelos mesmos limites do salvar.

export async function GET(request: Request) {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.papel !== "admin") return new Response(null, { status: 404 });
  const busca = new URL(request.url).searchParams;
  const modelo = busca.get("modelo") ?? "padrao";
  const config = esquemaConfigMarca.safeParse({
    tamanhoPct: busca.get("tamanhoPct"),
    quantidade: busca.get("quantidade"),
    opacidadePct: busca.get("opacidadePct"),
    larguraPrevia: busca.get("larguraPrevia"),
    qualidade: busca.get("qualidade"),
    variacao: busca.get("variacao") === "1",
  });
  if (!ehModeloMarca(modelo) || !config.success) return new Response(null, { status: 400 });
  const imagem = await amostraDaMarca(modelo, config.data);
  return new Response(new Uint8Array(imagem), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" },
  });
}
