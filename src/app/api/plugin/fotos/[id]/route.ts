import { revalidatePath } from "next/cache";
import { z } from "zod";

import { excluirItem } from "@/dados";

import { comChave, resposta } from "../../comum";

// Plugin do Lightroom: apaga do evento a foto que o fotógrafo tirou da coleção publicada (ou a
// versão antiga de uma foto republicada). Exclusão lógica, como no painel: quem já comprou
// continua baixando. Só o dono do evento.

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return comChave(request, async (dono) => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return resposta({ erro: "Foto não encontrada." }, 404);
    if (!(await excluirItem(id, dono.fotografoId))) {
      return resposta({ erro: "Foto não encontrada." }, 404);
    }
    revalidatePath("/painel/eventos", "layout");
    return resposta({ ok: true });
  });
}
