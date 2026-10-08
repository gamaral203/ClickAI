// Reconhecimento facial: o provedor que compara a selfie com os rostos das fotos do evento.
// Com credenciais da AWS, usa o Amazon Rekognition (uma coleção de rostos por evento); sem
// elas, os dados de exemplo simulam o resultado.
//
// Regra do projeto (docs/CLAUDE.md): a selfie nunca é gravada. Ela chega aqui como bytes em
// memória, vai ao provedor só para a busca (SearchFacesByImage não guarda a imagem) e é
// descartada no fim da requisição. Nada daqui escreve a selfie em log.

import "server-only";

import { createHash } from "node:crypto";

import {
  CreateCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  ResourceAlreadyExistsException,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";

/** Semelhança mínima (0–100). Alta, para não mostrar fotos de outra pessoa (docs/riscos.md). */
const SEMELHANCA_MINIMA = 95;

type ConfigRekognition = { regiao: string; prefixo: string };

function configRekognition(): ConfigRekognition | null {
  const regiao = process.env.AWS_REGION;
  if (!regiao || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  return { regiao, prefixo: process.env.REKOGNITION_PREFIXO || "clicouai" };
}

export function provedorFacial(): "rekognition" | "exemplo" {
  return configRekognition() ? "rekognition" : "exemplo";
}

let cliente: RekognitionClient | null = null;
function rekognition(config: ConfigRekognition) {
  // As chaves vêm das variáveis AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY, lidas pelo SDK.
  cliente ??= new RekognitionClient({ region: config.regiao });
  return cliente;
}

/** Uma coleção por evento: a busca só compara com rostos daquele evento. */
function colecao(config: ConfigRekognition, eventoId: string) {
  return `${config.prefixo}-${eventoId}`;
}

/** Onde está o rosto na foto, em frações de 0 a 1 (canto superior esquerdo, largura e altura). */
export type CaixaDoRosto = { esquerda: number; topo: number; largura: number; altura: number };

export type RostoIndexado = { rostoId: string; caixa: CaixaDoRosto | null };

/**
 * Indexa os rostos de uma foto do evento. Chamado quando a foto fica pronta, no fim do
 * processamento do envio (src/servicos/envios.ts); o `ExternalImageId` é o id da foto, que
 * volta na busca. Devolve o id e a posição de cada rosto, para gravar na tabela `rostos`.
 */
export async function indexarRostos(
  eventoId: string,
  fotoId: string,
  imagem: Uint8Array,
): Promise<RostoIndexado[]> {
  const config = configRekognition();
  if (!config) return [];
  const rk = rekognition(config);
  const CollectionId = colecao(config, eventoId);
  try {
    await rk.send(new CreateCollectionCommand({ CollectionId }));
  } catch (erro) {
    if (!(erro instanceof ResourceAlreadyExistsException)) throw erro;
  }
  const resposta = await rk.send(
    new IndexFacesCommand({
      CollectionId,
      Image: { Bytes: imagem },
      ExternalImageId: fotoId,
      DetectionAttributes: [],
      MaxFaces: 50,
      QualityFilter: "AUTO",
    }),
  );
  return (resposta.FaceRecords ?? []).flatMap((r) => {
    if (!r.Face?.FaceId) return [];
    const b = r.Face.BoundingBox;
    const caixa =
      b && b.Left !== undefined && b.Top !== undefined && b.Width && b.Height
        ? { esquerda: b.Left, topo: b.Top, largura: b.Width, altura: b.Height }
        : null;
    return [{ rostoId: r.Face.FaceId, caixa }];
  });
}

/**
 * Fotos do evento em que aparece o rosto da selfie, e os rostos que bateram (para a prévia
 * ampliada no rosto). No modo de exemplo, a mesma selfie sempre cai na mesma "pessoa" dos
 * dados de exemplo.
 */
export async function buscarFotosPorSelfie(
  eventoId: string,
  selfie: Uint8Array,
  rostosDeExemplo: () => Promise<string[][]>,
): Promise<{ fotoIds: string[]; rostoIds: string[] }> {
  const config = configRekognition();
  if (!config) {
    const pessoas = await rostosDeExemplo();
    if (pessoas.length === 0) return { fotoIds: [], rostoIds: [] };
    const indice = createHash("sha256").update(selfie).digest().readUInt32BE(0) % pessoas.length;
    return { fotoIds: pessoas[indice], rostoIds: [] };
  }

  try {
    const resposta = await rekognition(config).send(
      new SearchFacesByImageCommand({
        CollectionId: colecao(config, eventoId),
        Image: { Bytes: selfie },
        FaceMatchThreshold: SEMELHANCA_MINIMA,
        MaxFaces: 1000,
        QualityFilter: "AUTO",
      }),
    );
    const encontrados = resposta.FaceMatches ?? [];
    const fotoIds = encontrados.flatMap((m) =>
      m.Face?.ExternalImageId ? [m.Face.ExternalImageId] : [],
    );
    const rostoIds = encontrados.flatMap((m) => (m.Face?.FaceId ? [m.Face.FaceId] : []));
    return { fotoIds: [...new Set(fotoIds)], rostoIds };
  } catch (erro) {
    // Sem rosto na selfie, ou evento ainda sem coleção: nenhum resultado. Só o nome do erro
    // vai para o log, nunca a requisição (que tem a selfie).
    const nome = erro instanceof Error ? erro.name : "desconhecido";
    if (nome === "InvalidParameterException" || nome === "ResourceNotFoundException") {
      return { fotoIds: [], rostoIds: [] };
    }
    console.error("Falha na busca facial", nome);
    throw new Error("Falha na busca facial");
  }
}
