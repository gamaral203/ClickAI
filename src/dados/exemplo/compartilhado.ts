// O Next pode carregar um módulo mais de uma vez (por rota e a cada recarga em
// desenvolvimento), e cada cópia teria as próprias coleções. Guardando no globalThis, todas
// as cópias enxergam os mesmos dados de exemplo, como enxergariam o mesmo banco.

const global = globalThis as typeof globalThis & { __clicouai?: Record<string, unknown> };

/** Valor único no processo, criado na primeira chamada com esta chave. */
export function compartilhado<T>(chave: string, criar: () => T): T {
  global.__clicouai ??= {};
  if (!(chave in global.__clicouai)) global.__clicouai[chave] = criar();
  return global.__clicouai[chave] as T;
}
