// Cloudflare R2 (docs/arquitetura.md, "Armazenamento"), pela API compatível com o S3.
//
// Dois buckets: o de originais é privado e só se lê por URL assinada de ~15 min, depois de
// conferir o pedido pago (docs/CLAUDE.md); o público guarda prévias e miniaturas com marca
// d'água, servidas por R2_URL_PUBLICA. As chaves de acesso ficam só aqui, no servidor: o
// navegador recebe apenas URLs assinadas, que valem para um objeto e por pouco tempo.
//
// Nada daqui é lido no build: sem as variáveis, o resto do site funciona e o envio de fotos
// avisa que o armazenamento não está configurado (ver modoEnvio).

import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { emProducao } from "@/db/conexao";

/** Validade das URLs assinadas (envio e download), em segundos. */
export const VALIDADE_URL_S = 15 * 60;

export const ERRO_SEM_ARMAZENAMENTO = "Armazenamento de fotos não configurado.";

type ConfigR2 = {
  contaId: string;
  chaveId: string;
  segredo: string;
  bucketOriginais: string;
  bucketPublico: string;
};

function configR2(): ConfigR2 | null {
  const c = {
    contaId: process.env.R2_ACCOUNT_ID,
    chaveId: process.env.R2_ACCESS_KEY_ID,
    segredo: process.env.R2_SECRET_ACCESS_KEY,
    bucketOriginais: process.env.R2_BUCKET_ORIGINAIS,
    bucketPublico: process.env.R2_BUCKET_PUBLICO,
  };
  if (!c.contaId || !c.chaveId || !c.segredo || !c.bucketOriginais || !c.bucketPublico) {
    return null;
  }
  if (!process.env.R2_URL_PUBLICA) return null;
  return c as ConfigR2;
}

/** As seis variáveis do R2 estão preenchidas. */
export function r2Configurado() {
  return configR2() !== null;
}

/**
 * Como o painel envia fotos: `r2` (envio real), `simulado` (só fora da produção, sem R2: cria
 * itens com imagens de exemplo) ou `indisponivel` (produção sem R2: nada é criado).
 */
export function modoEnvio(): "r2" | "simulado" | "indisponivel" {
  if (r2Configurado()) return "r2";
  return emProducao() ? "indisponivel" : "simulado";
}

function exigirConfig(): ConfigR2 {
  const config = configR2();
  if (!config) throw new Error(ERRO_SEM_ARMAZENAMENTO);
  return config;
}

let cliente: S3Client | null = null;
function s3(config: ConfigR2) {
  cliente ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.contaId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.chaveId, secretAccessKey: config.segredo },
    // Sem os checksums automáticos do SDK: numa URL assinada eles exigiriam do navegador um
    // cabeçalho com o CRC do arquivo, que ele não manda, e o R2 recusaria o envio.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cliente;
}

/** Só para os testes: descarta o cliente, para a próxima chamada ler as variáveis de novo. */
export function reiniciarClienteR2() {
  cliente = null;
}

/**
 * URL para o navegador mandar um JPEG direto ao bucket de originais (PUT), sem passar pelo
 * Next.js. Tipo e tamanho entram na assinatura: outro Content-Type ou outro tamanho é recusado
 * pelo R2.
 */
export async function urlDeEnvio(chave: string, tamanhoBytes: number) {
  const config = exigirConfig();
  return getSignedUrl(
    s3(config),
    new PutObjectCommand({
      Bucket: config.bucketOriginais,
      Key: chave,
      ContentType: "image/jpeg",
      ContentLength: tamanhoBytes,
    }),
    {
      expiresIn: VALIDADE_URL_S,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
}

/** Content-Disposition de anexo, com nome ASCII de reserva e o nome completo em UTF-8. */
export function dispositionDeAnexo(nome: string) {
  const ascii = nome.normalize("NFD").replace(/[^\w.-]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

/** URL assinada (GET, ~15 min) do original, que o navegador salva como arquivo com este nome. */
export async function urlDeDownload(chave: string, nomeArquivo: string) {
  const config = exigirConfig();
  return getSignedUrl(
    s3(config),
    new GetObjectCommand({
      Bucket: config.bucketOriginais,
      Key: chave,
      ResponseContentDisposition: dispositionDeAnexo(nomeArquivo),
      ResponseContentType: "image/jpeg",
    }),
    { expiresIn: VALIDADE_URL_S },
  );
}

/** Tamanho do objeto no bucket de originais, ou `null` se ele não existe. */
export async function tamanhoDoOriginal(chave: string): Promise<number | null> {
  const config = exigirConfig();
  try {
    const resposta = await s3(config).send(
      new HeadObjectCommand({ Bucket: config.bucketOriginais, Key: chave }),
    );
    return resposta.ContentLength ?? null;
  } catch (erro) {
    if (naoExiste(erro)) return null;
    throw erro;
  }
}

/** Lê um objeto do bucket de originais inteiro na memória (para processar a foto). */
export async function lerOriginal(chave: string): Promise<Buffer> {
  const config = exigirConfig();
  const resposta = await s3(config).send(
    new GetObjectCommand({ Bucket: config.bucketOriginais, Key: chave }),
  );
  if (!resposta.Body) throw new Error("Objeto sem conteúdo");
  return Buffer.from(await resposta.Body.transformToByteArray());
}

/** Grava no bucket público (prévias e miniaturas), com cache longo: a chave nunca muda. */
export async function gravarPublico(chave: string, conteudo: Buffer, tipo: string) {
  const config = exigirConfig();
  await s3(config).send(
    new PutObjectCommand({
      Bucket: config.bucketPublico,
      Key: chave,
      Body: conteudo,
      ContentType: tipo,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

/** Move um objeto dentro do bucket de originais (cópia + remoção da origem). */
export async function moverOriginal(de: string, para: string) {
  const config = exigirConfig();
  await s3(config).send(
    new CopyObjectCommand({
      Bucket: config.bucketOriginais,
      CopySource: `${config.bucketOriginais}/${de.split("/").map(encodeURIComponent).join("/")}`,
      Key: para,
      ContentType: "image/jpeg",
      MetadataDirective: "REPLACE",
    }),
  );
  await removerOriginal(de);
}

export async function removerOriginal(chave: string) {
  const config = exigirConfig();
  await s3(config).send(new DeleteObjectCommand({ Bucket: config.bucketOriginais, Key: chave }));
}

function naoExiste(erro: unknown) {
  const e = erro as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}
