import "server-only";

import {
  configuracaoDaMarca,
  contarFotosComPreviaAntiga,
  listarFotosComPreviaAntiga,
  modeloMarcaDoEvento,
  trocarPreviaDaFoto,
  type AlvoDaRegeracao,
  type ConfigMarcaEmVigor,
  type FotoComPreviaAntiga,
} from "@/dados";
import { emParalelo } from "@/lib/concorrencia";
import { LIMITE_FOTO_BYTES } from "@/lib/limites-envio";
import { chaveDaPreviaCelular, type ModeloMarca } from "@/lib/marca-dagua";
import { gravarPublico, lerOriginal, modoEnvio, removerPublico } from "@/lib/r2";

import { chavesDaFoto, PROCESSAMENTOS_NO_SERVIDOR, reservarMemoriaDoProcessamento } from "./envios";
import { gerarVersoes } from "./imagens";

// Regera prévia e miniatura das fotos já enviadas com uma versão anterior da marca d'água
// (docs/riscos.md, "Marca d'água removida com ferramentas de IA"; docs/arquitetura.md, "Upload").
// Tudo no servidor, a partir do original no bucket privado, que nunca sai dele: só as versões
// com marca vão ao bucket público.
//
// O que entra (src/dados/previas.ts, AlvoDaRegeracao): sem pedido do gestor, só as versões 2 e
// 3 (sem a prévia do celular); com o pedido confirmado em /admin/marca-dagua para a revisão em
// vigor da configuração, toda prévia que não está nela. Fotos novas já saem com a configuração
// em vigor; mudar a configuração não mexe nas já enviadas até o gestor pedir.
//
// Para cada foto: lê o original, gera as versões com a marca atual (no modelo do dono do
// evento, com a configuração em vigor e o desenho próprio da foto), grava com a CHAVE NOVA
// (`...-v5-r2.webp`, que fura o cache do navegador e da CDN), troca as chaves no banco num UPDATE condicional e só então apaga a prévia
// e a miniatura antigas do R2. Idempotente: a foto já trocada sai da lista (a chave tem o sufixo
// da versão atual); duas chamadas ao mesmo tempo gravam o mesmo conteúdo nas mesmas chaves e só
// uma troca no banco e apaga as antigas. Se a função morrer no meio, a foto continua com a
// prévia antiga (que ainda existe) e volta na próxima chamada.
//
// Quem dispara: a rota /api/jobs/regerar-previas (Bearer CRON_SECRET, por evento ou em todos) e
// o job de revisão (/api/jobs/revisao), com o tempo que sobra, até acabar.

/** O que a regeração refaz agora, pela configuração em vigor. */
export function alvoDaRegeracao(config: Pick<ConfigMarcaEmVigor, "revisao" | "regeracaoPedida">) {
  const alvo: AlvoDaRegeracao = config.regeracaoPedida
    ? { tipo: "revisao", revisao: config.revisao }
    : { tipo: "minima" };
  return alvo;
}

/** Fotos listadas por chamada (no máximo; o prazo costuma parar antes). */
export const FOTOS_REGERADAS_POR_VEZ = 600;

export type ResultadoRegeracao = {
  regeradas: number;
  /** Fotos que falharam nesta chamada (ficam com a prévia antiga e voltam na próxima). */
  falhas: number;
  /** Fotos que ainda têm prévia antiga depois desta chamada. */
  restantes: number;
};

/**
 * Regera, até `prazoMs`, as prévias antigas: do evento `eventoId`, ou de todos (o evento mais
 * recente primeiro). Sem o R2 configurado (desenvolvimento sem armazenamento), não faz nada.
 */
export async function regerarPrevias({
  eventoId,
  limite = FOTOS_REGERADAS_POR_VEZ,
  prazoMs,
}: {
  eventoId?: string;
  limite?: number;
  prazoMs: number;
}): Promise<ResultadoRegeracao> {
  const resultado: ResultadoRegeracao = { regeradas: 0, falhas: 0, restantes: 0 };
  if (modoEnvio() !== "r2") return resultado;
  const fim = Date.now() + prazoMs;
  const marca = await configuracaoDaMarca();
  const alvo = alvoDaRegeracao(marca);
  const fotos = await listarFotosComPreviaAntiga(alvo, limite, eventoId);
  const modelos = new Map<string, Promise<ModeloMarca>>();
  const modeloDo = (id: string) => {
    let modelo = modelos.get(id);
    if (!modelo) modelos.set(id, (modelo = modeloMarcaDoEvento(id)));
    return modelo;
  };

  await emParalelo(fotos, PROCESSAMENTOS_NO_SERVIDOR, async (foto) => {
    if (Date.now() > fim) return;
    try {
      if (await regerarUma(foto, await modeloDo(foto.eventoId), marca)) resultado.regeradas++;
    } catch (erro) {
      // Só o id: nada do arquivo vai para o log.
      console.error(`[previas] falha ao regerar a prévia da foto ${foto.id}`, erro);
      resultado.falhas++;
    }
  });
  resultado.restantes = await contarFotosComPreviaAntiga(alvo, eventoId);
  return resultado;
}

/** Regera uma foto. `false` se outra chamada trocou as chaves antes. */
async function regerarUma(
  foto: FotoComPreviaAntiga,
  modelo: ModeloMarca,
  marca: ConfigMarcaEmVigor,
): Promise<boolean> {
  const novas = chavesDaFoto(foto.enviadaPor, foto.eventoId, foto.id, "jpeg", marca.revisao);
  const liberar = await reservarMemoriaDoProcessamento(foto.tamanhoBytes || LIMITE_FOTO_BYTES);
  try {
    const original = await lerOriginal(foto.chaveOriginal);
    const { previa, previaCelular, miniatura } = await gerarVersoes(original, modelo, {
      semente: foto.id,
      config: marca,
    });
    await Promise.all([
      gravarPublico(novas.previa, previa.buffer, "image/webp"),
      gravarPublico(novas.previaCelular, previaCelular.buffer, "image/webp"),
      gravarPublico(novas.miniatura, miniatura.buffer, "image/webp"),
    ]);
  } finally {
    liberar();
  }
  const trocou = await trocarPreviaDaFoto(
    foto.id,
    { urlPrevia: foto.urlPrevia, urlMiniatura: foto.urlMiniatura },
    { urlPrevia: novas.previa, urlMiniatura: novas.miniatura },
  );
  if (!trocou) return false;
  // A foto já aponta para as novas: as antigas (com a marca de outra versão) saem do bucket.
  // Uma falha aqui não desfaz a troca; a chave antiga já não aparece em nenhuma página.
  await Promise.all(
    [foto.urlPrevia, chaveDaPreviaCelular(foto.urlPrevia), foto.urlMiniatura]
      .filter((chave): chave is string => chave !== null)
      .filter((chave) => !Object.values(novas).includes(chave))
      .map((chave) =>
        removerPublico(chave).catch((erro) =>
          console.error(`[previas] falha ao apagar a prévia antiga da foto ${foto.id}`, erro),
        ),
      ),
  );
  return true;
}
