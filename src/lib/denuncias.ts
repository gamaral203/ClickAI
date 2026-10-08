// Motivos de denúncia, com o texto que o denunciante vê e o que a equipe vê no admin.

export const MOTIVOS_DENUNCIA = {
  privacidade: "Apareço na foto e quero que ela seja removida",
  direitos_autorais: "A foto é minha ou da minha empresa e foi publicada sem autorização",
  conteudo_improprio: "Conteúdo impróprio, ofensivo ou que expõe menor de idade",
  golpe: "Evento falso ou tentativa de golpe",
  outro: "Outro motivo",
} as const;

export type MotivoDenuncia = keyof typeof MOTIVOS_DENUNCIA;

export const MOTIVOS = Object.keys(MOTIVOS_DENUNCIA) as [MotivoDenuncia, ...MotivoDenuncia[]];

export function rotuloDoMotivo(motivo: string) {
  return MOTIVOS_DENUNCIA[motivo as MotivoDenuncia] ?? motivo;
}

export const ROTULO_STATUS = {
  recebida: "Recebida",
  em_analise: "Em análise",
  procedente: "Procedente",
  improcedente: "Improcedente",
} as const;

export type ConteudoDoLink = { tipo: "foto"; id: string } | { tipo: "evento"; slug: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * Lê o link que a pessoa colou no pedido de remoção (src/app/(publico)/remover-foto): a página de
 * uma foto (`/fotos/<id>`) ou de um evento (`/eventos/<endereço>`), com ou sem o domínio.
 * Qualquer outra coisa dá `null`. O domínio não importa: só o caminho é usado.
 */
export function lerLinkDoConteudo(texto: string): ConteudoDoLink | null {
  const valor = texto.trim();
  if (valor.length === 0 || valor.length > 500) return null;
  // "site.com/fotos/…" (sem https://) também vale.
  const comEsquema =
    valor.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(valor) ? valor : `https://${valor}`;
  let caminho: string;
  try {
    caminho = new URL(comEsquema, "https://clicouai.invalid").pathname;
  } catch {
    return null;
  }
  const [vazio, tipo, id, ...resto] = caminho.split("/");
  if (vazio !== "" || resto.some((parte) => parte !== "")) return null;
  if (tipo === "fotos" && id && UUID.test(id)) return { tipo: "foto", id: id.toLowerCase() };
  if (tipo === "eventos" && id && SLUG.test(id)) return { tipo: "evento", slug: id };
  return null;
}
