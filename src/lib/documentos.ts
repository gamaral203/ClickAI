// Validação de CPF e CNPJ pelos dígitos verificadores. Recebe com ou sem pontuação.

export function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

function todosIguais(digitos: string) {
  return /^(\d)\1+$/.test(digitos);
}

export function cpfValido(valor: string) {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;
  for (const posicao of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < posicao; i++) soma += Number(d[i]) * (posicao + 1 - i);
    const verificador = ((soma * 10) % 11) % 10;
    if (verificador !== Number(d[posicao])) return false;
  }
  return true;
}

export function cnpjValido(valor: string) {
  const d = somenteDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const posicao of [12, 13]) {
    let soma = 0;
    for (let i = 0; i < posicao; i++) soma += Number(d[i]) * pesos[i + 13 - posicao];
    const resto = soma % 11;
    const verificador = resto < 2 ? 0 : 11 - resto;
    if (verificador !== Number(d[posicao])) return false;
  }
  return true;
}

export function cpfOuCnpjValido(valor: string) {
  const d = somenteDigitos(valor);
  return d.length === 11 ? cpfValido(d) : cnpjValido(d);
}

/** 000.000.000-00 ou 00.000.000/0000-00. */
export function formatarCpfCnpj(valor: string) {
  const d = somenteDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return valor;
}
