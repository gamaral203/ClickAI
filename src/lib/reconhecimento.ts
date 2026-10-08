// Reconhecimento facial: o provedor que compara a selfie com os rostos das fotos do evento.
// Com as credenciais REKOGNITION_*, usa o Amazon Rekognition (uma coleção de rostos por evento);
// sem elas, os dados de exemplo simulam o resultado.
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

/**
 * Semelhança mínima (0–100) para a foto entrar no resultado. Alta, para não mostrar fotos de
 * outra pessoa (docs/riscos.md), mas não tanto: em foto de evento (rosto pequeno, de lado, suado,
 * com óculos) a mesma pessoa costuma dar entre 85 e 95, e 95 escondia fotos certas. Ajustável por
 * REKOGNITION_SEMELHANCA, entre 80 e 99.
 */
function semelhancaMinima() {
  const valor = Number(process.env.REKOGNITION_SEMELHANCA);
  return Number.isFinite(valor) && valor >= 80 && valor <= 99 ? valor : 90;
}

/** Sem o Rekognition em produção a busca não pode cair nos dados de exemplo: avisa que está desligada. */
export class BuscaFacialDesligada extends Error {
  constructor() {
    super("Busca por selfie não configurada");
    this.name = "BuscaFacialDesligada";
  }
}

type ConfigRekognition = {
  regiao: string;
  prefixo: string;
  credenciais: { accessKeyId: string; secretAccessKey: string };
};

/**
 * Nomes próprios, de propósito, e sem cair nas AWS_*: na Vercel, AWS_REGION vem preenchida com a
 * região da função, e AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN podem existir
 * com credenciais da própria plataforma, que não valem na nossa conta da AWS. Com elas, o painel
 * dizia "configurado" e o Rekognition recusava tudo (UnrecognizedClientException).
 */
function configRekognition(): ConfigRekognition | null {
  const regiao = process.env.REKOGNITION_REGIAO?.trim();
  const accessKeyId = process.env.REKOGNITION_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.REKOGNITION_SECRET_ACCESS_KEY?.trim();
  if (!regiao || !accessKeyId || !secretAccessKey) return null;
  return {
    regiao,
    prefixo: process.env.REKOGNITION_PREFIXO || "clicouai",
    credenciais: { accessKeyId, secretAccessKey },
  };
}

export function provedorFacial(): "rekognition" | "exemplo" {
  return configRekognition() ? "rekognition" : "exemplo";
}

let cliente: { chave: string; rk: RekognitionClient } | null = null;
function rekognition(config: ConfigRekognition) {
  // Credenciais passadas aqui, nunca pela cadeia padrão do SDK (que leria as AWS_* da Vercel).
  // Troca de chave ou região (novo deploy, teste) cria outro cliente.
  const chave = `${config.regiao}:${config.credenciais.accessKeyId}`;
  if (cliente?.chave !== chave) {
    cliente = {
      chave,
      rk: new RekognitionClient({ region: config.regiao, credentials: config.credenciais }),
    };
  }
  return cliente.rk;
}

/** Nome do erro da AWS (ex.: AccessDeniedException), o único detalhe que vai para o log. */
export function nomeDoErro(erro: unknown) {
  return erro instanceof Error ? erro.name : "desconhecido";
}

/** Erros que indicam chave, segredo, região ou permissão errados, e não um problema da foto. */
const ERROS_DE_CREDENCIAL = new Set([
  "UnrecognizedClientException",
  "InvalidSignatureException",
  "AccessDeniedException",
  "ExpiredTokenException",
  "InvalidClientTokenId",
  "SignatureDoesNotMatch",
  "CredentialsProviderError",
]);

export function ehErroDeCredencial(erro: unknown) {
  return ERROS_DE_CREDENCIAL.has(nomeDoErro(erro));
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
      MaxFaces: 100,
      // "LOW" guarda também rostos menores, de lado ou tremidos, comuns em corrida e festa; o
      // filtro "AUTO" descartava boa parte deles e a pessoa não se achava.
      QualityFilter: "LOW",
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
  if (!config && process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
    throw new BuscaFacialDesligada();
  }
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
        FaceMatchThreshold: semelhancaMinima(),
        MaxFaces: 1000,
        // A selfie já é boa o bastante; o filtro só recusaria selfies escuras sem necessidade.
        QualityFilter: "NONE",
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
    // vai para o log, nunca a requisição nem o erro inteiro (que podem ter a selfie).
    const nome = nomeDoErro(erro);
    if (nome === "InvalidParameterException" || nome === "ResourceNotFoundException") {
      return { fotoIds: [], rostoIds: [] };
    }
    console.error(
      `[busca-facial] o Rekognition recusou a busca: ${nome}` +
        (ehErroDeCredencial(erro)
          ? " (confira REKOGNITION_REGIAO, REKOGNITION_ACCESS_KEY_ID, REKOGNITION_SECRET_ACCESS_KEY e as permissões do usuário IAM)"
          : ""),
    );
    throw new Error("Falha na busca facial");
  }
}
