// Leitura do número de peito nas fotos (docs/arquitetura.md, "Número de peito"). Quando a foto
// fica pronta, a mesma cópia reduzida dos rostos (JPEG em memória, até 1920 px; nada novo é
// gravado) vai ao Rekognition DetectText; os números saem por src/lib/numeros-de-peito.ts e vão
// para a tabela `numeros`, que a busca por número da página do evento lê.
//
// Só nos eventos com a opção "Ler número de peito nas fotos" ligada (cada leitura é cobrada) e
// só fotos (vídeo fica de fora: seriam até 10 quadros cobrados por vídeo). Sem o Rekognition,
// fora da produção, o modo simulado lê de TEXTO_SIMULADO ou gera um número fixo a partir do id
// da foto, sem nunca chamar a AWS; na produção sem o Rekognition, a leitura fica desligada.
//
// Fotos que não passaram pela leitura (enviadas antes de ligar a opção, ou em que ela falhou)
// voltam pelo botão "Ler números que faltam" do painel (lerNumerosDoEvento, em lotes) e pelo
// job de revisão (lerNumerosPendentes), que pega as prontas há mais de alguns minutos.

import "server-only";

import { createHash } from "node:crypto";

import {
  fotosParaLerNumeros,
  fotosPendentesDeNumeros,
  leituraDeNumerosLigada,
  salvarNumerosLidos,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { emParalelo } from "@/lib/concorrencia";
import { confiancaMinima, extrairNumeros, type TextoDetectado } from "@/lib/numeros-de-peito";
import { lerOriginal, r2Configurado } from "@/lib/r2";
import {
  detectarTexto,
  ehErroDeCredencial,
  nomeDoErro,
  provedorFacial,
} from "@/lib/reconhecimento";

import { copiaParaRostos } from "./imagens";

/**
 * Como terminou a leitura de uma foto: `lida` (mesmo sem número), `desligada` (evento sem a
 * opção ou servidor sem o provedor), `falha_credencial` (chave, região ou permissão erradas: as
 * outras fotos vão falhar igual) ou `falha` (problema só desta foto, ou passageiro).
 */
export type LeituraDeNumeros = "lida" | "desligada" | "falha_credencial" | "falha";

/** `rekognition` (credenciais REKOGNITION_*), `simulado` (fora da produção) ou `desligado`. */
export function provedorDeTexto(): "rekognition" | "simulado" | "desligado" {
  if (provedorFacial() === "rekognition") return "rekognition";
  return emProducao() ? "desligado" : "simulado";
}

/**
 * Respostas do DetectText para o modo simulado, por id da foto (os testes põem aqui o que
 * quiserem). Foto fora do mapa recebe a resposta fixa de respostaSimulada.
 */
export const TEXTO_SIMULADO = new Map<string, TextoDetectado[]>();

/**
 * Resposta simulada e determinística: uma em cada cinco fotos sem número; as outras com um
 * número de 100 a 1999 tirado do id, mais um texto que não é número ("KM") e um número de baixa
 * confiança, que a extração descarta.
 */
export function respostaSimulada(fotoId: string): TextoDetectado[] {
  const fixa = TEXTO_SIMULADO.get(fotoId);
  if (fixa) return fixa;
  const hash = createHash("sha256").update(fotoId).digest();
  if (hash[0] % 5 === 0) return [];
  const numero = String(100 + (hash.readUInt16BE(1) % 1900));
  const caixa = { Left: 0.4, Top: 0.5, Width: 0.12, Height: 0.06 };
  return [
    { DetectedText: numero, Type: "LINE", Confidence: 99, Geometry: { BoundingBox: caixa } },
    { DetectedText: numero, Type: "WORD", Confidence: 99, Geometry: { BoundingBox: caixa } },
    { DetectedText: "KM", Type: "WORD", Confidence: 98, Geometry: { BoundingBox: caixa } },
    {
      DetectedText: String(hash.readUInt16BE(3) % 1000),
      Type: "WORD",
      Confidence: 40,
      Geometry: { BoundingBox: caixa },
    },
  ];
}

/** Erros da própria imagem: tentar de novo não adianta, então a foto conta como lida. */
const ERROS_DA_IMAGEM = new Set([
  "InvalidImageFormatException",
  "ImageTooLargeException",
  "InvalidParameterException",
]);

/**
 * Lê os números de uma foto e grava (substituindo os lidos antes; os manuais ficam). Nunca
 * lança: a foto continua à venda, só não aparece na busca por número. `conferirEvento: false`
 * quando quem chama já sabe que a opção está ligada.
 */
export async function lerNumerosDaFoto(
  eventoId: string,
  fotoId: string,
  imagem: () => Promise<Uint8Array>,
  { conferirEvento = true } = {},
): Promise<LeituraDeNumeros> {
  const provedor = provedorDeTexto();
  if (provedor === "desligado") return "desligada";
  try {
    if (conferirEvento && !(await leituraDeNumerosLigada(eventoId))) return "desligada";
    const deteccoes =
      provedor === "rekognition"
        ? ((await detectarTexto(await imagem())) ?? [])
        : respostaSimulada(fotoId);
    await salvarNumerosLidos(fotoId, extrairNumeros(deteccoes, { confianca: confiancaMinima() }));
    return "lida";
  } catch (erro) {
    const nome = nomeDoErro(erro);
    // Só o id da foto e o nome do erro: nada da imagem nem do texto lido.
    console.error(`[numeros] falha ao ler o número da foto ${fotoId}: ${nome}`);
    if (ehErroDeCredencial(erro)) return "falha_credencial";
    if (ERROS_DA_IMAGEM.has(nome)) {
      await salvarNumerosLidos(fotoId, []).catch(() => {});
    }
    return "falha";
  }
}

type FotoParaLer = { id: string; chaveOriginal: string | null };

/** Lê uma foto já pronta a partir do original no R2 (lote do painel e job). */
async function lerItem(eventoId: string, foto: FotoParaLer): Promise<LeituraDeNumeros> {
  const provedor = provedorDeTexto();
  if (provedor === "rekognition" && (!r2Configurado() || !foto.chaveOriginal)) return "desligada";
  const chave = foto.chaveOriginal;
  return lerNumerosDaFoto(
    eventoId,
    foto.id,
    async () => copiaParaRostos(await lerOriginal(chave!)),
    { conferirEvento: false },
  );
}

/** Leituras ao mesmo tempo: abaixo do limite de chamadas por segundo do DetectText. */
const EM_PARALELO = 3;
/** Fotos por chamada do botão do painel (~1 s cada, 3 ao mesmo tempo). */
export const FOTOS_POR_LOTE_DE_NUMEROS = 12;
/** Passado este tempo, a chamada do painel para e devolve o `proximo` (maxDuration de 60 s). */
const PRAZO_DO_LOTE_MS = 30_000;

export type ResultadoLoteDeNumeros =
  | { ok: true; lidas: number; falhas: number; proximo: string | null }
  | { ok: false; motivo: "desligada" | "falha_credencial" };

/**
 * Um lote das fotos do evento que ainda não passaram pela leitura, em ordem de id depois de
 * `depoisDe`. A tela chama de novo com o `proximo` até voltar `null`. Quem chama confere o dono
 * e a opção do evento.
 */
export async function lerNumerosDoEvento(
  eventoId: string,
  depoisDe: string | null,
  { limite = FOTOS_POR_LOTE_DE_NUMEROS, prazoMs = PRAZO_DO_LOTE_MS } = {},
): Promise<ResultadoLoteDeNumeros> {
  if (provedorDeTexto() === "desligado") return { ok: false, motivo: "desligada" };
  if (provedorDeTexto() === "rekognition" && !r2Configurado()) {
    return { ok: false, motivo: "desligada" };
  }
  const fotos = await fotosParaLerNumeros(eventoId, depoisDe, limite);
  const fim = Date.now() + prazoMs;
  let lidas = 0;
  let falhas = 0;
  let credencial = false;
  let ultimaFeita: string | null = depoisDe;
  // Em blocos de EM_PARALELO, para parar no prazo sem pular nenhuma foto.
  for (let i = 0; i < fotos.length; i += EM_PARALELO) {
    if (i > 0 && Date.now() > fim) return { ok: true, lidas, falhas, proximo: ultimaFeita };
    const bloco = fotos.slice(i, i + EM_PARALELO);
    const feitos = await emParalelo(bloco, EM_PARALELO, (foto) => lerItem(eventoId, foto));
    for (const r of feitos) {
      if (r.ok && r.valor === "lida") lidas++;
      else if (r.ok && r.valor === "falha_credencial") credencial = true;
      else falhas++;
    }
    if (credencial) return { ok: false, motivo: "falha_credencial" };
    ultimaFeita = bloco[bloco.length - 1].id;
  }
  return { ok: true, lidas, falhas, proximo: fotos.length === limite ? ultimaFeita : null };
}

/** Foto pronta há menos disto ainda pode estar na leitura do próprio envio: o job espera. */
export const ESPERA_PARA_O_JOB_MS = 10 * 60 * 1000;
/** Fotos listadas por execução do job (no máximo; o prazo costuma parar antes). */
const FOTOS_PENDENTES_POR_VEZ = 300;

export type ResultadoNumerosPendentes = { lidas: number; falhas: number; credencial?: boolean };

/**
 * Job de revisão: lê as fotos dos eventos com a opção ligada que ainda não passaram pela
 * leitura (opção ligada num evento que já tinha fotos, ou leitura que falhou no envio), até
 * `prazoMs`. Só com o Rekognition e o R2 de verdade: nos testes e no desenvolvimento, o botão
 * do painel faz a leitura simulada. Para na primeira falha de credencial.
 */
export async function lerNumerosPendentes(
  prazoMs: number,
  agora = Date.now(),
): Promise<ResultadoNumerosPendentes> {
  const resultado: ResultadoNumerosPendentes = { lidas: 0, falhas: 0 };
  if (provedorDeTexto() !== "rekognition" || !r2Configurado()) return resultado;
  const fim = Date.now() + prazoMs;
  const fotos = await fotosPendentesDeNumeros(
    new Date(agora - ESPERA_PARA_O_JOB_MS),
    FOTOS_PENDENTES_POR_VEZ,
  );
  await emParalelo(fotos, EM_PARALELO, async (foto) => {
    if (Date.now() > fim || resultado.credencial) return;
    const r = await lerItem(foto.eventoId, foto);
    if (r === "lida") resultado.lidas++;
    else if (r === "falha_credencial") resultado.credencial = true;
    else if (r === "falha") resultado.falhas++;
  });
  return resultado;
}
