import { Camera } from "lucide-react";

// Moldura dourada da meta batida, na foto de perfil do fotógrafo: anel dourado em volta da
// foto e, embaixo, o selo com a câmera, o valor da meta ("10K") e ramos de louro. Desenhada em
// CSS e SVG (sem imagem pronta), então vale para qualquer meta e qualquer tamanho.

/** Gradiente dourado usado no anel, na borda do selo e no texto. */
export const DOURADO =
  "linear-gradient(135deg, #fff3b0 0%, #f2c94c 22%, #b8860b 48%, #ffe48a 70%, #a6741c 100%)";

/** Ramo de louro: folhas ao longo de uma curva. `lado` espelha para a direita. */
function Louro({ lado }: { lado: "esquerda" | "direita" }) {
  const folhas = [
    { x: 30, y: 52, r: -60 },
    { x: 22, y: 40, r: -35 },
    { x: 18, y: 27, r: -12 },
    { x: 19, y: 14, r: 12 },
    { x: 40, y: 50, r: -110 },
    { x: 33, y: 36, r: -85 },
    { x: 29, y: 22, r: -62 },
  ];
  return (
    <svg
      viewBox="0 0 56 64"
      aria-hidden="true"
      className="h-full w-auto shrink-0"
      style={lado === "direita" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M44 62 C 26 52, 16 36, 20 6"
        stroke="#b8860b"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {folhas.map((f, i) => (
        <ellipse
          key={i}
          cx={f.x}
          cy={f.y}
          rx="9"
          ry="4.2"
          fill={i % 2 === 0 ? "#e8b93c" : "#f5d46b"}
          stroke="#8a5d12"
          strokeWidth="0.6"
          transform={`rotate(${f.r} ${f.x} ${f.y})`}
        />
      ))}
    </svg>
  );
}

/**
 * O selo sozinho: placa escura com borda dourada, câmera em cima e o valor da meta. `escala`
 * acompanha o tamanho da foto (1 = foto de 128 px).
 */
export function SeloDeConquista({ rotulo, escala = 1 }: { rotulo: string; escala?: number }) {
  return (
    <span
      className="flex items-end justify-center"
      style={{ height: 52 * escala, gap: 0 }}
      role="img"
      aria-label={`Selo de ${rotulo} em vendas no ClicouAí`}
    >
      <Louro lado="esquerda" />
      <span className="relative flex flex-col items-center" style={{ marginInline: -6 * escala }}>
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{
            top: -14 * escala,
            width: 22 * escala,
            height: 22 * escala,
            background: DOURADO,
            padding: 2 * escala,
          }}
        >
          <span className="flex size-full items-center justify-center rounded-full bg-[#141416]">
            <Camera style={{ width: 12 * escala, height: 12 * escala, color: "#f2c94c" }} />
          </span>
        </span>
        <span
          className="rounded-lg"
          style={{ background: DOURADO, padding: 2 * escala, borderRadius: 10 * escala }}
        >
          <span
            className="flex items-center justify-center bg-[#141416] font-black tracking-tight"
            style={{
              borderRadius: 8 * escala,
              padding: `${4 * escala}px ${10 * escala}px ${3 * escala}px`,
              fontSize: 24 * escala,
              lineHeight: 1,
            }}
          >
            <span
              style={{
                background: DOURADO,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {rotulo}
            </span>
          </span>
        </span>
      </span>
      <Louro lado="direita" />
    </span>
  );
}
