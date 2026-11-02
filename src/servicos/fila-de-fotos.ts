import "server-only";

import {
  devolverFotoDosRostos,
  listarFotosSemRostos,
  reservarFotoParaRostos,
} from "@/dados";
import { emParalelo } from "@/lib/concorrencia";
import { JANELA_DA_FILA_DE_ROSTOS_MS, MAXIMO_DE_TENTATIVAS_DE_ROSTOS } from "@/lib/limites-envio";
import { modoEnvio } from "@/lib/r2";
import { provedorFacial } from "@/lib/reconhecimento";

import { indexarItemDoEvento } from "./colecoes";
import {
  reservarMemoriaDoProcessamento,
  revisarFotosPresas,
  type ResultadoFotosPresas,
} from "./envios";

// Execução por minuto da fila de fotos (/api/jobs/fotos-presas). A fila é o próprio banco: a
// reserva atômica (src/dados/processamento.ts) impede processar em dobro se duas execuções se
// encontrarem, e o que não coube no prazo continua na fila para o minuto seguinte.

/** Até quando uma execução começa fotos novas: termina dentro do minuto, sem se acumular. */
export const PRAZO_DA_FILA_MS = 45 * 1000;

/**
 * Fotos preparadas ao mesmo tempo para o reconhecimento. Ler o original e reduzir leva ~1,5 s: com
 * 6, a fila acompanha as 4 vagas por segundo do limite (reservarVagaDoLimite) sem sobrar foto
 * aberta na memória esperando a vez.
 */
const ROSTOS_SIMULTANEOS = 6;
const ROSTOS_POR_PAGINA = 24;
/** Espera entre as tentativas: 5 min, 10, 20, 40... */
const PRIMEIRA_ESPERA_DOS_ROSTOS_MS = 5 * 60 * 1000;
/** Cota da conta cheia ou credencial errada: tenta de novo logo, sem culpar a foto. */
const VOLTA_SEM_CULPA_MS = 60 * 1000;

export type ResultadoFilaDeRostos = {
  indexadas: number;
  falhas: number;
  /** Deixadas para depois sem gastar tentativa (cota da conta cheia). */
  adiadas: number;
};

/**
 * Fotos prontas sem `rostos_indexados_em`: lê o original no R2 e cadastra, dentro do limite de
 * vagas da conta. Quem falha volta mais tarde; depois de MAXIMO_DE_TENTATIVAS_DE_ROSTOS sai da
 * fila e fica como pendente no painel ("Cadastrar rostos que faltam"). A foto continua à venda.
 * A selfie não passa por aqui: só as fotos do evento.
 */
export async function rodarFilaDeRostos(
  agora = Date.now(),
  prazoMs = PRAZO_DA_FILA_MS,
): Promise<ResultadoFilaDeRostos> {
  const resultado: ResultadoFilaDeRostos = { indexadas: 0, falhas: 0, adiadas: 0 };
  if (provedorFacial() !== "rekognition" || modoEnvio() !== "r2") return resultado;
  const fim = Date.now() + prazoMs;
  const desde = new Date(agora - JANELA_DA_FILA_DE_ROSTOS_MS);
  let credencialErrada = false;
  while (Date.now() <= fim && !credencialErrada) {
    const momento = new Date(Math.max(agora, Date.now()));
    const pagina = await listarFotosSemRostos(
      momento,
      desde,
      MAXIMO_DE_TENTATIVAS_DE_ROSTOS,
      ROSTOS_POR_PAGINA,
    );
    if (pagina.length === 0) break;
    await emParalelo(pagina, ROSTOS_SIMULTANEOS, async (foto) => {
      if (Date.now() > fim || credencialErrada) return;
      const espera = PRIMEIRA_ESPERA_DOS_ROSTOS_MS * 2 ** foto.tentativas;
      const reservou = await reservarFotoParaRostos(
        foto.id,
        momento,
        new Date(momento.getTime() + espera),
      );
      if (!reservou) return;
      const liberar = await reservarMemoriaDoProcessamento(foto.tamanhoBytes ?? 0);
      let como: Awaited<ReturnType<typeof indexarItemDoEvento>>;
      try {
        como = await indexarItemDoEvento(foto.eventoId, foto);
      } finally {
        liberar();
      }
      if (como === "indexada") {
        resultado.indexadas++;
      } else if (como === "adiada") {
        resultado.adiadas++;
        await devolverFotoDosRostos(foto.id, new Date(Date.now() + VOLTA_SEM_CULPA_MS));
      } else if (como === "falha_credencial") {
        credencialErrada = true;
        await devolverFotoDosRostos(foto.id, new Date(Date.now() + VOLTA_SEM_CULPA_MS));
      } else {
        resultado.falhas++;
        if (foto.tentativas + 1 >= MAXIMO_DE_TENTATIVAS_DE_ROSTOS) {
          console.error(`[rostos] foto ${foto.id} saiu da fila depois de ${foto.tentativas + 1}`);
        }
      }
    });
  }
  return resultado;
}

export type ResultadoDaFila = { fotos: ResultadoFotosPresas; rostos: ResultadoFilaDeRostos };

export async function rodarFilaDeFotos(agora = Date.now()): Promise<ResultadoDaFila> {
  const [fotos, rostos] = await Promise.all([
    revisarFotosPresas(agora, { prazoMs: PRAZO_DA_FILA_MS }),
    rodarFilaDeRostos(agora, PRAZO_DA_FILA_MS).catch((erro) => {
      console.error("[jobs] falha na fila dos rostos", erro);
      return { indexadas: 0, falhas: 0, adiadas: 0 };
    }),
  ]);
  return { fotos, rostos };
}

