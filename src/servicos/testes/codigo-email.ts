// Ajudante dos testes do código por e-mail (src/servicos/codigo-acao.ts e o login): sem o Resend e
// fora da produção, o e-mail com o código vai para o log (`console.info`); aqui ele é lido de lá.

import { vi } from "vitest";

import type { Usuario } from "@/dados/tipos";
import { enviarCodigoDeAcao, type FinalidadeDoCodigo } from "@/servicos/codigo-acao";

/** Roda `enviar` e devolve o código de 6 dígitos que saiu no log do "e-mail". */
export async function capturarCodigo(enviar: () => Promise<unknown>): Promise<string> {
  const espiao = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await enviar();
    const linha = espiao.mock.calls.map((c) => String(c[0])).find((t) => /código \d{6}/.test(t));
    const codigo = linha?.match(/código (\d{6})/)?.[1];
    if (!codigo) throw new Error("nenhum código saiu no log");
    return codigo;
  } finally {
    espiao.mockRestore();
  }
}

/** Pede o código de confirmação da finalidade e devolve o que "chegou" no e-mail. */
export function codigoDeAcaoEnviado(
  usuario: Pick<Usuario, "id" | "email" | "nome">,
  finalidade: FinalidadeDoCodigo,
) {
  return capturarCodigo(() => enviarCodigoDeAcao(usuario, finalidade));
}
