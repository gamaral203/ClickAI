// Quem passou quem no ranking da equipe do evento (Top Cliques) depois de uma venda. Função pura:
// recebe a classificação já com a venda e quanto cada fotógrafo vendeu nesse pedido, e devolve o
// aviso de cada pessoa da equipe. Serviço que envia: src/servicos/avisos-ranking.ts.
//
// Regras:
// - A ultrapassou B: antes A tinha no máximo o mesmo que B, agora tem mais (empate não conta).
// - Novo 1º lugar: A agora vende mais que todos, e antes não vendia mais que todos.
// - Cada pessoa recebe no máximo um aviso por evento e por venda.
// - Os colegas aparecem como na tela do ranking: "Fotógrafo N", com N a posição dele agora (só a
//   própria pessoa vê o seu nome; docs/arquitetura.md, Top Cliques).

export type Posicao = { fotografoId: string; vendidas: number };

export type AvisoDeRanking =
  | { fotografoId: string; tipo: "ultrapassado"; por: string; virouLider: boolean; posicao: number }
  | { fotografoId: string; tipo: "novo_lider"; por: string }
  | { fotografoId: string; tipo: "voce_lider" };

/**
 * @param depois a classificação já com a venda, da 1ª posição para a última
 * @param doPedido fotos vendidas neste pedido, por fotógrafo (só deste evento)
 */
export function avisosDoRanking(
  depois: Posicao[],
  doPedido: ReadonlyMap<string, number>,
): AvisoDeRanking[] {
  if (depois.length < 2) return [];
  const agora = new Map(depois.map((p) => [p.fotografoId, p.vendidas]));
  const antes = new Map(
    depois.map((p) => [p.fotografoId, p.vendidas - (doPedido.get(p.fotografoId) ?? 0)]),
  );
  const outros = (id: string) => depois.filter((p) => p.fotografoId !== id);

  const lider = depois[0].fotografoId;
  const liderSozinho = outros(lider).every((p) => agora.get(lider)! > p.vendidas);
  const jaEraSozinho = outros(lider).every((p) => antes.get(lider)! > antes.get(p.fotografoId)!);
  const novoLider = liderSozinho && !jaEraSozinho && (doPedido.get(lider) ?? 0) > 0 ? lider : null;

  const avisos: AvisoDeRanking[] = [];
  for (const b of depois) {
    const id = b.fotografoId;
    if (id === novoLider) {
      avisos.push({ fotografoId: id, tipo: "voce_lider" });
      continue;
    }
    // Quem passou esta pessoa agora (o mais bem colocado, se foram vários).
    const passou = depois.find(
      (a) =>
        a.fotografoId !== id &&
        (doPedido.get(a.fotografoId) ?? 0) > 0 &&
        antes.get(a.fotografoId)! <= antes.get(id)! &&
        agora.get(a.fotografoId)! > agora.get(id)!,
    );
    if (passou) {
      avisos.push({
        fotografoId: id,
        tipo: "ultrapassado",
        por: passou.fotografoId,
        virouLider: passou.fotografoId === novoLider,
        posicao: depois.indexOf(b) + 1,
      });
    } else if (novoLider) {
      avisos.push({ fotografoId: id, tipo: "novo_lider", por: novoLider });
    }
  }
  return avisos;
}

/** Como o colega aparece para quem recebe o aviso: "Fotógrafo N", N = posição dele agora. */
export function rotuloDoColega(depois: Posicao[], fotografoId: string) {
  return `Fotógrafo ${depois.findIndex((p) => p.fotografoId === fotografoId) + 1}`;
}
