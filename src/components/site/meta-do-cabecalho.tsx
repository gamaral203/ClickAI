import { CartaoMeta } from "@/components/metas/cartao-meta";
import { buscarContaDoFotografo, totalVendidoComoAutor } from "@/dados";
import type { Usuario } from "@/dados/tipos";
import { situacaoDasMetas } from "@/lib/metas";
import { urlPublica } from "@/lib/url-publica";
import { podeUsarPainel } from "@/servicos/sessao";

/**
 * Cartão da meta de vendas no cabeçalho do painel, com a foto de perfil no lugar do nome. Só para
 * o fotógrafo (a conta de gestão não tem meta) e só em tela larga (xl), onde cabe ao lado dos
 * atalhos; em telas menores, o cartão fica no topo do painel. Recebe o usuário já lido pelo
 * cabeçalho; consulta o banco: usar dentro de <Suspense>.
 */
export async function MetaDoCabecalho({ usuario }: { usuario: Usuario }) {
  if (usuario.papel === "admin" || !podeUsarPainel(usuario)) return null;
  const conta = await buscarContaDoFotografo(usuario.id);
  if (!conta) return null;
  const metas = situacaoDasMetas(await totalVendidoComoAutor(conta.id));
  return (
    <div className="hidden xl:flex">
      <CartaoMeta
        metas={metas}
        nome={conta.nomePublico}
        foto={conta.fotoPerfil ? urlPublica(conta.fotoPerfil) : null}
      />
    </div>
  );
}
