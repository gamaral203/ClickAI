// Proteção da leitura de arquivos no navegador, usada na tela de envio de fotos
// (src/components/painel/envio-fotos.tsx; docs/arquitetura.md, "Upload"). Uma leitura de cartão de
// memória pode falhar ou simplesmente nunca responder (cartão removido, leitor USB com defeito), e
// o navegador não oferece como cancelar um `arrayBuffer()` em andamento: aqui a leitura presa é
// abandonada depois do tempo-limite, a fila segue e, depois de várias falhas seguidas, o resto nem
// tenta ler (com 1.500 fotos, esperar o tempo-limite de cada uma levaria horas).

/** Tempo-limite da conferência de um arquivo (lê só os primeiros 64 KB). */
export const LIMITE_CONFERENCIA_MS = 30_000;
/** Tempo-limite da impressão de um arquivo (lê até 3 MB). */
export const LIMITE_IMPRESSAO_MS = 60_000;
/** Falhas de leitura seguidas que indicam que o cartão sumiu, e não um arquivo ruim. */
export const FALHAS_SEGUIDAS_PARA_PARAR = 8;
/** Sem avanço por este tempo, a tela avisa: na conferência e no envio. */
export const AVISO_PARADO_CONFERENCIA_S = 20;
export const AVISO_PARADO_ENVIO_S = 60;
/** Média da impressão por foto a partir da qual a tela recomenda copiar para o computador. */
export const LEITURA_LENTA_MS = 2000;
const AMOSTRAS_PARA_LENTIDAO = 8;

export const MENSAGEM_LEITURA =
  "Não conseguimos ler os arquivos. O cartão foi desconectado? Copie as fotos para o computador e tente de novo.";
export const MENSAGEM_ARQUIVO_ILEGIVEL = "Não foi possível ler este arquivo.";

export class TempoEsgotado extends Error {
  constructor() {
    super("Tempo-limite esgotado.");
    this.name = "TempoEsgotado";
  }
}

export class OperacaoCancelada extends Error {
  constructor() {
    super("Cancelado.");
    this.name = "OperacaoCancelada";
  }
}

/** A leitura nem foi tentada: as anteriores falharam em sequência. */
export class LeituraInterrompida extends Error {
  constructor() {
    super("Leitura interrompida.");
    this.name = "LeituraInterrompida";
  }
}

/**
 * Espera `fazer` por no máximo `limiteMs`. Quem estoura deixa de ser esperado (a promessa original
 * pode nunca terminar: o resultado tardio é ignorado). `sinal` encerra a espera na hora.
 */
export function comTempoLimite<T>(
  fazer: () => Promise<T>,
  limiteMs: number,
  sinal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    if (sinal?.aborted) {
      rejeitar(new OperacaoCancelada());
      return;
    }
    const aoCancelar = () => terminar(() => rejeitar(new OperacaoCancelada()));
    const relogio = setTimeout(() => terminar(() => rejeitar(new TempoEsgotado())), limiteMs);
    function terminar(acao: () => void) {
      clearTimeout(relogio);
      sinal?.removeEventListener("abort", aoCancelar);
      acao();
    }
    sinal?.addEventListener("abort", aoCancelar, { once: true });
    // Dentro de um `then`: um erro síncrono de `fazer` também vira rejeição.
    Promise.resolve()
      .then(fazer)
      .then(
        (valor) => terminar(() => resolver(valor)),
        (erro) => terminar(() => rejeitar(erro)),
      );
  });
}

/** Conta falhas de leitura seguidas; um sucesso zera. Aberto: não adianta tentar ler o resto. */
export class CircuitoDeLeitura {
  private falhas = 0;

  constructor(private readonly limite = FALHAS_SEGUIDAS_PARA_PARAR) {}

  get aberto() {
    return this.falhas >= this.limite;
  }

  registrar(ok: boolean) {
    this.falhas = ok ? 0 : this.falhas + 1;
  }

  reiniciar() {
    this.falhas = 0;
  }
}

/**
 * Lê um arquivo com tempo-limite, registrando no circuito. Rejeita com `OperacaoCancelada` (não
 * conta como falha), `LeituraInterrompida` (o circuito está aberto), `TempoEsgotado` ou o erro do
 * navegador (`NotReadableError`, `NotFoundError`).
 */
export async function lerComProtecao<T>(
  ler: () => Promise<T>,
  {
    limiteMs,
    circuito,
    sinal,
  }: { limiteMs: number; circuito: CircuitoDeLeitura; sinal?: AbortSignal },
): Promise<T> {
  if (sinal?.aborted) throw new OperacaoCancelada();
  if (circuito.aberto) throw new LeituraInterrompida();
  try {
    const valor = await comTempoLimite(ler, limiteMs, sinal);
    circuito.registrar(true);
    return valor;
  } catch (erro) {
    if (!(erro instanceof OperacaoCancelada)) circuito.registrar(false);
    throw erro;
  }
}

/**
 * Repete `fazer` enquanto `repetir` disser que o resultado não serve, com a espera de `esperaMs`
 * entre as tentativas. Devolve o último resultado. `sinal` para antes da próxima tentativa.
 */
export async function comNovasTentativas<T>(
  fazer: (tentativa: number) => Promise<T>,
  {
    tentativas,
    repetir,
    esperaMs,
    dormir = (ms) => new Promise((ok) => setTimeout(ok, ms)),
    sinal,
  }: {
    tentativas: number;
    repetir: (resultado: T) => boolean;
    esperaMs: (tentativa: number) => number;
    dormir?: (ms: number) => Promise<unknown>;
    sinal?: AbortSignal;
  },
): Promise<T> {
  let resultado = await fazer(1);
  for (let n = 2; n <= tentativas && repetir(resultado) && !sinal?.aborted; n++) {
    await dormir(esperaMs(n - 1));
    resultado = await fazer(n);
  }
  return resultado;
}

/** Texto do aviso de tela parada, ou `null` enquanto o tempo sem avanço é normal. */
export function avisoDeParada(fase: "conferencia" | "envio", segundos: number): string | null {
  if (fase === "conferencia") {
    if (segundos < AVISO_PARADO_CONFERENCIA_S) return null;
    return `A leitura está parada há ${segundos} segundos. Cartões e leitores USB podem ficar lentos ou desconectar. Se não voltar, cancele, copie as fotos para o computador e envie de lá.`;
  }
  if (segundos < AVISO_PARADO_ENVIO_S) return null;
  return `Nenhum avanço há ${segundos} segundos. Confira a internet e, se as fotos estão no cartão, se ele continua conectado. Arquivo que não responder vira erro, com a opção de tentar de novo.`;
}

/** A leitura média está tão lenta que copiar para o computador antes compensa? */
export function leituraEstaLenta(amostras: number, msTotal: number) {
  return amostras >= AMOSTRAS_PARA_LENTIDAO && msTotal / amostras >= LEITURA_LENTA_MS;
}
