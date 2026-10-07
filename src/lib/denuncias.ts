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
