// Execução com limite de tarefas ao mesmo tempo, usada no envio de fotos (no navegador, para os
// envios ao R2 e o processamento; no servidor, no job que revisa fotos presas).

/**
 * Roda `tarefa` para cada item, no máximo `limite` ao mesmo tempo, e devolve os resultados na
 * ordem dos itens. Um erro numa tarefa não para as outras: ele volta no lugar do resultado.
 */
export async function emParalelo<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<R>,
): Promise<({ ok: true; valor: R } | { ok: false; erro: unknown })[]> {
  const resultados: ({ ok: true; valor: R } | { ok: false; erro: unknown })[] = new Array(
    itens.length,
  );
  let proximo = 0;
  const trabalhadores = Array.from(
    { length: Math.max(1, Math.min(Math.floor(limite) || 1, itens.length)) },
    async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        try {
          resultados[i] = { ok: true, valor: await tarefa(itens[i], i) };
        } catch (erro) {
          resultados[i] = { ok: false, erro };
        }
      }
    },
  );
  await Promise.all(trabalhadores);
  return resultados;
}

/**
 * Espera antes da tentativa `n` (1, 2, 3...): 1 s, 2 s, 4 s... até `maximoMs`, com uma variação
 * aleatória de até 30% para várias fotos que falharam juntas não voltarem todas no mesmo instante.
 */
export function esperaDaTentativa(
  n: number,
  baseMs = 1000,
  maximoMs = 15_000,
  acaso = Math.random,
) {
  const espera = Math.min(maximoMs, baseMs * 2 ** Math.max(0, n - 1));
  return Math.round(espera * (0.85 + acaso() * 0.3));
}

/** Divide a lista em pedaços de `tamanho` (o último pode ser menor). */
export function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Orçamento de um recurso contado em unidades (ex.: bytes de memória): `reservar(n)` espera até
 * caber e devolve a função que libera. Um pedido maior que o orçamento inteiro passa sozinho,
 * quando nada mais está reservado, para nunca ficar preso. A fila é por ordem de chegada.
 */
export class Orcamento {
  private usado = 0;
  private fila: { quanto: number; liberar: () => void }[] = [];

  constructor(private readonly total: number) {}

  get emUso() {
    return this.usado;
  }

  private cabe(quanto: number) {
    return this.usado === 0 || this.usado + quanto <= this.total;
  }

  async reservar(quanto: number): Promise<() => void> {
    if (this.fila.length === 0 && this.cabe(quanto)) {
      this.usado += quanto;
    } else {
      await new Promise<void>((ok) => this.fila.push({ quanto, liberar: ok }));
    }
    let liberado = false;
    return () => {
      if (liberado) return;
      liberado = true;
      this.usado -= quanto;
      while (this.fila.length > 0 && this.cabe(this.fila[0].quanto)) {
        const proximo = this.fila.shift()!;
        this.usado += proximo.quanto;
        proximo.liberar();
      }
    };
  }
}
