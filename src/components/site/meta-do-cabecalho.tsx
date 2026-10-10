import { CartaoMeta } from "@/components/metas/cartao-meta";
import { buscarContaDoFotografo, totalVendidoComoAutor } from "@/dados";
import type { Usuario } from "@/dados/tipos";
import { situacaoDasMetas } from "@/lib/metas";
import { mostraCartaoMeta, usaPainel, type ItemNavegacao } from "@/lib/navegacao";
import { urlPublica } from "@/lib/url-publica";

import { LinkDoPerfil } from "./link-do-perfil";

/**
 * Parte do perfil no cabeçalho do painel em tela larga (xl). Quem tem conta de fotógrafo, qualquer
 * que seja o papel (o gestor que também vende, inclusive), vê o cartão da meta com a foto de
 * perfil no lugar do nome; quem não tem, a inicial e o nome. Em telas menores, o cartão fica no
 * topo do painel. Recebe o usuário já lido pelo cabeçalho; consulta o banco: usar dentro de
 * <Suspense>.
 */
export async function MetaDoCabecalho({
  usuario,
  perfil,
}: {
  usuario: Usuario;
  perfil: ItemNavegacao | null;
}) {
  const conta = usaPainel(usuario) ? await buscarContaDoFotografo(usuario.id) : null;
  if (!conta || !mostraCartaoMeta(usuario, conta)) {
    return perfil ? (
      <LinkDoPerfil perfil={perfil} primeiroNome={usuario.nome.split(" ")[0]} faixa="xl" />
    ) : null;
  }
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
