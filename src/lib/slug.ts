/** "Lia Ramos Fotografia" → "lia-ramos-fotografia". Só letras sem acento, números e hífens. */
export function gerarSlug(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Formato aceito para slugs digitados pelo usuário. */
export const FORMATO_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;
