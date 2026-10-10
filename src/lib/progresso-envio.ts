// Progresso do envio de fotos do painel (src/components/painel/envio-fotos.tsx), num número só
// para o círculo da tela. Cada foto pesa o mesmo: PESO_DO_UPLOAD do peso é a subida ao R2 (pelos
// bytes, enquanto sobe) e o resto é ficar pronta no servidor (prévia, miniatura). Assim o
// círculo só chega a 100% quando todas as fotos estão prontas para aparecer no evento, e o
// fotógrafo não precisa saber das etapas.

/** Estado de cada arquivo do envio, como a tela guarda. */
export type EstadoDoArquivo =
  /** Recusada na conferência (tipo ou tamanho): nunca entra no envio nem na conta. */
  | "recusada"
  /** Já estava no evento ou na seleção: pulada, conta como concluída. */
  | "repetida"
  | "aguardando"
  | "enviando"
  /** Subiu e está sendo preparada pelo servidor (a tela pediu). */
  | "processando"
  /** Subiu e foi entregue ao servidor, que a prepara sozinho. */
  | "no-servidor"
  | "pronta"
  | "erro";

export type ArquivoDoEnvio = {
  estado: EstadoDoArquivo;
  /** Bytes já enviados ao R2 (só conta em `enviando`). */
  enviados?: number;
  /** Tamanho do arquivo, em bytes. */
  tamanho?: number;
};

export type ProgressoDoEnvio = {
  /** 0 a 100, arredondado para baixo; 100 só quando não falta nada. */
  porcentagem: number;
  /** Fotos que terminaram (prontas, com erro ou repetidas). */
  concluidas: number;
  /** Fotos do envio (sem as recusadas). */
  total: number;
  prontas: number;
  comErro: number;
  repetidas: number;
  /** Ainda não terminaram (aguardando, subindo ou ficando prontas). */
  pendentes: number;
};

/** Parte do peso de cada foto que é a subida ao R2; o resto é ficar pronta no servidor. */
export const PESO_DO_UPLOAD = 0.7;

/** Quanto de uma foto já foi feito, de 0 a 1. */
function fracao({ estado, enviados = 0, tamanho = 0 }: ArquivoDoEnvio) {
  switch (estado) {
    case "pronta":
    case "erro":
    case "repetida":
      return 1;
    case "processando":
    case "no-servidor":
      return PESO_DO_UPLOAD;
    case "enviando":
      return tamanho > 0 ? PESO_DO_UPLOAD * Math.min(1, Math.max(0, enviados / tamanho)) : 0;
    default:
      return 0;
  }
}

export function progressoDoEnvio(arquivos: readonly ArquivoDoEnvio[]): ProgressoDoEnvio {
  let total = 0;
  let prontas = 0;
  let comErro = 0;
  let repetidas = 0;
  let feito = 0;
  for (const arquivo of arquivos) {
    if (arquivo.estado === "recusada") continue;
    total++;
    if (arquivo.estado === "pronta") prontas++;
    else if (arquivo.estado === "erro") comErro++;
    else if (arquivo.estado === "repetida") repetidas++;
    feito += fracao(arquivo);
  }
  const concluidas = prontas + comErro + repetidas;
  const pendentes = total - concluidas;
  let porcentagem = 0;
  if (total > 0) {
    porcentagem =
      pendentes === 0 ? 100 : Math.min(99, Math.max(0, Math.floor((feito / total) * 100)));
  }
  return { porcentagem, concluidas, total, prontas, comErro, repetidas, pendentes };
}
