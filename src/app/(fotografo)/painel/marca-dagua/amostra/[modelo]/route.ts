import { ajustesDaMarcaDaConta, buscarContaDoFotografo, configuracaoDaMarca } from "@/dados";
import { ehModeloMarca } from "@/lib/marca-dagua";
import { aplicarAjustesDaMarca, esquemaAjustesMarca } from "@/lib/protecao-previas";
import { amostraDaMarca } from "@/servicos/imagens";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";

// Amostra de cada modelo de marca d'água numa foto de exemplo (Painel > Marca d'água), com a
// configuração global (/admin/marca-dagua) e os ajustes do fotógrafo por cima: os da tela
// (?tamanhoPct=&quantidade=&opacidadePct=, para a amostra ao vivo, antes de salvar) ou, sem eles,
// os salvos na conta. Só para quem usa o painel; os valores passam pelos mesmos limites do salvar.
// Cada combinação é desenhada uma vez por instância e fica em memória.

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

  const busca = new URL(request.url).searchParams;
  let ajustes;
  if (busca.has("tamanhoPct")) {
    const daTela = esquemaAjustesMarca.safeParse({
      tamanhoPct: busca.get("tamanhoPct"),
      quantidade: busca.get("quantidade"),
      opacidadePct: busca.get("opacidadePct"),
      larguraPrevia: busca.get("larguraPrevia"),
      variacao: busca.get("variacao") === "1",
    });
    if (!daTela.success) return new Response(null, { status: 400 });
    ajustes = daTela.data;
  } else {
    const conta = await buscarContaDoFotografo(usuario.id);
    ajustes = conta ? ajustesDaMarcaDaConta(conta) : null;
  }

  const config = aplicarAjustesDaMarca(await configuracaoDaMarca(), ajustes);
  const chave = `${modelo}:${config.revisao}:${config.tamanhoPct}:${config.quantidade}:${config.opacidadePct}:${config.larguraPrevia}:${config.variacao}`;
  let amostra = amostras.get(chave);
  if (!amostra) {
    if (amostras.size > 60) amostras.clear();
    amostra = amostraDaMarca(modelo, config);
    amostra.catch(() => amostras.delete(chave));
    amostras.set(chave, amostra);
  }
  return new Response(new Uint8Array(await amostra), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300" },
  });
}
