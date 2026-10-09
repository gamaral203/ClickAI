// Regras pequenas do formulário de cadastro (/cadastro), separadas para dar para testar.

export type PapelCadastro = "cliente" | "fotografo";

/**
 * Tipo de conta que o formulário deve mostrar marcado. Depois de um erro (senha curta, e-mail em
 * uso...), o React limpa o formulário e volta cada campo ao valor padrão: sem devolver o papel
 * escolhido, quem marcou "Sou fotógrafo" voltava para "Quero comprar fotos" sem perceber e
 * criava uma conta de comprador.
 */
export function papelEscolhido(valor: unknown, padrao: PapelCadastro): PapelCadastro {
  return valor === "cliente" || valor === "fotografo" ? valor : padrao;
}
