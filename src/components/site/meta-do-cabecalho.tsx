import { CartaoMeta } from "@/components/metas/cartao-meta";
import { buscarContaDoFotografo, totalVendidoComoAutor } from "@/dados";
import type { Usuario } from "@/dados/tipos";
import { situacaoDasMetas } from "@/lib/metas";
import { mostraCartaoMeta, usaPainel, type ItemNavegacao } from "@/lib/navegacao";
import { avatarPadrao, urlDoAvatar } from "@/lib/avatares";

import { LinkDoPerfil } from "./link-do-perfil";

/**
 * Parte do perfil no cabeçalho do painel em tela larga (lg e xl). Quem tem conta de fotógrafo,
 * qualquer que seja o papel (o gestor que também vende, inclusive), vê em xl o cartão da meta com a
 * foto de perfil (ou o avatar) no lugar do nome e, entre lg e xl, o avatar e o nome; quem não tem,
 * o avatar padrão e o nome. Em telas menores, o cartão fica no topo do painel. Recebe o usuário já
 * lido pelo cabeçalho; consulta o banco: usar dentro de <Suspense>.
 */
export async function MetaDoCabecalho({
  usuario,
  perfil,
}: {
  usuario: Usuario;
  perfil: ItemNavegacao | null;
}) {
  const conta = usaPainel(usuario) ? await buscarContaDoFotografo(usuario.id) : null;
  const primeiroNome = usuario.nome.split(" ")[0];
  if (!conta || !mostraCartaoMeta(usuario, conta)) {
    // Sem conta de fotógrafo (o gestor que não vende): o avatar padrão, tirado do id do usuário.
    return perfil ? (
      <LinkDoPerfil
        perfil={perfil}
        primeiroNome={primeiroNome}
        avatar={avatarPadrao(usuario.id).url}
        faixa="lg-e-xl"
      />
    ) : null;
  }
  const foto = urlDoAvatar(conta);
  const metas = situacaoDasMetas(await totalVendidoComoAutor(conta.id));
  return (
    <>
      {/* Entre lg e xl não cabe o cartão: avatar e nome levando ao perfil. */}
      {perfil && (
        <LinkDoPerfil perfil={perfil} primeiroNome={primeiroNome} avatar={foto} faixa="lg" />
      )}
      <div className="hidden xl:flex">
        <CartaoMeta metas={metas} foto={foto} />
      </div>
    </>
  );
}
