// Dados legais da plataforma. Fonte única: rodapé e páginas legais leem daqui, para não repetir
// (nem errar) o CNPJ. Desde 16/10/2026 aparece só o CNPJ, sem razão social nem endereço.
export const EMPRESA = {
  marca: "ClicouAí",
  descricao: "Plataforma de Fotografias",
  sobre:
    "Uma plataforma criada para conectar fotógrafos e clientes, facilitando a publicação, divulgação e venda de fotografias online.",
  cnpj: "69.600.912/0001-09",
} as const;

/** Linha única com a marca e o CNPJ, para o topo das páginas legais. */
export const EMPRESA_LINHA = `${EMPRESA.marca}, CNPJ ${EMPRESA.cnpj}`;
