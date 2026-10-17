// Envio real de fotos ao R2 (docs/arquitetura.md, "Upload"). O arquivo vai direto do navegador
// ao bucket privado por URL assinada e nunca passa pelo Next.js; o servidor só registra a foto
// (iniciarEnvio) e, depois que o arquivo chegou, confere e processa (confirmarEnvio).
//
// Sem limite de quantidade: o navegador manda quantas fotos o fotógrafo escolher, em lotes
// automáticos de FOTOS_POR_LOTE (o tamanho do lote só existe para cada chamada caber no tempo e
// no corpo de uma requisição). O processamento (confirmarEnvio) fica fora do caminho do envio:
// o navegador chama a rota /api/envios/processar, várias fotos ao mesmo tempo, enquanto continua
// subindo as próximas; o job de revisão é a rede de segurança se a página fechar no meio.
//
// Formatos: JPEG, PNG, WebP, TIFF e AVIF, conferidos pelo conteúdo (src/lib/tipos-imagem.ts) e
// guardados como chegaram; HEIC chega já convertido em JPEG pelo navegador; RAW é recusado.
// Arquivos a partir de MULTIPART_A_PARTIR_DE sobem em partes (upload multipart do R2).

import "server-only";

import sharp from "sharp";
import { z } from "zod";

import {
  adiarProcessamento,
  armazenamentoExperimentalAtivo,
  buscarFotoEmEnvio,
  concluirFoto,
  configuracaoDaMarca,
  devolverReserva,
  hashesDoEvento,
  listarFotosParadas,
  marcarFotoComErro,
  marcaDoDonoDoEvento,
  pastaDoEventoParaEnvio,
  registrarFotosEmEnvio,
  reservarFotoParaProcessar,
  salvarRostos,
  situacaoDaConexaoDrive,
  situacaoDaFoto,
  type ChavesDaFoto,
} from "@/dados";
import {
  medir as medirArmazenamento,
  provedorDeOriginais,
  type ReferenciaOriginal,
} from "@/lib/armazenamento";
import { emParalelo, Orcamento } from "@/lib/concorrencia";
import { dataDeCaptura } from "@/lib/exif";
import { ErroDrive } from "@/lib/google-drive";
import { impressaoDoArquivo } from "@/lib/impressao-arquivo";
import {
  FOTOS_POR_LOTE,
  LIMITE_FOTO_BYTES,
  LIMITE_FOTO_TEXTO,
  LIMITE_PIXELS,
  MULTIPART_A_PARTIR_DE,
  quantasPartes,
  tamanhoDaParte,
} from "@/lib/limites-envio";
import { escolhaLiberacaoSchema } from "@/lib/liberacao";
import { sufixoDaVersao } from "@/lib/marca-dagua";
import { aplicarAjustesDaMarca } from "@/lib/protecao-previas";
import {
  abrirEnvioEmPartes,
  ERRO_SEM_ARMAZENAMENTO,
  fecharEnvioEmPartes,
  gravarPublico,
  lerEnviado,
  lerOriginal,
  lerTrecho,
  modoEnvio,
  moverOriginal,
  removerOriginal,
  tamanhoDoEnviado,
  urlDaParte,
  urlDeEnvio,
} from "@/lib/r2";
import {
  ehErroDeCredencial,
  indexarRostos,
  nomeDoErro,
  provedorFacial,
  type RostoIndexado,
} from "@/lib/reconhecimento";
import {
  BYTES_PARA_DETECTAR,
  DADOS_DO_FORMATO,
  detectarFormato,
  ehNomeDeRaw,
  FORMATOS_ACEITOS,
  formatoDaChave,
  MENSAGEM_FORMATO,
  MENSAGEM_RAW,
  type FormatoAceito,
} from "@/lib/tipos-imagem";

import {
  DADOS_DO_VIDEO,
  detectarVideo,
  DURACAO_MAXIMA_VIDEO_S,
  ehFormatoDeVideo,
  FOLGA_DURACAO_S,
  FORMATOS_DE_VIDEO,
  LIMITE_VIDEO_BYTES,
  LIMITE_VIDEO_TEXTO,
  MENSAGEM_FORMATO_VIDEO,
  MENSAGEM_VIDEO_LONGO,
  videoDaChave,
  type FormatoDeVideo,
} from "@/lib/tipos-video";

import { copiaParaRostos, gerarVersoes } from "./imagens";
import { lerNumerosDaFoto } from "./numeros";
import { prepararVideo, VideoIlegivel } from "./video";

export { FOTOS_POR_LOTE, LIMITE_FOTO_BYTES };

const impressao = z.string().regex(/^[0-9a-f]{64}$/);

const lote = z
  .array(
    z.object({
      nome: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((n) => !ehNomeDeRaw(n), MENSAGEM_RAW),
      tamanhoBytes: z.number().int().positive().max(LIMITE_VIDEO_BYTES),
      /** Impressão do arquivo (src/lib/impressao-arquivo.ts), conferida na confirmação. */
      hash: impressao,
      /** Formato real, detectado no navegador pelo conteúdo; conferido de novo no servidor. */
      formato: z.enum([...FORMATOS_ACEITOS, ...FORMATOS_DE_VIDEO]),
      /** Vídeo: duração lida no navegador (o servidor confere de novo com o FFmpeg). */
      duracaoS: z
        .number()
        .positive()
        .max(DURACAO_MAXIMA_VIDEO_S + FOLGA_DURACAO_S)
        .optional(),
    }),
  )
  .min(1)
  .max(FOTOS_POR_LOTE)
  .superRefine((itens, ctx) => {
    for (const [i, a] of itens.entries()) {
      const video = ehFormatoDeVideo(a.formato);
      if (!video && a.tamanhoBytes > LIMITE_FOTO_BYTES) {
        ctx.addIssue({ code: "custom", path: [i], message: `Até ${LIMITE_FOTO_TEXTO} por foto.` });
      }
      if (video && !a.duracaoS) {
        ctx.addIssue({ code: "custom", path: [i], message: MENSAGEM_VIDEO_LONGO });
      }
    }
  });

const idFoto = z.uuid();

/**
 * Chaves no R2 de uma foto. O id do fotógrafo e do evento no caminho facilitam auditoria; a
 * extensão é a do formato real (o download entrega o original no formato enviado). Prévia e
 * miniatura levam a versão da marca e a revisão da configuração global com que foram geradas
 * (src/lib/marca-dagua.ts, sufixoDaVersao).
 */
