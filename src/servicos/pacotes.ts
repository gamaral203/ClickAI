import "server-only";

import { z } from "zod";

import { buscarRegrasDeDesconto, precoDoItem, type Evento, type Foto } from "@/dados";
import { assinar, conferirAssinatura } from "@/lib/assinatura";

import { pacoteVigente, precoDoPacote, type PacoteEscolhido } from "./descontos";

// Pacote "todas as minhas fotos" (docs/arquitetura.md, "Compra e pagamento"). Só vale para as
// fotos que a busca encontrou. A busca devolve um token assinado com essas fotos; o carrinho
// guarda o token e o servidor confere a assinatura antes de dar o preço do pacote. Sem isso,
// qualquer um poderia montar um "pacote" com o evento inteiro.

const PROPOSITO = "pacote";
/** O token do pacote vale por 7 dias: o tempo de o carrinho ficar esquecido e voltar. */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

export type OfertaPacote = {
  token: string;
  eventoId: string;
  fotoIds: string[];
  quantidade: number;
  precoCentavos: number;
  /** Quanto as mesmas fotos custariam uma a uma. */
  normalCentavos: number;
};

/** Oferta do pacote para as fotos encontradas pela busca, se o evento tem pacote e compensa. */
export async function ofertaDePacote(
  evento: Evento,
  encontradas: Foto[],
): Promise<OfertaPacote | null> {
  const fotos = encontradas.filter((f) => f.tipo === "foto");
  const { pacotes } = await buscarRegrasDeDesconto([evento.id]);
  const pacote = pacoteVigente(pacotes, evento.id, Date.now());
  const preco = pacote ? precoDoPacote(pacote, fotos.length) : null;
  const normal = fotos.reduce((s, f) => s + precoDoItem(f, evento), 0);
  if (preco === null || preco >= normal) return null;
  const fotoIds = fotos.map((f) => f.id).sort();
  return {
    token: assinar(PROPOSITO, { e: evento.id, i: fotoIds }, VALIDADE_MS),
    eventoId: evento.id,
    fotoIds,
    quantidade: fotos.length,
    precoCentavos: preco,
    normalCentavos: normal,
  };
}

const conteudo = z.object({ e: z.uuid(), i: z.array(z.uuid()).min(1).max(200) });

/**
 * Pacotes escolhidos a partir dos tokens que o navegador mandou. Token alterado, vencido ou
 * malformado é ignorado; dois tokens do mesmo evento: vale o último.
 */
export function lerPacotesEscolhidos(tokens: string[]): PacoteEscolhido[] {
  const porEvento = new Map<string, PacoteEscolhido>();
  for (const token of tokens) {
    const dados = conteudo.safeParse(conferirAssinatura(PROPOSITO, token));
    if (dados.success) {
      porEvento.set(dados.data.e, { eventoId: dados.data.e, fotoIds: dados.data.i });
    }
  }
  return [...porEvento.values()];
}
