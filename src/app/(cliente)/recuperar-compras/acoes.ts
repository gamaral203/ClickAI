"use server";

import { enviarLinkDasCompras, type ResultadoRecuperacao } from "@/servicos/recuperar-compras";

export async function recuperarComprasAcao(email: string): Promise<ResultadoRecuperacao> {
  return enviarLinkDasCompras(email);
}