export function chavesDaFoto(
  fotografoId: string,
  eventoId: string,
  fotoId: string,
  formato: FormatoAceito | FormatoDeVideo = "jpeg",
  revisaoDaMarca = 0,
) {
  const caminho = `${fotografoId}/${eventoId}/${fotoId}`;
  const sufixo = sufixoDaVersao(revisaoDaMarca);
  const ext = ehFormatoDeVideo(formato)
    ? DADOS_DO_VIDEO[formato].extensao
    : DADOS_DO_FORMATO[formato].extensao;
  return {
    temporaria: `envios/${caminho}.${ext}`,
    original: `originais/${caminho}.${ext}`,
    previa: `previas/${caminho}${sufixo}`,
    /** A prévia menor, para o celular (src/lib/marca-dagua.ts, chaveDaPreviaCelular). */
    previaCelular: `previas/${caminho}${sufixo.replace(/\.webp$/, "-celular.webp")}`,
    miniatura: `miniaturas/${caminho}${sufixo}`,
    /** Vídeo: a prévia em MP4 com a marca (no bucket público). */
    previaVideo: `previas/${caminho}-video.mp4`,
  };
}

/**
 * Pasta de destino de um envio: `null` sem pasta; o id, se for uma pasta (ou subpasta) do
 * evento e quem envia for o dono ou um colaborador com o convite aceito; `false` se não vale
 * (id estranho, pasta de outro evento, fotógrafo que não é dono nem colaborador do evento).
 */
export async function pastaDeDestino(
  eventoId: string,
  pastaId: unknown,
  fotografoId: string,
): Promise<string | null | false> {
  if (pastaId === null || pastaId === undefined || pastaId === "") return null;
  const id = z.uuid().safeParse(pastaId);
  if (!id.success) return false;
  return (await pastaDoEventoParaEnvio(eventoId, id.data, fotografoId)) ? id.data : false;
}

/** URLs de um envio em partes: uma por parte, na ordem (a parte 1 é `urls[0]`). */
export type EnvioEmPartes = { uploadId: string; urls: string[] };

export type ItemDoEnvio =
  { fotoId: string; url: string } | { fotoId: string; partes: EnvioEmPartes } | { repetida: true };

/** URLs assinadas de todas as partes de um upload em partes. */
function assinarTodasAsPartes(chave: string, uploadId: string, tamanho: number) {
  return Promise.all(
    Array.from({ length: quantasPartes(tamanho) }, (_, i) =>
      urlDaParte(chave, uploadId, i + 1, tamanhoDaParte(tamanho, i + 1)),
    ),
  );
}

/**
 * Registra um lote de fotos em `processando` e devolve, para cada arquivo (na mesma ordem), a
 * URL assinada para o navegador enviar o arquivo (ou as URLs das partes, se for grande), ou
 * `repetida` se a mesma foto (mesma impressão) já está pronta no evento ou aparece duas vezes
 * no lote.
 */
