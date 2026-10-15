import { z } from "zod";

// Configuração global das prévias: marca d'água, tamanho e compressão (docs/arquitetura.md,
// "Prévia e marca d'água"). O gestor ajusta em /admin/marca-dagua e ela vale para a plataforma
// inteira; cada mudança vira uma linha nova em `configuracoes_marca` (quem mudou e quando), e a
// mais recente é a que vale (src/dados/configuracao-marca.ts). O modelo que o fotógrafo escolhe
// em Painel > Marca d'água só ajusta o estilo por cima destes valores, e nunca passa abaixo dos
// pisos daqui (src/lib/marca-distribuida.ts).
//
// Sem Node nem banco: usado pela tela do gestor, pelo servidor e pelos testes.

export type ConfigMarca = {
  /** Tamanho das logos, em % do padrão (100 = logo com ~19% do lado maior da prévia). */
  tamanhoPct: number;
  /**
   * Logos da grade espalhada por prévia, aproximado (a conta é pela área). Fora delas, sempre
   * entram a logo grande do centro e a do terço de cima, onde costumam estar o rosto e o corpo.
   */
  quantidade: number;
  /** Opacidade das logos, em %. Tem piso: a marca nunca some. */
  opacidadePct: number;
  /** Lado maior da prévia da página da foto, em px. */
  larguraPrevia: number;
  /** Qualidade do WebP da prévia (a do celular e a da miniatura seguem, sem passar de 70). */
  qualidade: number;
  /**
   * Varia posição, tamanho, giro e opacidade de cada logo por foto, a partir do id da foto
   * (determinístico: a mesma foto sai sempre igual). Desligado, todas as fotos do mesmo tamanho
   * têm o mesmo desenho, o que facilita a remoção em lote.
   */
  variacao: boolean;
};

/**
 * Limites aceitos no servidor. Os mínimos são o piso de proteção (opacidade e quantidade nunca
 * desligam a marca); os máximos, o teto de qualidade (a prévia nunca chega perto do original:
 * 1920 px é o lado maior da cópia decodificada, LARGURA_ROSTOS em src/servicos/imagens.ts).
 */
export const LIMITES_MARCA = {
  tamanhoPct: { min: 70, max: 180 },
  quantidade: { min: 10, max: 48 },
  opacidadePct: { min: 30, max: 75 },
  larguraPrevia: { min: 800, max: 1920 },
  qualidade: { min: 45, max: 85 },
} as const;

/** Padrões seguros (o desenho de antes, agora espalhado e variando por foto). */
export const CONFIG_MARCA_PADRAO: Readonly<ConfigMarca> = {
  tamanhoPct: 100,
  quantidade: 16,
  opacidadePct: 42,
  larguraPrevia: 1600,
  qualidade: 72,
  variacao: true,
};

const inteiro = (min: number, max: number, nome: string) =>
  z.coerce
    .number({ error: `Informe ${nome}.` })
    .int(`Use um número inteiro para ${nome}.`)
    .min(min, `${nome[0].toUpperCase()}${nome.slice(1)}: no mínimo ${min}.`)
    .max(max, `${nome[0].toUpperCase()}${nome.slice(1)}: no máximo ${max}.`);

/** Validação da entrada do gestor (Server Action). Fora dos limites: recusada, não ajustada. */
export const esquemaConfigMarca = z.object({
  tamanhoPct: inteiro(LIMITES_MARCA.tamanhoPct.min, LIMITES_MARCA.tamanhoPct.max, "o tamanho"),
  quantidade: inteiro(
    LIMITES_MARCA.quantidade.min,
    LIMITES_MARCA.quantidade.max,
    "a quantidade de marcas",
  ),
  opacidadePct: inteiro(
    LIMITES_MARCA.opacidadePct.min,
    LIMITES_MARCA.opacidadePct.max,
    "a opacidade",
  ),
  larguraPrevia: inteiro(
    LIMITES_MARCA.larguraPrevia.min,
    LIMITES_MARCA.larguraPrevia.max,
    "a resolução",
  ),
  qualidade: inteiro(LIMITES_MARCA.qualidade.min, LIMITES_MARCA.qualidade.max, "a qualidade"),
  variacao: z.boolean(),
});

