import { SeloMeta } from "@/components/metas/selo-meta";
import { buscarContaDoFotografo, totalVendidoComoAutor } from "@/dados";
import { situacaoDasMetas } from "@/lib/metas";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";

/**
 * Linha logo abaixo do cabeçalho, alinhada à direita (embaixo do perfil), com o selo da meta de
 * vendas. Só para quem vende e só no computador; no celular, o selo fica no topo do painel.
 * Lê o cookie da sessão: usar dentro de <Suspense>.
 */
export async function MetaDoCabecalho() {
  const usuario = await usuarioAtual();
  if (!usuario || !podeUsarPainel(usuario)) return null;
  const conta = await buscarContaDoFotografo(usuario.id);
  if (!conta) return null;
  const metas = situacaoDasMetas(await totalVendidoComoAutor(conta.id));
  return (
    <div className="mx-auto hidden max-w-6xl justify-end px-4 pb-3 lg:flex">
      <SeloMeta metas={metas} compacto />
    </div>
  );
}
