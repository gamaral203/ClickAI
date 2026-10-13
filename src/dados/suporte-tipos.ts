// Tipos do chat de ajuda que a tela também usa (sem acesso ao banco).

export type TipoContatoSuporte = "fotografo" | "gestor" | "cliente" | "visitante";

/** Rótulo do tipo de quem escreveu, para a gestão. */
export const ROTULO_CONTATO_SUPORTE: Record<TipoContatoSuporte, string> = {
  fotografo: "Fotógrafo",
  gestor: "Gestor",
  cliente: "Cliente",
  visitante: "Visitante sem conta",
};
