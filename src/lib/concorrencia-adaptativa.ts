// Concorrência adaptativa do envio de fotos ao R2 (src/components/painel/envio-fotos.tsx).
// Quantos PUTs (arquivos inteiros ou partes) correm ao mesmo tempo não é fixo: a tela mede a
// vazão a cada janela de alguns segundos e sobe ou desce um degrau, mantendo a direção que
// melhorou a vazão e invertendo a que piorou (subida de encosta). Numa conexão boa, mais envios
// em paralelo escondem a latência até os EUA (onde fica o bucket); numa ruim, menos envios
// disputam a banda e cada arquivo termina antes.

/** Vagas de envio: `pegar` espera uma vaga livre; o limite pode mudar com a fila andando. */
export class Vagas {
  private ocupadas = 0;
  private fila: (() => void)[] = [];

  constructor(private limite: number) {}

  get emUso() {
    return this.ocupadas;
  }

  /** Quem está esperando vaga (há mais trabalho do que vagas). */
  get esperando() {
    return this.fila.length;
  }

  get maximo() {
    return this.limite;
  }

  definirLimite(limite: number) {
    this.limite = Math.max(1, Math.floor(limite));
    this.acordar();
  }

  async pegar(): Promise<void> {
    if (this.ocupadas < this.limite && this.fila.length === 0) {
      this.ocupadas++;
      return;
    }
    await new Promise<void>((ok) => this.fila.push(ok));
  }

  soltar() {
    this.ocupadas = Math.max(0, this.ocupadas - 1);
    this.acordar();
  }

  private acordar() {
    while (this.fila.length > 0 && this.ocupadas < this.limite) {
      this.ocupadas++;
      this.fila.shift()!();
    }
  }
}

export type FaixaDeConcorrencia = { minimo: number; maximo: number; inicial: number };

/**
 * Faixa de envios simultâneos pelo tamanho médio dos arquivos: com arquivos pequenos (até 5 MB),
 * o tempo de cada PUT é quase todo latência (ida e volta até os EUA), e mais envios em paralelo
 * rendem mais; com arquivos grandes, a banda já fica cheia com poucos.
 */
export function faixaDeConcorrencia(tamanhoMedioBytes: number): FaixaDeConcorrencia {
  if (tamanhoMedioBytes <= 5 * 1024 * 1024) return { minimo: 6, maximo: 16, inicial: 10 };
  return { minimo: 4, maximo: 10, inicial: 6 };
}

/** Ganho (ou perda) mínimo de vazão entre janelas para contar como diferença, não ruído. */
const SENSIBILIDADE = 0.06;
/** Janelas estáveis seguidas antes de testar um degrau acima. */
const JANELAS_PARA_TESTAR = 3;

export class AjusteDeConcorrencia {
  private anterior: number | null = null;
  private direcao: 1 | -1 = 1;
  private estaveis = 0;
  atual: number;

  constructor(private readonly faixa: FaixaDeConcorrencia) {
    this.atual = faixa.inicial;
  }

  private limitar(n: number) {
    return Math.min(this.faixa.maximo, Math.max(this.faixa.minimo, n));
  }

  /**
   * Registra a vazão (bytes/s) da última janela e devolve a nova concorrência. `saturado`: havia
   * envio esperando vaga; sem isso, a concorrência não era o gargalo e nada muda.
   */
  registrar(vazao: number, saturado: boolean): number {
    if (!saturado || vazao <= 0) {
      this.anterior = null;
      this.estaveis = 0;
      return this.atual;
    }
    if (this.anterior === null) {
      this.anterior = vazao;
      this.direcao = 1;
      this.atual = this.limitar(this.atual + 1);
      return this.atual;
    }
    const razao = vazao / this.anterior;
    if (razao >= 1 + SENSIBILIDADE) {
      // A última mudança ajudou: mais um degrau na mesma direção.
      this.atual = this.limitar(this.atual + this.direcao);
      this.estaveis = 0;
    } else if (razao <= 1 - SENSIBILIDADE) {
      // Piorou: volta e passa a andar no outro sentido.
      this.direcao = this.direcao === 1 ? -1 : 1;
      this.atual = this.limitar(this.atual + this.direcao);
      this.estaveis = 0;
    } else if (++this.estaveis >= JANELAS_PARA_TESTAR) {
      // Estável há um tempo: testa um degrau acima (a conexão pode ter melhorado).
      this.direcao = 1;
      this.atual = this.limitar(this.atual + 1);
      this.estaveis = 0;
    }
    this.anterior = vazao;
    return this.atual;
  }
}
