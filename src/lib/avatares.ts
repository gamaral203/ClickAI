import { urlPublica } from "./url-publica";

// Avatares de perfil do fotógrafo (public/avatares/). Quem não envia foto escolhe um deles em
// Perfil e recebimento; quem nunca escolheu fica com um padrão, sempre o mesmo para a mesma conta.
// Para adicionar um avatar, ver docs/marca/marca.md ("Avatares").

export type Avatar = {
  id: string;
  /** Descrição curta, para o texto alternativo e o rótulo do botão de escolha. */
  nome: string;
  url: string;
};

const NOMES = [
  "Pessoa de cabelo curto castanho",
  "Pessoa de boné com câmera",
  "Pessoa de cabelo crespo e óculos",
  "Pessoa de cabelo longo ruivo",
  "Pessoa de coque com câmera",
  "Pessoa de barba e gorro",
  "Pessoa de cabelo grisalho e óculos",
  "Pessoa de tranças",
  "Pessoa careca de barba com câmera",
  "Pessoa de franja e fone de ouvido",
  "Pessoa loira de óculos escuros",
  "Pessoa de rabo de cavalo com câmera",
] as const;

export const AVATARES: readonly Avatar[] = NOMES.map((nome, i) => {
  const id = `avatar-${String(i + 1).padStart(2, "0")}`;
  return { id, nome, url: `/avatares/${id}.svg` };
});

const POR_ID = new Map(AVATARES.map((a) => [a.id, a]));

export function avatarValido(id: unknown): id is string {
  return typeof id === "string" && POR_ID.has(id);
}

/** Avatar de quem nunca escolheu: sai do id da conta (FNV-1a), então não muda entre as visitas. */
export function avatarPadrao(fotografoId: string): Avatar {
  let hash = 0x811c9dc5;
  for (let i = 0; i < fotografoId.length; i++) {
    hash ^= fotografoId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return AVATARES[(hash >>> 0) % AVATARES.length];
}

/** O avatar escolhido pelo fotógrafo ou, sem escolha (ou com um id que saiu do catálogo), o padrão. */
export function avatarDoFotografo(fotografo: { id: string; avatar?: string | null }): Avatar {
  return (fotografo.avatar && POR_ID.get(fotografo.avatar)) || avatarPadrao(fotografo.id);
}

/**
 * Imagem do perfil: a foto enviada, se houver (ela tem prioridade); senão, o avatar escolhido;
 * senão, o padrão. Aceita a foto como está no banco (chave do R2) ou já como URL.
 */
export function urlDoAvatar(fotografo: {
  id: string;
  fotoPerfil?: string | null;
  avatar?: string | null;
}): string {
  if (fotografo.fotoPerfil) return urlPublica(fotografo.fotoPerfil);
  return avatarDoFotografo(fotografo).url;
}

/**
 * Imagem do perfil no topo da página pública e da loja: a foto enviada, com o texto alternativo
 * do logo, ou o avatar, decorativo (o nome aparece logo ao lado).
 */
export function logoDoFotografo(
  fotografo: {
    id: string;
    nomePublico: string;
    fotoPerfil?: string | null;
    avatar?: string | null;
  },
  nome = fotografo.nomePublico,
): { url: string; alt: string } {
  return { url: urlDoAvatar(fotografo), alt: fotografo.fotoPerfil ? `Logo de ${nome}` : "" };
}
