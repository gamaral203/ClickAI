/**
 * E-mail mascarado para mostrar na tela do código (ex.: "er***@gmail.com"): ajuda a pessoa a
 * saber em qual caixa procurar sem expor o endereço inteiro a quem olha a tela. Mostra as duas
 * primeiras letras (uma, se o nome for curto) e o domínio inteiro.
 */
export function mascararEmail(email: string): string {
  const limpo = email.trim().toLowerCase();
  const arroba = limpo.lastIndexOf("@");
  if (arroba <= 0 || arroba === limpo.length - 1) return "***";
  const nome = limpo.slice(0, arroba);
  const dominio = limpo.slice(arroba + 1);
  const visivel = nome.length > 3 ? 2 : 1;
  return `${nome.slice(0, visivel)}***@${dominio}`;
}
