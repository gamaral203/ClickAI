import { SeloMeta } from "@/components/metas/selo-meta";
import { buscarContaDoFotografo, totalVendidoComoAutor } from "@/dados";
import type { Usuario } from "@/dados/tipos";
import { situacaoDasMetas } from "@/lib/metas";
import { podeUsarPainel } from "@/servicos/sessao";

/**
 * Selo da meta de vendas na linha do cabeçalho do painel, antes do nome. Só para o fotógrafo (a
 * conta de gestão não tem meta) e só em tela larga (xl), onde cabe ao lado dos atalhos; no
 * celular e em telas menores, o selo fica no topo do painel. Recebe o usuário já lido pelo
 * cabeçalho; consulta o banco: usar dentro de <Suspense>.
 */
export async function MetaDoCabecalho({ usuario }: { usuario: Usuario }) {
  if (usuario.papel === "admin" || !podeUsarPainel(usuario)) return null;
  const conta = await buscarContaDoFotografo(usuario.id);
  if (!conta) return null;
  const metas = situacaoDasMetas(await totalVendidoComoAutor(conta.id));
  return (
    <div className="hidden xl:flex">
      <SeloMeta metas={metas} compacto />
    </div>
  );
}