export type CampoConfigMarca = keyof ConfigMarca;

const prender = (valor: unknown, { min, max }: { min: number; max: number }, padrao: number) => {
  const n = typeof valor === "number" && Number.isFinite(valor) ? Math.round(valor) : padrao;
  return Math.min(max, Math.max(min, n));
};

/**
 * Configuração pronta para usar, a partir do que veio do banco: cada valor dentro dos limites
 * (defesa contra uma linha editada à mão) e o padrão no que faltar.
 */
export function normalizarConfigMarca(parcial: Partial<ConfigMarca> | null | undefined) {
  const p = parcial ?? {};
  const d = CONFIG_MARCA_PADRAO;
  return {
    tamanhoPct: prender(p.tamanhoPct, LIMITES_MARCA.tamanhoPct, d.tamanhoPct),
    quantidade: prender(p.quantidade, LIMITES_MARCA.quantidade, d.quantidade),
    opacidadePct: prender(p.opacidadePct, LIMITES_MARCA.opacidadePct, d.opacidadePct),
    larguraPrevia: prender(p.larguraPrevia, LIMITES_MARCA.larguraPrevia, d.larguraPrevia),
    qualidade: prender(p.qualidade, LIMITES_MARCA.qualidade, d.qualidade),
    variacao: typeof p.variacao === "boolean" ? p.variacao : d.variacao,
  } satisfies ConfigMarca;
}

/** A configuração em vigor e a revisão dela (0 = nenhuma gravada ainda: os padrões). */
export type ConfigMarcaVigente = ConfigMarca & { revisao: number };

export const CONFIG_MARCA_INICIAL: Readonly<ConfigMarcaVigente> = {
  ...CONFIG_MARCA_PADRAO,
  revisao: 0,
};

// ---------------------------------------------------------------- Estimativa da regeração

/**
 * Premissas da estimativa mostrada ao gestor antes de regerar as prévias já enviadas. São
 * estimativas, não cobrança: o valor real depende do plano e das cotas grátis.
 *   - CPU: medido com `npm run marcas:comparar` (scripts/comparar-marcas.ts), ~0,45 s por foto de
 *     24 MP numa vCPU para decodificar e gerar as três versões com a marca; a leitura do
 *     original no R2 (~1 a 2 s) é espera de rede, não CPU.
 *   - Vazão: 6 fotos ao mesmo tempo, ~2,5 fotos por segundo (docs/arquitetura.md).
 *   - Vercel: CPU ativa a ~US$ 0,128 por hora (preço de referência; varia por região e plano).
 *   - R2: 3 gravações (classe A, US$ 4,50 por milhão) e 1 leitura (classe B, US$ 0,36 por
 *     milhão) por foto; apagar as antigas não é cobrado; saída da CDN do R2 não é cobrada.
 */
export const PREMISSAS_REGERACAO = {
  segundosDeCpuPorFoto: 0.45,
  fotosPorSegundo: 2.5,
  usdPorHoraDeCpu: 0.128,
  gravacoesPorFoto: 3,
  leiturasPorFoto: 1,
  usdPorMilhaoDeGravacoes: 4.5,
  usdPorMilhaoDeLeituras: 0.36,
} as const;

export type EstimativaRegeracao = {
  fotos: number;
  minutos: number;
  horasDeCpu: number;
  gravacoesR2: number;
  leiturasR2: number;
  custoUsd: number;
};

export function estimarRegeracao(fotos: number): EstimativaRegeracao {
  const p = PREMISSAS_REGERACAO;
  const n = Math.max(0, Math.floor(fotos));
  const horasDeCpu = (n * p.segundosDeCpuPorFoto) / 3600;
  const gravacoesR2 = n * p.gravacoesPorFoto;
  const leiturasR2 = n * p.leiturasPorFoto;
  const custoUsd =
    horasDeCpu * p.usdPorHoraDeCpu +
    (gravacoesR2 / 1_000_000) * p.usdPorMilhaoDeGravacoes +
    (leiturasR2 / 1_000_000) * p.usdPorMilhaoDeLeituras;
  return {
    fotos: n,
    minutos: Math.ceil(n / p.fotosPorSegundo / 60),
    horasDeCpu,
    gravacoesR2,
    leiturasR2,
    custoUsd,
  };
}
