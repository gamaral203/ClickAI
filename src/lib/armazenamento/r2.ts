import "server-only";

import {
  abrirOriginal,
  gravarOriginal,
  lerOriginal,
  lerTrecho,
  removerOriginal,
  tamanhoDoEnviado,
  urlDeDownload,
} from "@/lib/r2";

import type { ProvedorDeOriginais, ReferenciaOriginal } from "./tipos";

// Adaptador do bucket privado de originais no R2 (src/lib/r2.ts). Não muda nada do que já
// existe: só envolve as mesmas funções na interface comum.

function chaveDoR2(ref: ReferenciaOriginal) {
  if (ref.provedor !== "r2") throw new Error("Referência de outro provedor");
  return ref.chave;
}

export const provedorR2: ProvedorDeOriginais = {
  nome: "r2",

  async gravarOriginal({ chave, conteudo, tipo }) {
    // O PUT leva o Content-Length: o R2 recusa corpo de outro tamanho (sem HEAD extra, ~150 ms).
    await gravarOriginal(chave, conteudo, tipo);
    return { provedor: "r2", chave, driveArquivoId: null };
  },

  lerOriginal: async (ref) => lerOriginal(chaveDoR2(ref)),

  async lerTrecho(ref, inicio, fim) {
    return Buffer.from(await lerTrecho(chaveDoR2(ref), inicio, fim));
  },

  tamanhoDoOriginal: async (ref) => tamanhoDoEnviado(chaveDoR2(ref)),

  abrirFluxo: async (ref, range) => abrirOriginal(chaveDoR2(ref), range),

  removerOriginal: async (ref) => removerOriginal(chaveDoR2(ref)),

  async entregaParaDownload(ref, nomeArquivo, tipo) {
    return { tipo: "url", url: await urlDeDownload(chaveDoR2(ref), nomeArquivo, tipo) };
  },
};
