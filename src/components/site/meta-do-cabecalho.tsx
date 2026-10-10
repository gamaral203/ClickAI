import { SeloMeta } from "@/components/metas/selo-meta";
import { buscarContaDoFotografo, totalVendidoComoAutor } from "@/dados";
import type { Usuario } from "@/dados/tipos";
import { situacaoDasMetas } from "@/lib/metas";
import { podeUsarPainel } from "@/servicos/sessao";

/**
 * Linha logo abaixo do cabeçalho do painel, alinhada à direita (embaixo do perfil), com o selo da
 * meta de vendas. Só para quem vende e só no computador; no celular, o selo fica no topo do
 * painel. Recebe o usuário já lido pelo cabeçalho; consulta o banco: usar dentro de <Suspense>.
 */
export async function MetaDoCabecalho({ usuario }: { usuario: Usuario }) {
  if (!podeUsarPainel(usuario)) return null;
  const conta = await buscarContaDoFotografo(usuario.id);
  if (!conta) return null;
  const metas = situacaoDasMetas(await totalVendidoComoAutor(conta.id));
  return (
    <div className="mx-auto hidden max-w-6xl justify-end px-4 pb-3 lg:flex">
      <SeloMeta metas={metas} compacto />
    </div>
  );
}
