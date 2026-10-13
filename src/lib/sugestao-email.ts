// "Você quis dizer fulano@gmail.com?": o link das fotos vai para o e-mail digitado no checkout, e
// um domínio errado (gmial.com, hotmal.com, gmail.con) faz o cliente nunca receber. Compara o
// domínio com os mais usados no Brasil e sugere o mais parecido (até 2 letras de diferença).

const DOMINIOS = [
  "gmail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "msn.com",
];

/** Erros comuns que a distância não pega bem (domínio que existe, mas não é o que a pessoa usa). */
const TROCAS: Record<string, string> = {
  "gmail.com.br": "gmail.com",
  "gmai.com.br": "gmail.com",
  "icloud.com.br": "icloud.com",
};

function distancia(a: string, b: string) {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** O e-mail com o domínio corrigido, ou `null` se o domínio parece certo (ou não dá para saber). */
export function sugerirEmail(email: string): string | null {
  const limpo = email.trim().toLowerCase();
  const arroba = limpo.lastIndexOf("@");
  if (arroba < 1) return null;
  const usuario = limpo.slice(0, arroba);
  const dominio = limpo.slice(arroba + 1);
  if (!dominio || DOMINIOS.includes(dominio)) return null;
  if (TROCAS[dominio]) return `${usuario}@${TROCAS[dominio]}`;
  let melhor: { dominio: string; d: number } | null = null;
  for (const conhecido of DOMINIOS) {
    const d = distancia(dominio, conhecido);
    if (!melhor || d < melhor.d) melhor = { dominio: conhecido, d };
  }
  return melhor && melhor.d > 0 && melhor.d <= 2 && dominio.length >= 4
    ? `${usuario}@${melhor.dominio}`
    : null;
}
