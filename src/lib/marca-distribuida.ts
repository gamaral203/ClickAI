import type { ModeloMarca } from "./marca-dagua";
import { LIMITES_MARCA, type ConfigMarca } from "./protecao-previas";

// Onde vai cada logo da marca d'água de uma prévia (docs/arquitetura.md, "Prévia e marca
// d'água"; docs/riscos.md, "Marca d'água removida com ferramentas de IA"). Só a geometria, sem
// Sharp: o desenho fica em src/servicos/imagens.ts, e assim os testes conferem o plano direto.
//
// O desenho:
//   - uma grade inclinada de logos espalhada pela foto toda, com posição, tamanho, giro e
//     opacidade variando logo a logo (jitter) e o ângulo e a fase da grade variando por foto;
//   - uma logo grande no centro e outra, menor e cruzada, no terço de cima (onde costumam estar
//     o rosto e o corpo em foto de evento), por cima da grade: quem recorta a pessoa leva marca
//     junto, e o preenchimento por IA tem de reinventar a parte mais importante da foto.
// A variação sai de um gerador determinístico semeado pelo id da foto: a mesma foto sai sempre
// igual (regerar não muda nada sem motivo), e cada foto tem um padrão diferente. Com o mesmo
// padrão em milhares de fotos, dá para estimar a marca pela média delas e subtrair em lote
// (Dekel et al., "On the Effectiveness of Visible Watermarks", CVPR 2017); a variação por foto
// tira essa vantagem. Nada disso torna a remoção impossível: ela fica mais cara e pior.

/**
 * Ajuste de cada modelo do fotógrafo sobre a configuração global: multiplica quantidade, tamanho
 * e opacidade (sem passar dos pisos) e liga os enfeites que o modelo tem. `centro` é a largura
 * da logo central (fração da largura útil) e o quanto ela é mais opaca que as da grade.
 */
export type EstiloDoModelo = {
  quantidade: number;
  tamanho: number;
  opacidade: number;
  centro: { largura: number; opacidade: number };
  /** Linhas finas cruzadas na diagonal (passo em fração da largura). */
  grade?: { passo: number; opacidade: number };
  /** Anéis da marca e os avisos "Foto protegida" e "Não tire print". */
  protecao?: boolean;
};

export const ESTILOS_DOS_MODELOS: Record<ModeloMarca, EstiloDoModelo> = {
  discreta: {
    quantidade: 0.5,
    tamanho: 1.35,
    opacidade: 0.75,
    centro: { largura: 0.3, opacidade: 1.2 },
  },
  padrao: { quantidade: 1, tamanho: 1, opacidade: 1, centro: { largura: 0.34, opacidade: 1.25 } },
  densa: {
    quantidade: 2,
    tamanho: 0.72,
    opacidade: 1.08,
    centro: { largura: 0.34, opacidade: 1.25 },
  },
  central: {
    quantidade: 0.7,
    tamanho: 1.05,
    opacidade: 0.65,
    centro: { largura: 0.55, opacidade: 2 },
  },
  grade: {
    quantidade: 0.75,
    tamanho: 0.9,
    opacidade: 0.82,
    centro: { largura: 0.34, opacidade: 1.3 },
    grade: { passo: 0.2, opacidade: 0.5 },
  },
  maxima: {
    quantidade: 2,
    tamanho: 0.72,
    opacidade: 1.18,
    centro: { largura: 0.6, opacidade: 1.4 },
    grade: { passo: 0.16, opacidade: 0.5 },
  },
  forte: {
    quantidade: 1.1,
    tamanho: 0.8,
    opacidade: 1,
    centro: { largura: 0.42, opacidade: 1.45 },
    grade: { passo: 0.24, opacidade: 0.42 },
    protecao: true,
  },
};

