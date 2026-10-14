// Dados legais da empresa responsável pela plataforma. Fonte única: rodapé e páginas legais
// leem daqui, para não repetir (nem errar) razão social, CNPJ e endereço.
export const EMPRESA = {
  marca: "ClicouAí",
  descricao: "Plataforma de Fotografias",
  sobre:
    "Uma plataforma criada para conectar fotógrafos e clientes, facilitando a publicação, divulgação e venda de fotografias online.",
  razaoSocial: "Agência Dalibor",
  cnpj: "59.690.415/0001-87",
  endereco: "Rua Dois de Julho, B1 Residencial, Miguel Calmon – Bahia",
} as const;

/** Linha única com razão social, CNPJ e endereço, para o rodapé e o topo das páginas legais. */
export const EMPRESA_LINHA = `${EMPRESA.razaoSocial}, CNPJ ${EMPRESA.cnpj}, ${EMPRESA.endereco}`;
