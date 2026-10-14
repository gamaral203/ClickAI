import { listarMeusEventos } from "@/dados";
import { urlDoSite } from "@/lib/endereco";

import { comChave, resposta } from "../comum";

// Plugin do Lightroom: os eventos para onde o fotógrafo pode publicar (os dele e aqueles em que
// colabora com o convite aceito), do mais recente para o mais antigo. Viram as coleções do
// serviço de publicação no Lightroom. Os eventos são criados no site.

export async function GET(request: Request) {
  return comChave(request, async (dono) => {
    const eventos = await listarMeusEventos(dono.fotografoId, Date.now());
    return resposta({
      eventos: eventos.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        inicioEm: e.inicioEm,
        status: e.status,
        totalItens: e.totalItens,
        url: urlDoSite(`/eventos/${e.slug}`),
        /** Evento de outro fotógrafo, em que este colabora. */
        colaboracao: e.colaboracao !== null,
      })),
    });
  });
}
