// Regras da loja própria (docs/arquitetura.md, "Loja própria"). Ficam aqui para valerem igual
// ao salvar no painel e ao montar a página da loja: o que vai para o HTML é sempre conferido.

/** Google Analytics 4: só o ID, nunca HTML nem script (docs/riscos.md, prioridade alta). */
export const FORMATO_GA = /^G-[A-Z0-9]{4,15}$/;
/** Google Tag Manager: só o ID. */
export const FORMATO_GTM = /^GTM-[A-Z0-9]{4,10}$/;
export const FORMATO_COR = /^#[0-9a-fA-F]{6}$/;
/** De 3 a 32 letras minúsculas, números e hífen, sem começar nem terminar com hífen. */
export const FORMATO_SUBDOMINIO = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/** Subdomínios da própria plataforma ou que confundiriam o comprador. */
const RESERVADOS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "loja",
  "lojas",
  "static",
  "cdn",
  "img",
  "imagens",
  "mail",
  "email",
  "suporte",
  "ajuda",
  "blog",
  "status",
  "pagamento",
  "pagamentos",
  "checkout",
  "clicouai",
]);

export function subdominioValido(subdominio: string) {
  return (
    FORMATO_SUBDOMINIO.test(subdominio) && !subdominio.includes("--") && !RESERVADOS.has(subdominio)
  );
}

/** O ID só entra na página se passar no formato, mesmo que já tenha sido validado ao salvar. */
export function idGaSeguro(id: string | null) {
  return id && FORMATO_GA.test(id) ? id : null;
}

export function idGtmSeguro(id: string | null) {
  return id && FORMATO_GTM.test(id) ? id : null;
}

/** Luminância relativa (WCAG) de uma cor #rrggbb. */
function luminancia(hex: string) {
  const canais = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

export function contraste(a: string, b: string) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Texto legível sobre a cor: branco ou quase preto, o que tiver mais contraste. */
export function corDoTexto(fundo: string) {
  return contraste(fundo, "#ffffff") >= contraste(fundo, "#111111") ? "#ffffff" : "#111111";
}