/** Opacidade mínima e máxima de qualquer logo, depois de todos os ajustes. */
export const OPACIDADE_MINIMA = LIMITES_MARCA.opacidadePct.min / 100;
export const OPACIDADE_MAXIMA = 0.85;
/** Piso da logo do centro e da do terço de cima: sobre a pessoa, a marca é sempre forte. */
export const OPACIDADE_MINIMA_CENTRO = 0.5;
/** Logos da grade, no mínimo, numa prévia e numa miniatura (fora a central e a de cima). */
export const MINIMO_DA_GRADE = { previa: 6, miniatura: 4 } as const;
/**
 * Largura de uma logo de tamanho 100%, em fração do lado maior da versão. A miniatura usa logos
 * proporcionalmente maiores (e menos delas), para a marca continuar legível em 400 px.
 */
export const LOGO_RELATIVA = { previa: 300 / 1600, miniatura: 120 / 400 } as const;
/** Proporção da logo oficial (public/logo.png, 544 × 160). */
export const PROPORCAO_DA_LOGO = 544 / 160;
/** Inclinação da grade quando não varia, em graus (a de sempre). */
export const INCLINACAO_PADRAO = -24;

export type TipoDeVersao = keyof typeof LOGO_RELATIVA;

export type Marca = {
  /** Centro da logo, em px. */
  x: number;
  y: number;
  /** Largura da logo, em px. */
  largura: number;
  /** Giro, em graus. */
  angulo: number;
  opacidade: number;
  papel: "grade" | "centro" | "assunto";
};

export type PlanoDaMarca = {
  marcas: Marca[];
  /** Deslocamento das linhas cruzadas (fração do passo), nos modelos que as têm. */
  faseDaGrade: number;
};