export async function iniciarEnvio(
  fotografoId: string,
  eventoId: string,
  lista: unknown,
  liberacao: unknown = null,
  pastaId: unknown = null,
): Promise<{ erro: string } | { itens: ItemDoEnvio[] }> {
  if (modoEnvio() !== "r2") return { erro: ERRO_SEM_ARMAZENAMENTO };
  if (!z.uuid().safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  // Pasta (ou subpasta) de destino do lote: só do mesmo evento (escolhe o dono ou o colaborador).
  const pasta = await pastaDeDestino(eventoId, pastaId, fotografoId);
  if (pasta === false) return { erro: "Pasta não encontrada. Atualize a página." };
  // Liberação escolhida para o lote (só vale para o dono; src/dados/liberacao.ts).
  const escolha = escolhaLiberacaoSchema.nullable().safeParse(liberacao);
  if (!escolha.success) return { erro: "Escolha quando as fotos aparecem." };
  const dados = lote.safeParse(lista);
  if (!dados.success) {
    if (dados.error.issues.some((i) => i.message === MENSAGEM_RAW)) return { erro: MENSAGEM_RAW };
    if (dados.error.issues.some((i) => i.message === MENSAGEM_VIDEO_LONGO)) {
      return { erro: MENSAGEM_VIDEO_LONGO };
    }
    return {
      erro:
        `Envie as fotos em lotes de até ${FOTOS_POR_LOTE}, em JPEG, PNG, WebP, TIFF ou AVIF ` +
        `de até ${LIMITE_FOTO_TEXTO} cada (vídeos em MP4 ou MOV de até ${LIMITE_VIDEO_TEXTO} e ` +
        `${DURACAO_MAXIMA_VIDEO_S} segundos). Se o erro continuar, atualize a página.`,
    };
  }

  const jaNoEvento = await hashesDoEvento(
    eventoId,
    dados.data.map((a) => a.hash),
  );
  const vistos = new Set<string>();
  const repetida = dados.data.map((a) => {
    const sim = jaNoEvento.has(a.hash) || vistos.has(a.hash);
    vistos.add(a.hash);
    return sim;
  });
  const novos = dados.data.filter((_, i) => !repetida[i]);

  const ids = await registrarFotosEmEnvio(
    eventoId,
    fotografoId,
    novos.map((a) => ({
      ...a,
      tipo: ehFormatoDeVideo(a.formato) ? ("video" as const) : ("foto" as const),
    })),
    (fotoId, i): ChavesDaFoto => chavesDaFoto(fotografoId, eventoId, fotoId, novos[i].formato),
    escolha.data,
    pasta,
  );
  if (!ids) return { erro: "Evento não encontrado." };

  const destinos = await Promise.all(
    novos.map(async (a, i): Promise<ItemDoEnvio> => {
      const chave = chavesDaFoto(fotografoId, eventoId, ids[i], a.formato).temporaria;
      const tipo = ehFormatoDeVideo(a.formato)
        ? DADOS_DO_VIDEO[a.formato].mime
        : DADOS_DO_FORMATO[a.formato].mime;
      if (a.tamanhoBytes < MULTIPART_A_PARTIR_DE) {
        return { fotoId: ids[i], url: await urlDeEnvio(chave, a.tamanhoBytes, tipo) };
      }
      const uploadId = await abrirEnvioEmPartes(chave, tipo);
      return {
        fotoId: ids[i],
        partes: { uploadId, urls: await assinarTodasAsPartes(chave, uploadId, a.tamanhoBytes) },
      };
    }),
  );
  let proximo = 0;
  const itens = dados.data.map((_, i): ItemDoEnvio => {
    if (repetida[i]) return { repetida: true };
    return destinos[proximo++];
  });
  return { itens };
}

/**
 * Foto em `processando` desta conta, com as chaves e o formato conferidos: a chave gravada tem
 * de ser a temporária desta foto (nunca mexe em outro objeto do bucket).
 */
async function fotoEmEnvio(fotografoId: string, fotoId: string) {
  if (!idFoto.safeParse(fotoId).success) return null;
  const foto = await buscarFotoEmEnvio(fotoId, fotografoId);
  if (!foto?.chaveTemporaria || !foto.hash) return null;
  const formato = formatoDaChave(foto.chaveTemporaria) ?? videoDaChave(foto.chaveTemporaria);
  if (!formato) return null;
  const chaves = chavesDaFoto(fotografoId, foto.eventoId, foto.id, formato);
  if (foto.chaveTemporaria !== chaves.temporaria) return null;
  return { foto, chaves, formato };
}

const MAXIMO_DE_PARTES = quantasPartes(Math.max(LIMITE_FOTO_BYTES, LIMITE_VIDEO_BYTES));
const uploadId = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[\w.~+/=-]+$/);
const pedidoDePartes = z.object({
  uploadId,
  numeros: z.array(z.number().int().min(1)).min(1).max(MAXIMO_DE_PARTES),
});
const conclusaoDePartes = z.object({
  uploadId,
  partes: z
    .array(
      z.object({
        numero: z.number().int().min(1),
        etag: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[\w"-]+$/),
      }),
    )
    .min(1)
    .max(MAXIMO_DE_PARTES),
});

/**
 * Assina de novo algumas partes de um envio em partes (a URL vence em 15 minutos e um arquivo
 * grande numa conexão lenta pode passar disso), sem perder as partes já enviadas.
 */
export async function assinarPartes(
  fotografoId: string,
  fotoId: string,
  pedido: unknown,
): Promise<{ erro: string } | { urls: { numero: number; url: string }[] }> {
  if (modoEnvio() !== "r2") return { erro: ERRO_SEM_ARMAZENAMENTO };
  const dados = pedidoDePartes.safeParse(pedido);
  if (!dados.success) return { erro: "Pedido inválido." };
  const valida = await fotoEmEnvio(fotografoId, fotoId);
  if (!valida?.foto.tamanhoBytes) return { erro: "Foto não encontrada." };
  const tamanho = valida.foto.tamanhoBytes;
  const numeros = [...new Set(dados.data.numeros)];
  if (numeros.some((n) => n > quantasPartes(tamanho))) return { erro: "Pedido inválido." };
  const urls = await Promise.all(
    numeros.map(async (numero) => ({
      numero,
      url: await urlDaParte(
        valida.chaves.temporaria,
        dados.data.uploadId,
        numero,
        tamanhoDaParte(tamanho, numero),
      ),
    })),
  );
  return { urls };
}

/**
 * Fecha um envio em partes com os ETags que o R2 devolveu ao navegador. Exige todas as partes,
 * de 1 a N, sem faltar nem sobrar (N sai do tamanho registrado no início). Depois disso, o
 * arquivo está na chave temporária e segue o processamento normal (confirmarEnvio).
 * `reiniciar`: o upload não vale mais (vencido ou parte perdida) e precisa começar de novo;
 * `tentarDeNovo`: falha passageira do R2, vale repetir o mesmo pedido.
 */
export async function concluirPartes(
  fotografoId: string,
  fotoId: string,
  pedido: unknown,
): Promise<{ erro: string; reiniciar?: boolean; tentarDeNovo?: boolean } | { ok: true }> {
  if (modoEnvio() !== "r2") return { erro: ERRO_SEM_ARMAZENAMENTO };
  const dados = conclusaoDePartes.safeParse(pedido);
  if (!dados.success) return { erro: "Pedido inválido." };
  const valida = await fotoEmEnvio(fotografoId, fotoId);
  if (!valida?.foto.tamanhoBytes) return { erro: "Foto não encontrada." };
  const total = quantasPartes(valida.foto.tamanhoBytes);
  const partes = [...dados.data.partes].sort((a, b) => a.numero - b.numero);
  if (partes.length !== total || partes.some((p, i) => p.numero !== i + 1)) {
    return { erro: "Faltam partes do arquivo. Envie de novo.", reiniciar: true };
  }
  try {
    await fecharEnvioEmPartes(valida.chaves.temporaria, dados.data.uploadId, partes);
  } catch (erro) {
    const status = (erro as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    console.error(
      `[envios] falha ao fechar o envio em partes da foto ${fotoId}: ${nomeDoErro(erro)}`,
    );
    if (status && status >= 400 && status < 500) {
      return { erro: "O envio em partes não valeu. Envie de novo.", reiniciar: true };
    }
    return { erro: "Não foi possível concluir o envio. Tente de novo.", tentarDeNovo: true };
  }
  return { ok: true };
}

/** Recusa com mensagem para o fotógrafo; o arquivo temporário é apagado. */
class ArquivoRecusado extends Error {}

/**
 * Bytes de arquivo sendo processados ao mesmo tempo nesta instância da função. Com o Fluid
 * Compute, uma instância (2 GB no plano Hobby, sem como aumentar) atende várias chamadas da rota
 * de processamento de uma vez; cada foto ocupa o arquivo inteiro na memória mais ~150 MB da
 * decodificação. Com 600 MB de arquivos (três de 200 MB, ou dezenas de 20 MB), o pico fica
 * perto de 1,1 GB. Quem não cabe espera a vez (segundos), em vez de derrubar a instância.
 */
export const ORCAMENTO_DE_MEMORIA_BYTES = 600 * 1024 * 1024;
const memoria = new Orcamento(ORCAMENTO_DE_MEMORIA_BYTES);

/** Reserva memória do mesmo orçamento do envio (a regeração das prévias também abre originais). */
export function reservarMemoriaDoProcessamento(bytes: number) {
  return memoria.reservar(bytes);
}

/** Como o Sharp chama cada formato aceito (o AVIF é lido pelo libheif, como "heif"). */
const FORMATO_NO_SHARP: Record<FormatoAceito, string> = {
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  tiff: "tiff",
  avif: "heif",
};

/** Tempos de cada etapa do processamento, em ms, para a telemetria da tela de envio. */
export type TemposDoProcessamento = {
  esperaMs?: number;
  leituraMs?: number;
  conferenciaMs?: number;
  versoesMs?: number;
  gravacaoMs?: number;
  rostosMs?: number;
};

const ERRO_LEITURA = "Não foi possível ler a imagem. Exporte de novo e envie.";
const ERRO_DIFERENTE = "O arquivo chegou diferente do escolhido. Envie de novo.";

/**
 * Quanto vale a reserva de uma foto em processamento (src/dados/processamento.ts). Bem mais que
 * o processamento de uma foto (segundos; a função tem no máximo 300 s): enquanto vale, nenhuma
 * outra chamada nem o job pegam a mesma foto. Se a função morrer no meio, a reserva vence e o
 * job processa a foto depois.
 */
export const RESERVA_DO_PROCESSAMENTO_MS = 3 * 60 * 1000;
/**
 * Até quanto tempo depois do início do envio o arquivo pode ainda estar subindo (a URL assinada
 * vale 15 minutos e um PUT começado no fim dela ainda leva alguns). Antes disso, o job não marca
 * erro numa foto sem arquivo: devolve a foto para a fila e confere de novo depois.
 */
export const ENVIO_PODE_ESTAR_SUBINDO_MS = 30 * 60 * 1000;

export type OpcoesDoProcessamento = {
  /** Recebe a duração de cada etapa (telemetria da tela de envio). */
  tempos?: TemposDoProcessamento;
  /**
   * Agenda o cadastro dos rostos para depois da resposta (a rota passa o `after` do Next): a
   * foto fica pronta e a chamada termina sem esperar o Rekognition. Sem isto, cadastra aqui.
   */
  depois?: (tarefa: () => Promise<unknown>) => void;
  /**
   * Início do envio, quando quem chama é o job (a foto parada na fila). Arquivo ausente com o
   * envio ainda recente não vira erro: o upload pode estar terminando.
   */
  inicioDoEnvio?: Date;
};

export type ResultadoDoProcessamento =
  | { erro: string }
  | { eventoId: string }
  /** Outra chamada está processando a foto agora, ou ela já ficou pronta. */
  | { emAndamento: true }
  /**
   * A foto volta para a fila do job, ainda em `processando`: no job, o arquivo ainda não chegou e
   * o envio é recente; em qualquer chamada, uma falha passageira ao gravar o original no Google
   * Drive (evento `hibrido`), dentro do prazo de ENVIO_PODE_ESTAR_SUBINDO_MS.
   */
  | { aguardando: true };

/**
 * Onde gravar o original (docs/arquitetura.md, "Armazenamento experimental"): no Google Drive só
 * no evento `hibrido`, com a trava `armazenamento_experimental` ligada e a conta do Drive
 * conectada; senão, no R2, como sempre. Decidido a cada tentativa: desligar a trava (ou
 * desconectar o Drive) manda as próximas tentativas para o R2.
 */
async function destinoDoOriginal(armazenamento: "r2" | "hibrido"): Promise<"r2" | "drive"> {
  if (armazenamento !== "hibrido") return "r2";
  if (!(await armazenamentoExperimentalAtivo())) return "r2";
  return (await situacaoDaConexaoDrive()) ? "drive" : "r2";
}

/**
 * Falha ao gravar o original no Drive. `passageira` (limite de taxa, rede, 5xx, autorização a
 * renovar, Drive desconectado no meio): a foto fica em `processando` e o job tenta de novo.
 * Cota cheia e falta de permissão viram erro na hora. A mensagem é a que o fotógrafo vê, sem
 * nada do Drive (o detalhe sem segredo fica no último erro da conexão e na métrica).
 */
class FalhaNoDrive extends Error {
  constructor(
    mensagem: string,
    readonly passageira: boolean,
    readonly codigo: string,
  ) {
    super(mensagem);
  }
}

const ERRO_DRIVE_PASSAGEIRO =
  "O armazenamento dos originais não respondeu. A foto será processada de novo em alguns minutos.";
const ERRO_DRIVE_CHEIO = "O armazenamento dos originais está cheio. Fale com o suporte.";
const ERRO_DRIVE_PERMISSAO =
  "Sem permissão para gravar no armazenamento dos originais. Fale com o suporte.";

function falhaNoDrive(erro: unknown): FalhaNoDrive {
  if (erro instanceof ErroDrive) {
    if (erro.codigo === "quota") return new FalhaNoDrive(ERRO_DRIVE_CHEIO, false, erro.codigo);
    if (erro.codigo === "sem_permissao") {
      return new FalhaNoDrive(ERRO_DRIVE_PERMISSAO, false, erro.codigo);
    }
    // Outro 4xx (pedido que o Drive recusa sempre igual): repetir não ajuda.
    const status = erro.status ?? 0;
    if (erro.codigo === "outro" && status >= 400 && status < 500 && status !== 408) {
      return new FalhaNoDrive(ERRO_PROCESSAMENTO, false, `${erro.codigo}_${status}`);
    }
    return new FalhaNoDrive(ERRO_DRIVE_PASSAGEIRO, true, erro.codigo);
  }
  // Drive desconectado entre a escolha e a gravação, tamanho gravado diferente: tenta de novo
  // (a próxima tentativa escolhe o destino outra vez).
  return new FalhaNoDrive(ERRO_DRIVE_PASSAGEIRO, true, erro instanceof Error ? erro.name : "erro");
}

/** Grava o original já conferido no Drive, com a métrica `upload_original`. */
async function gravarNoDrive(args: {
  chave: string;
  conteudo: Buffer;
  tipo: string;
  fotografoId: string;
  eventoId: string;
  fotoId: string;
}): Promise<ReferenciaOriginal> {
  try {
    const provedor = await provedorDeOriginais("drive");
    return await medirArmazenamento(
      "drive",
      "upload_original",
      () => provedor.gravarOriginal(args),
      { bytes: args.conteudo.length, fotoId: args.fotoId, eventoId: args.eventoId },
    );
  } catch (erro) {
    throw falhaNoDrive(erro);
  }
}

/** Apaga um original gravado no Drive que não chegou a valer (melhor esforço). */
async function descartarDoDrive(ref: ReferenciaOriginal) {
  try {
    await (await provedorDeOriginais("drive")).removerOriginal(ref);
  } catch {
    // Fica só um arquivo órfão na pasta do evento no Drive.
  }
}

/**
 * Prévias no R2 e original no Drive ao mesmo tempo. Se o Drive falhar, a falha dele sobe (para
 * a nova tentativa); se só as prévias falharem, o original recém-gravado no Drive é apagado.
 */
async function gravarComPrevias(
  previas: Promise<unknown>[],
  gravar: () => Promise<ReferenciaOriginal>,
): Promise<ReferenciaOriginal> {
  const [publicas, original] = await Promise.allSettled([Promise.all(previas), gravar()]);
  if (original.status === "rejected") throw original.reason;
  if (publicas.status === "rejected") {
    await descartarDoDrive(original.value);
    throw publicas.reason;
  }
  return original.value;
}

/**
 * Falha ao gravar no Drive: passageira e dentro do prazo, a foto volta para a fila (como o
 * arquivo que ainda está subindo), com o motivo em `erro_mensagem`; senão, `erro` como hoje.
 */
async function tratarFalhaNoDrive(
  fotoId: string,
  falha: FalhaNoDrive,
  inicio: Date,
  agora: number,
  mensagemFinal: string,
): Promise<ResultadoDoProcessamento> {
  // Só o id e o código: nada do arquivo, do token nem do id no Drive.
  console.error(`[envios] falha ao gravar no Drive o original de ${fotoId}: ${falha.codigo}`);
  if (falha.passageira && agora - inicio.getTime() < ENVIO_PODE_ESTAR_SUBINDO_MS) {
    await adiarProcessamento(fotoId, inicio, falha.message);
    return { aguardando: true };
  }
  const mensagem = falha.passageira ? mensagemFinal : falha.message;
  await marcarFotoComErro(fotoId, mensagem);
  return { erro: mensagem };
}

/**
 * Confere e processa uma foto depois que o navegador terminou de enviá-la: tamanho (o mesmo
 * informado no início), formato real pelo conteúdo (o mesmo informado), a impressão informada
 * no início e o limite de pixels; gera prévia e miniatura com marca d'água no bucket público,
 * move o original para `originais/` e marca a foto `pronta`. Em qualquer falha, a foto fica em
 * `erro` e a mensagem volta para a tela.
 *
 * Idempotente: só quem reserva a foto (src/dados/processamento.ts) processa. Chamadas ao mesmo
 * tempo (o navegador, o segundo plano e o job) recebem `emAndamento`, e uma chamada depois de a
 * foto ficar pronta também, em vez de um erro.
 */
export async function confirmarEnvio(
  fotografoId: string,
  fotoId: string,
  opcoes: OpcoesDoProcessamento = {},
): Promise<ResultadoDoProcessamento> {
  if (modoEnvio() !== "r2") return { erro: ERRO_SEM_ARMAZENAMENTO };
  const tempos = opcoes.tempos ?? {};
  const valida = await fotoEmEnvio(fotografoId, fotoId);
  if (!valida) {
    // Já processada (por outra chamada) ou já com erro: responde o estado, sem processar de novo.
    const situacao = idFoto.safeParse(fotoId).success
      ? await situacaoDaFoto(fotoId, fotografoId)
      : null;
    if (situacao?.status === "pronta") return { emAndamento: true };
    if (situacao?.status === "erro" && situacao.erroMensagem)
      return { erro: situacao.erroMensagem };
    return { erro: "Foto não encontrada." };
  }
  if (ehFormatoDeVideo(valida.formato)) {
    return confirmarVideo(fotografoId, { ...valida, formato: valida.formato }, opcoes);
  }
  const { foto, chaves, formato } = { ...valida, formato: valida.formato as FormatoAceito };
  // Para o prazo de uma nova tentativa depois de uma falha passageira no Drive.
  const inicioDoEnvio = opcoes.inicioDoEnvio ?? foto.inicio;

  let marco = performance.now();
  const medir = (etapa: keyof TemposDoProcessamento) => {
    const agora = performance.now();
    tempos[etapa] = Math.round(agora - marco);
    marco = agora;
  };

  const liberar = await memoria.reservar(foto.tamanhoBytes || LIMITE_FOTO_BYTES);
  medir("esperaMs");
  // A reserva vem depois da espera pela memória: uma foto na fila desta instância não fica
  // reservada (e escondida do job) sem ninguém trabalhando nela.
  const agora = Date.now();
  let reservou;
  try {
    reservou = await reservarFotoParaProcessar(
      foto.id,
      fotografoId,
      new Date(agora),
      new Date(agora + RESERVA_DO_PROCESSAMENTO_MS),
    );
  } catch (erro) {
    liberar();
    throw erro;
  }
  if (!reservou) {
    liberar();
    return { emAndamento: true };
  }
  /** Original já gravado no Drive e a foto ainda não `pronta` (apagado se der errado). */
  let pendenteNoDrive: ReferenciaOriginal | null = null;
  try {
    const destino = await destinoDoOriginal(foto.armazenamento);
    const lido = await lerEnviado(chaves.temporaria, LIMITE_FOTO_BYTES);
    medir("leituraMs");
    if (lido.situacao === "ausente") {
      const inicio = opcoes.inicioDoEnvio;
      if (inicio && agora - inicio.getTime() < ENVIO_PODE_ESTAR_SUBINDO_MS) {
        await devolverReserva(foto.id, inicio);
        return { aguardando: true };
      }
      throw new ArquivoRecusado("O arquivo não chegou ao armazenamento. Envie de novo.");
    }
    if (lido.situacao === "grande") throw new ArquivoRecusado(`Maior que ${LIMITE_FOTO_TEXTO}.`);
    const original = lido.conteudo;
    if (foto.tamanhoBytes && original.length !== foto.tamanhoBytes) {
      throw new ArquivoRecusado(ERRO_DIFERENTE);
    }

    const real = detectarFormato(original.subarray(0, BYTES_PARA_DETECTAR));
    if (real === "raw") throw new ArquivoRecusado(MENSAGEM_RAW);
    if (real === "heic") {
      throw new ArquivoRecusado("Arquivo HEIC não convertido. Atualize a página e envie de novo.");
    }
    if (!real) throw new ArquivoRecusado(MENSAGEM_FORMATO);
    if (real !== formato) throw new ArquivoRecusado(ERRO_DIFERENTE);
    const conferida = await impressaoDoArquivo(original.length, (a, b) => original.subarray(a, b));
    if (conferida !== foto.hash) throw new ArquivoRecusado(ERRO_DIFERENTE);

    let info;
    try {
      // Só o cabeçalho (nada é decodificado aqui): sem o limite de pixels, para responder com a
      // mensagem certa logo abaixo; a decodificação (gerarVersoes) usa o limite.
      info = await sharp(original, { limitInputPixels: false }).metadata();
    } catch {
      throw new ArquivoRecusado(ERRO_LEITURA);
    }
    if (info.format !== FORMATO_NO_SHARP[formato]) throw new ArquivoRecusado(MENSAGEM_FORMATO);
    if (info.width * (info.pageHeight ?? info.height) > LIMITE_PIXELS) {
      throw new ArquivoRecusado(
        `Imagem com mais de ${LIMITE_PIXELS / 1_000_000} megapixels. Exporte menor e envie.`,
      );
    }
    medir("conferenciaMs");

    // Prévias geradas aqui, no servidor, sempre com marca d'água (no modelo do dono do evento,
    // com a configuração global em vigor e o desenho próprio da foto): nunca vindas do navegador.
    const [{ modelo, ajustes }, configGlobal] = await Promise.all([
      marcaDoDonoDoEvento(foto.eventoId),
      configuracaoDaMarca(),
    ]);
    // Os ajustes do fotógrafo (Painel > Marca d'água) por cima da configuração da gestão.
    const marca = aplicarAjustesDaMarca(configGlobal, ajustes);
    let versoes;
    try {
      versoes = await gerarVersoes(original, modelo, { semente: foto.id, config: marca });
    } catch {
      throw new ArquivoRecusado(ERRO_LEITURA);
    }
    const { previa, previaCelular, miniatura, paraRostos } = versoes;
    // As chaves levam a revisão da configuração usada.
    const publicas = chavesDaFoto(fotografoId, foto.eventoId, foto.id, formato, marca.revisao);
    medir("versoesMs");
    // As gravações no R2 ao mesmo tempo: a cópia do original não depende das prévias.
    const previas = [
      gravarPublico(publicas.previa, previa.buffer, "image/webp"),
      gravarPublico(publicas.previaCelular, previaCelular.buffer, "image/webp"),
      gravarPublico(publicas.miniatura, miniatura.buffer, "image/webp"),
    ];
    if (destino === "r2") {
      await Promise.all([
        ...previas,
        moverOriginal(chaves.temporaria, chaves.original, DADOS_DO_FORMATO[formato].mime),
      ]);
    } else {
      // Evento `hibrido`: o original vai ao Drive; o temporário do R2 só sai depois que a foto
      // estiver pronta apontando para o arquivo no Drive.
      pendenteNoDrive = await gravarComPrevias(previas, () =>
        gravarNoDrive({
          chave: chaves.original,
          conteudo: original,
          tipo: DADOS_DO_FORMATO[formato].mime,
          fotografoId,
          eventoId: foto.eventoId,
          fotoId: foto.id,
        }),
      );
    }
    const noDrive = pendenteNoDrive;

    const concluiu = await concluirFoto(foto.id, {
      chaveOriginal: chaves.original,
      // As chaves da versão atual da marca (a foto pode ter sido registrada antes de ela mudar).
      urlPrevia: publicas.previa,
      urlMiniatura: publicas.miniatura,
      // Medidas como a foto aparece (já girada pelo EXIF), para a grade da galeria.
      largura: info.autoOrient.width,
      altura: info.autoOrient.height,
      capturadaEm: dataDeCaptura(info.exif),
      ...(noDrive
        ? { provedorOriginal: "drive" as const, driveArquivoId: noDrive.driveArquivoId }
        : {}),
    });
    medir("gravacaoMs");
    if (!concluiu) {
      // A foto não aponta para o arquivo gravado agora no Drive: ele sai de lá.
      if (noDrive) await descartarDoDrive(noDrive);
      return { emAndamento: true };
    }
    if (noDrive) {
      pendenteNoDrive = null;
      // A foto já aponta para o Drive: o temporário sai do R2 (se falhar, a regra de ciclo de
      // vida de envios/ apaga depois).
      await removerOriginal(chaves.temporaria).catch(() => {});
    }
    // O original já não é necessário: a cópia para os rostos sai da base reduzida.
    liberar();
    // A foto já está pronta (à venda); os rostos servem à busca por selfie e o número de peito
    // à busca por número (só no evento com a leitura ligada). A cópia reduzida é a mesma.
    const copia = umaVez(paraRostos);
    const reconhecer = () =>
      Promise.all([
        indexarRostosDaFoto(foto.eventoId, foto.id, copia),
        lerNumerosDaFoto(foto.eventoId, foto.id, copia),
      ]);
    if (opcoes.depois) {
      opcoes.depois(reconhecer);
    } else {
      await reconhecer();
      medir("rostosMs");
    }
    return { eventoId: foto.eventoId };
  } catch (erro) {
    if (pendenteNoDrive) await descartarDoDrive(pendenteNoDrive);
    if (erro instanceof FalhaNoDrive) {
      return tratarFalhaNoDrive(foto.id, erro, inicioDoEnvio, agora, ERRO_PROCESSAMENTO);
    }
    if (erro instanceof ArquivoRecusado) {
      await marcarFotoComErro(foto.id, erro.message);
      // O arquivo recusado não fica no bucket (a regra de ciclo de vida de envios/ é a reserva).
      await removerOriginal(chaves.temporaria).catch(() => {});
      return { erro: erro.message };
    }
    await marcarFotoComErro(foto.id, ERRO_PROCESSAMENTO);
    // Só o id: nada do conteúdo do arquivo vai para o log.
    console.error(`[envios] falha ao processar a foto ${foto.id}`, erro);
    return { erro: "Não foi possível processar a foto. Tente de novo." };
  } finally {
    liberar();
  }
}

const ERRO_PROCESSAMENTO = "Não foi possível processar a foto. Envie de novo.";

/** A mesma promessa para quem chamar: a cópia reduzida é codificada uma vez só. */
function umaVez<T>(gerar: () => Promise<T>): () => Promise<T> {
  let promessa: Promise<T> | null = null;
  return () => (promessa ??= gerar());
}

/**
 * Vídeo que terminou de subir (docs/arquitetura.md, "Vídeos"): confere o tamanho, o formato pelo
 * conteúdo e a impressão lendo só trechos do arquivo, move o original para `originais/` e gera a
 * prévia aqui mesmo com o FFmpeg (src/servicos/video.ts): um MP4 com a marca d'água das fotos em
 * todos os quadros, mais a miniatura e a prévia em imagem a partir de um quadro. Vídeo com mais de
 * 30 segundos é recusado. No fim, o vídeo fica `pronta`, como uma foto.
 */
async function confirmarVideo(
  fotografoId: string,
  valida: {
    foto: NonNullable<Awaited<ReturnType<typeof buscarFotoEmEnvio>>>;
    chaves: ReturnType<typeof chavesDaFoto>;
    formato: FormatoDeVideo;
  },
  opcoes: OpcoesDoProcessamento,
): Promise<ResultadoDoProcessamento> {
  const { foto, chaves, formato } = valida;
  const inicioDoEnvio = opcoes.inicioDoEnvio ?? foto.inicio;
  // Arquivo, prévia e quadros na memória ao mesmo tempo: reserva com folga.
  const liberar = await memoria.reservar(
    Math.min(ORCAMENTO_DE_MEMORIA_BYTES, (foto.tamanhoBytes || LIMITE_VIDEO_BYTES) * 2),
  );
  const agora = Date.now();
  let reservou;
  try {
    reservou = await reservarFotoParaProcessar(
      foto.id,
      fotografoId,
      new Date(agora),
      new Date(agora + RESERVA_DO_PROCESSAMENTO_MS),
    );
  } catch (erro) {
    liberar();
    throw erro;
  }
  if (!reservou) {
    liberar();
    return { emAndamento: true };
  }
  let movido = false;
  let pendenteNoDrive: ReferenciaOriginal | null = null;
  try {
    const destino = await destinoDoOriginal(foto.armazenamento);
    const tamanho = await tamanhoDoEnviado(chaves.temporaria);
    if (tamanho === null) {
      const inicio = opcoes.inicioDoEnvio;
      if (inicio && agora - inicio.getTime() < ENVIO_PODE_ESTAR_SUBINDO_MS) {
        await devolverReserva(foto.id, inicio);
        return { aguardando: true };
      }
      throw new ArquivoRecusado("O arquivo não chegou ao armazenamento. Envie de novo.");
    }
    if (tamanho > LIMITE_VIDEO_BYTES) throw new ArquivoRecusado(`Maior que ${LIMITE_VIDEO_TEXTO}.`);
    if (foto.tamanhoBytes && tamanho !== foto.tamanhoBytes)
      throw new ArquivoRecusado(ERRO_DIFERENTE);
    const inicio = await lerTrecho(chaves.temporaria, 0, Math.min(tamanho, BYTES_PARA_DETECTAR));
    if (detectarVideo(inicio) !== formato) throw new ArquivoRecusado(MENSAGEM_FORMATO_VIDEO);
    const conferida = await impressaoDoArquivo(tamanho, (a, b) =>
      lerTrecho(chaves.temporaria, a, b),
    );
    if (conferida !== foto.hash) throw new ArquivoRecusado(ERRO_DIFERENTE);

    // Evento `hibrido`: o vídeo fica no temporário até ir ao Drive, depois das prévias.
    let video: Buffer | null = null;
    if (destino === "r2") {
      await moverOriginal(chaves.temporaria, chaves.original, DADOS_DO_VIDEO[formato].mime);
      movido = true;
    }
    const [{ modelo, ajustes }, configGlobal] = await Promise.all([
      marcaDoDonoDoEvento(foto.eventoId),
      configuracaoDaMarca(),
    ]);
    // Os ajustes do fotógrafo (Painel > Marca d'água) por cima da configuração da gestão.
    const marca = aplicarAjustesDaMarca(configGlobal, ajustes);
    const publicas = chavesDaFoto(fotografoId, foto.eventoId, foto.id, formato, marca.revisao);
    let preparado;
    try {
      preparado = await prepararVideo(
        destino === "r2"
          ? await lerOriginal(chaves.original)
          : (video = await lerOriginal(chaves.temporaria)),
        modelo,
        (duracao) => duracao <= DURACAO_MAXIMA_VIDEO_S + FOLGA_DURACAO_S,
        { semente: foto.id, config: marca },
      );
    } catch (erro) {
      if (erro instanceof VideoIlegivel) {
        console.error(`[envios] vídeo ${foto.id} ilegível: ${erro.message}`);
        throw new ArquivoRecusado("Não foi possível ler o vídeo. Exporte em MP4 (H.264) e envie.");
      }
      throw erro;
    }
    if ("recusado" in preparado) throw new ArquivoRecusado(MENSAGEM_VIDEO_LONGO);

    const { previa, previaCelular, miniatura } = await gerarVersoes(preparado.quadro, modelo, {
      semente: foto.id,
      config: marca,
    });
    const previas = [
      gravarPublico(publicas.previa, previa.buffer, "image/webp"),
      gravarPublico(publicas.previaCelular, previaCelular.buffer, "image/webp"),
      gravarPublico(publicas.miniatura, miniatura.buffer, "image/webp"),
      gravarPublico(chaves.previaVideo, preparado.previa, "video/mp4"),
    ];
    if (destino === "r2" || !video) {
      await Promise.all(previas);
    } else {
      const conteudo = video;
      pendenteNoDrive = await gravarComPrevias(previas, () =>
        gravarNoDrive({
          chave: chaves.original,
          conteudo,
          tipo: DADOS_DO_VIDEO[formato].mime,
          fotografoId,
          eventoId: foto.eventoId,
          fotoId: foto.id,
        }),
      );
      video = null;
    }
    const noDrive = pendenteNoDrive;
    const concluiu = await concluirFoto(foto.id, {
      chaveOriginal: chaves.original,
      urlPrevia: publicas.previa,
      urlMiniatura: publicas.miniatura,
      previaVideo: chaves.previaVideo,
      largura: preparado.largura,
      altura: preparado.altura,
      capturadaEm: null,
      duracaoS: Math.max(1, Math.round(preparado.duracaoS)),
      ...(noDrive
        ? { provedorOriginal: "drive" as const, driveArquivoId: noDrive.driveArquivoId }
        : {}),
    });
    if (!concluiu) {
      if (noDrive) await descartarDoDrive(noDrive);
      return { emAndamento: true };
    }
    if (noDrive) {
      pendenteNoDrive = null;
      await removerOriginal(chaves.temporaria).catch(() => {});
    }
    // O vídeo já está à venda; os rostos dos quadros servem à busca por selfie.
    const { quadrosParaRostos } = preparado;
    if (opcoes.depois) {
      opcoes.depois(() => indexarRostosDoVideo(foto.eventoId, foto.id, quadrosParaRostos));
    } else {
      await indexarRostosDoVideo(foto.eventoId, foto.id, quadrosParaRostos);
    }
    return { eventoId: foto.eventoId };
  } catch (erro) {
    if (pendenteNoDrive) await descartarDoDrive(pendenteNoDrive);
    if (erro instanceof FalhaNoDrive) {
      return tratarFalhaNoDrive(
        foto.id,
        erro,
        inicioDoEnvio,
        agora,
        "Não foi possível processar o vídeo. Envie de novo.",
      );
    }
    if (erro instanceof ArquivoRecusado) {
      await marcarFotoComErro(foto.id, erro.message);
      // O arquivo recusado não fica guardado (nem o temporário, nem o original já movido).
      await removerOriginal(movido ? chaves.original : chaves.temporaria).catch(() => {});
      return { erro: erro.message };
    }
    await marcarFotoComErro(foto.id, "Não foi possível processar o vídeo. Envie de novo.");
    console.error(`[envios] falha ao processar o vídeo ${foto.id}`, erro);
    return { erro: "Não foi possível processar o vídeo. Tente de novo." };
  } finally {
    liberar();
  }
}

/**
 * Fotos processadas ao mesmo tempo por uma chamada em segundo plano ou pelo job. A memória já é
 * limitada pelo orçamento (ORCAMENTO_DE_MEMORIA_BYTES); aqui o limite é o de idas ao R2, ao banco
 * e ao Rekognition de uma vez.
 */
export const PROCESSAMENTOS_NO_SERVIDOR = 6;

/**
 * Processa no servidor, em segundo plano, as fotos que o navegador já enviou e entregou de uma
 * vez (a tela de envio terminou os uploads, ou a página está fechando). Roda depois da resposta
 * (`after`), até `prazoMs`; o que não couber fica em `processando` e o job termina.
 */
export async function processarEmSegundoPlano(
  fotografoId: string,
  fotoIds: string[],
  prazoMs: number,
): Promise<{ prontas: number; comErro: number; puladas: number }> {
  const resultado = { prontas: 0, comErro: 0, puladas: 0 };
  if (modoEnvio() !== "r2") return resultado;
  const limite = Date.now() + prazoMs;
  await emParalelo([...new Set(fotoIds)], PROCESSAMENTOS_NO_SERVIDOR, async (fotoId) => {
    if (Date.now() > limite) {
      resultado.puladas++;
      return;
    }
    try {
      const r = await confirmarEnvio(fotografoId, fotoId);
      if ("erro" in r) resultado.comErro++;
      else if ("eventoId" in r) resultado.prontas++;
      else resultado.puladas++;
    } catch (erro) {
      console.error(`[envios] falha ao processar em segundo plano a foto ${fotoId}`, erro);
      resultado.comErro++;
    }
  });
  return resultado;
}

/**
 * Foto parada em `processando` há mais disto (ou com a reserva vencida há mais disto) é revisada
 * pelo job. Curto: a reserva (src/dados/processamento.ts) já impede de pegar uma foto que outra
 * chamada está processando, e um arquivo que ainda não chegou só vira erro depois de
 * ENVIO_PODE_ESTAR_SUBINDO_MS.
 */
export const ESPERA_FOTO_PRESA_MS = 5 * 60 * 1000;
/** Fotos listadas por execução do job (no máximo; o prazo costuma parar antes). */
export const FOTOS_PRESAS_POR_VEZ = 400;
/**
 * Até quando o job começa fotos novas: abaixo do maxDuration de /api/jobs/revisao (120 s) e do
 * tempo que o GitHub Actions espera a resposta (150 s), com folga para a última foto terminar.
 */
export const PRAZO_DO_JOB_MS = 80 * 1000;

export type ResultadoFotosPresas = {
  revisadas: number;
  prontas: number;
  comErro: number;
};

/**
 * Job (docs/tarefas.md, Fase 12): fotos que ficaram em `processando` porque o navegador fechou
 * ou a confirmação falhou no meio. Para cada uma, o processamento normal (confirmarEnvio), até o
 * prazo: se o arquivo chegou e confere, gera as prévias e marca `pronta`; se não chegou e o
 * envio é recente, deixa para a próxima; senão, marca `erro` com a mensagem que o fotógrafo vê
 * no painel. Sem o R2 configurado (desenvolvimento, testes, produção sem armazenamento), não faz
 * nada.
 */
export async function revisarFotosPresas(
  agora = Date.now(),
  { limite = FOTOS_PRESAS_POR_VEZ, prazoMs = PRAZO_DO_JOB_MS } = {},
): Promise<ResultadoFotosPresas> {
  const resultado: ResultadoFotosPresas = { revisadas: 0, prontas: 0, comErro: 0 };
  if (modoEnvio() !== "r2") return resultado;
  const fim = Date.now() + prazoMs;
  const presas = await listarFotosParadas(new Date(agora - ESPERA_FOTO_PRESA_MS), limite);
  await emParalelo(presas, PROCESSAMENTOS_NO_SERVIDOR, async (foto) => {
    if (Date.now() > fim) return;
    resultado.revisadas++;
    try {
      const r = await confirmarEnvio(foto.enviadaPor, foto.id, { inicioDoEnvio: foto.inicio });
      if ("erro" in r) {
        // Registro sem arquivo temporário válido volta como "não encontrada" sem mudar de
        // status; marcar aqui evita que ele prenda a fila do job para sempre. Só muda se a foto
        // ainda estiver em `processando`.
        await marcarFotoComErro(foto.id, ERRO_PROCESSAMENTO);
        resultado.comErro++;
      } else if ("eventoId" in r) {
        resultado.prontas++;
      }
    } catch (erro) {
      // confirmarEnvio já trata as falhas do processamento; aqui só o que escapou (banco fora).
      console.error(`[envios] falha ao revisar a foto presa ${foto.id}`, erro);
      resultado.comErro++;
    }
  });
  return resultado;
}

/**
 * Como terminou o cadastro dos rostos de uma foto: `indexada` (mesmo sem nenhum rosto),
 * `desligado` (sem o Rekognition configurado), `falha_credencial` (chave, região ou permissão
 * erradas: as outras fotos vão falhar igual) ou `falha` (problema só desta foto, ou passageiro).
 */
export type IndexacaoDeRostos = "indexada" | "desligado" | "falha_credencial" | "falha";

/**
 * Cadastra os rostos da foto no reconhecimento facial (com as credenciais REKOGNITION_*), para a
 * busca por selfie encontrá-la. Vai uma cópia reduzida (o Rekognition aceita até 5 MB) e já
 * girada pelo EXIF, para a posição do rosto bater com a prévia. Uma falha aqui nunca derruba o
 * envio (nunca lança): a foto continua à venda, só não aparece na busca por selfie. O resultado
 * serve ao painel, para avisar o fotógrafo em vez de contar a falha como feita.
 */
export async function indexarRostosDaFoto(
  eventoId: string,
  fotoId: string,
  original: Buffer | (() => Promise<Buffer>),
  depoisDeSalvar?: (rostos: RostoIndexado[]) => Promise<void>,
): Promise<IndexacaoDeRostos> {
  if (provedorFacial() !== "rekognition") return "desligado";
  let rostos: RostoIndexado[];
  try {
    // No envio, a cópia reduzida já vem da decodificação das prévias (gerarVersoes).
    const imagem =
      typeof original === "function" ? await original() : await copiaParaRostos(original);
    rostos = await indexarRostos(eventoId, fotoId, imagem);
    await salvarRostos(fotoId, rostos);
  } catch (erro) {
    // Só o id da foto e o nome do erro (ex.: UnrecognizedClientException): nada da imagem.
    console.error(
      `[envios] falha ao indexar os rostos da foto ${fotoId}: ${nomeDoErro(erro)}` +
        (erro instanceof Error ? ` (${erro.message})` : ""),
    );
    return ehErroDeCredencial(erro) ? "falha_credencial" : "falha";
  }
  if (depoisDeSalvar) {
    // Os rostos já estão gravados: uma falha daqui em diante não muda o resultado do cadastro.
    await depoisDeSalvar(rostos).catch((erro) =>
      console.error(`[envios] falha ao pôr a marca sobre os rostos da foto ${fotoId}`, erro),
    );
  }
  return "indexada";
}

/**
 * Cadastra os rostos de um vídeo a partir de alguns quadros (src/servicos/video.ts,
 * quadrosParaRostos): cada quadro vai ao Rekognition com o id do vídeo, então a selfie de quem
 * aparece em qualquer um deles acha o vídeo. Os rostos ficam sem posição gravada: a caixa vale
 * só para aquele quadro, e o vídeo aparece inteiro no resultado (sem o zoom no rosto). Como a
 * das fotos, nunca lança: o vídeo continua à venda mesmo se o cadastro falhar.
 */
export async function indexarRostosDoVideo(
  eventoId: string,
  fotoId: string,
  quadros: Buffer[] | (() => Promise<Buffer[]>),
): Promise<IndexacaoDeRostos> {
  if (provedorFacial() !== "rekognition") return "desligado";
  try {
    const lista = typeof quadros === "function" ? await quadros() : quadros;
    const rostos: RostoIndexado[] = [];
    for (const quadro of lista) {
      const encontrados = await indexarRostos(eventoId, fotoId, quadro);
      rostos.push(...encontrados.map((r) => ({ rostoId: r.rostoId, caixa: null })));
    }
    await salvarRostos(fotoId, rostos);
  } catch (erro) {
    console.error(
      `[envios] falha ao indexar os rostos do vídeo ${fotoId}: ${nomeDoErro(erro)}` +
        (erro instanceof Error ? ` (${erro.message})` : ""),
    );
    return ehErroDeCredencial(erro) ? "falha_credencial" : "falha";
  }
  return "indexada";
}
