// "Impressão digital" de um arquivo de foto, para achar a mesma foto enviada duas vezes
// (docs/arquitetura.md, "Upload"). Calculada no navegador antes do envio e conferida no
// servidor com o arquivo que chegou; fica em `fotos.hash_conteudo`.
//
// Não é o SHA-256 do arquivo inteiro: com centenas de fotos de 20 a 200 MB, ler tudo só para o
// hash dobrava a leitura do disco (ou do cartão) e atrasava o início do envio. É o SHA-256 do
// tamanho + o primeiro, o do meio e o último MB (arquivo de até 3 MB entra inteiro): ~3 MB lidos
// por foto, qualquer que seja o tamanho.
//
// Risco de falso positivo (duas fotos diferentes com a mesma impressão, e a segunda pulada como
// "repetida"): exigiria o mesmo tamanho em bytes e os mesmos 3 MB nas três posições. Num JPEG, o
// primeiro MB já traz o EXIF (data e hora com fração de segundo, número do disparo) e o começo
// dos dados comprimidos, que mudam com qualquer diferença na cena; na prática só acontece com o
// mesmo arquivo. Fotos enviadas antes desta mudança têm o SHA-256 inteiro, então reenviar uma
// delas não é detectado como repetida (só cria outro item, nada se perde).

const TRECHO = 1024 * 1024;
const VERSAO = "clicouai-impressao-v1";

/** Trechos [início, fim) do arquivo que entram na impressão. */
export function trechosDaImpressao(tamanho: number): [number, number][] {
  if (tamanho <= 3 * TRECHO) return [[0, tamanho]];
  const meio = Math.floor(tamanho / 2) - TRECHO / 2;
  return [
    [0, TRECHO],
    [meio, meio + TRECHO],
    [tamanho - TRECHO, tamanho],
  ];
}

/**
 * Impressão (64 caracteres hexadecimais) de um arquivo de `tamanho` bytes, lendo só os trechos.
 * Usa a Web Crypto, igual no navegador e no Node.
 */
export async function impressaoDoArquivo(
  tamanho: number,
  ler: (inicio: number, fim: number) => Promise<Uint8Array> | Uint8Array,
): Promise<string> {
  const partes: Uint8Array[] = [new TextEncoder().encode(`${VERSAO}:${tamanho}:`)];
  for (const [inicio, fim] of trechosDaImpressao(tamanho)) partes.push(await ler(inicio, fim));
  const total = partes.reduce((s, p) => s + p.length, 0);
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  const resumo = await crypto.subtle.digest("SHA-256", junto);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Impressão de um arquivo escolhido no navegador (lê só os trechos, não o arquivo todo). */
export function impressaoDoBlob(arquivo: Blob) {
  return impressaoDoArquivo(
    arquivo.size,
    async (inicio, fim) => new Uint8Array(await arquivo.slice(inicio, fim).arrayBuffer()),
  );
}