/** FNV-1a de 32 bits: semente estável a partir do id da foto. */
export function sementeDe(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: gerador pequeno e determinístico, números em [0, 1). Não é criptográfico. */
export function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const prender = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Plano das logos de uma versão (prévia, prévia do celular ou miniatura) de uma foto. As
 * posições são calculadas em fração da foto, então a prévia e a do celular da mesma foto têm o
 * mesmo desenho em escalas diferentes.
 */
export function planejarMarcas({
  largura,
  altura,
  semente,
  config,
  modelo,
  versao,
}: {
  largura: number;
  altura: number;
  /** Id da foto (ou outro texto estável). */
  semente: string;
  config: ConfigMarca;
  modelo: ModeloMarca;
  versao: TipoDeVersao;
}): PlanoDaMarca {
  const estilo = ESTILOS_DOS_MODELOS[modelo];
  const varia = config.variacao;
  // Sem variação, a semente é fixa e nenhum sorteio é usado: o mesmo desenho em todas as fotos.
  const sorteio = gerador(varia ? sementeDe(semente) : 0x5eed);
  /** Número em [-1, 1) quando varia; 0 quando não. */
  const jitter = () => (varia ? sorteio() * 2 - 1 : 0);

  const opacidade = prender(
    (config.opacidadePct / 100) * estilo.opacidade,
    OPACIDADE_MINIMA,
    OPACIDADE_MAXIMA,
  );
  const tamanho = (config.tamanhoPct / 100) * estilo.tamanho;
  const maior = Math.max(largura, altura);
  const menor = Math.min(largura, altura);
  const larguraLogo = Math.min(largura * 0.9, maior * LOGO_RELATIVA[versao] * tamanho);
  const alturaLogo = larguraLogo / PROPORCAO_DA_LOGO;

  // Grade: N células de área igual, com o vão na linha ~2x o vão entre linhas (a logo é larga).
  const fatorDaVersao = versao === "miniatura" ? 0.5 : 1;
  const n = Math.max(
    MINIMO_DA_GRADE[versao],
    Math.round(config.quantidade * estilo.quantidade * fatorDaVersao),
  );
  const area = (largura * altura) / n;
  let passoY = Math.sqrt(area / 2);
  let passoX = 2 * passoY;
  // Sem sobrepor logos vizinhas na mesma linha nem encostar as linhas.
  if (passoX < larguraLogo * 1.1) {
    passoX = larguraLogo * 1.1;
    passoY = area / passoX;
  }
  passoY = Math.max(passoY, alturaLogo * 1.6);

  const inclinacao = INCLINACAO_PADRAO + jitter() * 12;
  const rad = (inclinacao * Math.PI) / 180;
  const [cos, sen] = [Math.cos(rad), Math.sin(rad)];
  const faseX = (varia ? sorteio() : 0.5) * passoX;
  const faseY = (varia ? sorteio() : 0.5) * passoY;
  const faseDaGrade = varia ? sorteio() : 0;

  const marcas: Marca[] = [];
  const raio = Math.ceil(Math.hypot(largura, altura) / 2 / Math.min(passoX, passoY)) + 2;
  for (let j = -raio; j <= raio; j++) {
    for (let i = -raio; i <= raio; i++) {
      // Sempre os mesmos sorteios por ponto, dentro ou fora da foto: o plano não depende da
      // ordem em que os pontos são descartados.
      const u = i * passoX + (j & 1 ? passoX / 2 : 0) + faseX + jitter() * 0.22 * passoX;
      const v = j * passoY + faseY + jitter() * 0.22 * passoY;
      const escala = 1 + jitter() * 0.22;
      const giro = jitter() * 10;
      const variacaoOpacidade = 1 + jitter() * 0.15;
      const x = largura / 2 + u * cos - v * sen;
      const y = altura / 2 + u * sen + v * cos;
      const w = larguraLogo * escala;
      // Entra se o centro estiver na foto ou perto da borda (a logo cortada na borda também vale).
      if (x < -w * 0.3 || x > largura + w * 0.3) continue;
      if (y < -alturaLogo * 0.4 || y > altura + alturaLogo * 0.4) continue;
      marcas.push({
        x,
        y,
        largura: w,
        angulo: inclinacao + giro,
        opacidade: prender(opacidade * variacaoOpacidade, OPACIDADE_MINIMA, OPACIDADE_MAXIMA),
        papel: "grade",
      });
    }
  }

  // Logo grande no centro (onde costuma estar a pessoa), sempre, em qualquer modelo, e nunca
  // menor que no tamanho 100%.
  const util = Math.min(largura, altura * 2.4);
  const larguraCentro = Math.min(
    largura * 0.8,
    util * estilo.centro.largura * prender(config.tamanhoPct / 100, 1, 1.3),
  );
  const anguloCentro = INCLINACAO_PADRAO / 2 + jitter() * 6;
  // A do centro nunca fica mais fraca que OPACIDADE_MINIMA_CENTRO, qualquer que seja o ajuste.
  const opacidadeCentro = prender(
    opacidade * estilo.centro.opacidade,
    OPACIDADE_MINIMA_CENTRO,
    OPACIDADE_MAXIMA,
  );
  marcas.push({
    x: largura * (0.5 + jitter() * 0.05),
    y: altura * (0.5 + jitter() * 0.05),
    largura: larguraCentro,
    angulo: anguloCentro,
    opacidade: opacidadeCentro,
    papel: "centro",
  });
  // E uma cruzada no terço de cima, sobre o rosto e o peito na maioria das fotos de evento.
  marcas.push({
    x: largura * (0.5 + jitter() * 0.12),
    y: altura * (0.34 + jitter() * 0.06),
    largura: Math.max(larguraLogo, larguraCentro * 0.62),
    angulo: anguloCentro + 34 + jitter() * 8,
    opacidade: prender(opacidadeCentro * 0.9, OPACIDADE_MINIMA, OPACIDADE_MAXIMA),
    papel: "assunto",
  });

  // Nenhuma logo mais alta que a foto (fotos muito estreitas).
  for (const m of marcas) m.largura = Math.max(8, Math.min(m.largura, menor * PROPORCAO_DA_LOGO));
  return { marcas, faseDaGrade };
}
