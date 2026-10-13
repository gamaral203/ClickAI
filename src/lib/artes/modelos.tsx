// Modelos de arte de divulgação do evento (aba Design do painel): story 1080×1920, feed 1080×1350
// e banner 1200×630. Cada modelo é um desenho para o gerador de imagens do Next (next/og, Satori):
// só flexbox, todo div com mais de um filho tem `display: flex`, medidas em px.
//
// O conteúdo é sempre o mesmo (marca, chamada, título, data e cidade, QR Code e link do evento);
// o que muda é o desenho e a cor. A imagem de fundo é a capa do evento ou uma enviada na hora.

import type { ReactElement } from "react";

import {
  CORES_DE_ARTE,
  FORMATOS_DE_ARTE,
  type CorDeArte,
  type FormatoDeArte,
  type ModeloDeArte,
} from "./opcoes";

export {
  CORES_DE_ARTE,
  FORMATOS_DE_ARTE,
  MODELOS_BANNER,
  MODELOS_VERTICAIS,
  modelosDoFormato,
  nomeDoModelo,
  type CorDeArte,
  type FormatoDeArte,
  type ModeloDeArte,
} from "./opcoes";

export type DadosDaArte = {
  formato: FormatoDeArte;
  modelo: ModeloDeArte;
  cor: CorDeArte;
  titulo: string;
  /** "27 de setembro de 2026 · São Paulo, SP". */
  quando: string;
  /** Nome público do fotógrafo, pequeno, como assinatura. */
  fotografo: string;
  /** Link curto, sem https:// (ex.: clicouai.com/eventos/montaria). */
  link: string;
  /** QR Code em data URL (PNG). */
  qr: string;
  /** Imagem de fundo em data URL (JPEG), já do tamanho que o modelo usa; `null` sem imagem. */
  imagem: string | null;
};

/** Onde a imagem entra em cada modelo: o recorte é feito antes, no tamanho certo. */
export function areaDaImagem(
  modelo: ModeloDeArte,
  formato: FormatoDeArte,
): { largura: number; altura: number } {
  const { largura: L, altura: A } = FORMATOS_DE_ARTE[formato];
  switch (modelo) {
    case "2":
      return { largura: L, altura: Math.round(A * 0.62) };
    case "3":
      return { largura: L - 2 * 72, altura: Math.round(A * 0.58) };
    case "5":
      return { largura: L - 2 * 150, altura: L - 2 * 150 };
    case "7":
      return { largura: L, altura: Math.round(A * 0.6) };
    case "b2":
      return { largura: Math.round(L * 0.56), altura: A };
    case "b3":
      return { largura: 520, altura: A - 2 * 48 };
    default:
      return { largura: L, altura: A };
  }
}

const BRANCO = "#FFFFFF";

function Marca({
  tamanho,
  cor = BRANCO,
  destaque,
}: {
  tamanho: number;
  cor?: string;
  destaque: string;
}) {
  return (
    <div style={{ display: "flex", fontSize: tamanho, fontWeight: 800, color: cor }}>
      Clicou<span style={{ color: destaque }}>Aí</span>
    </div>
  );
}

function Selo({
  texto,
  fundo,
  cor,
  tamanho,
}: {
  texto: string;
  fundo: string;
  cor: string;
  tamanho: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        background: fundo,
        color: cor,
        borderRadius: 999,
        padding: `${Math.round(tamanho * 0.28)}px ${Math.round(tamanho * 0.75)}px`,
        fontSize: tamanho,
        fontWeight: 800,
        letterSpacing: 1,
      }}
    >
      {texto}
    </div>
  );
}

function Qr({ src, lado, borda = 16 }: { src: string; lado: number; borda?: number }) {
  return (
    <div style={{ display: "flex", background: BRANCO, borderRadius: borda * 1.6, padding: borda }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={lado} height={lado} alt="" />
    </div>
  );
}

function Foto({
  src,
  largura,
  altura,
  raio = 0,
}: {
  src: string | null;
  largura: number;
  altura: number;
  raio?: number;
}) {
  if (!src) {
    return (
      <div
        style={{
          display: "flex",
          width: largura,
          height: altura,
          borderRadius: raio,
          background: "rgba(255,255,255,0.12)",
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={largura} height={altura} alt="" style={{ borderRadius: raio }} />
  );
}

/** Título, quando/onde e assinatura, empilhados. */
function Textos({
  d,
  titulo,
  cor = BRANCO,
  suave = "rgba(255,255,255,0.88)",
  maxLargura,
}: {
  d: DadosDaArte;
  titulo: number;
  cor?: string;
  suave?: string;
  maxLargura?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(titulo * 0.22) }}>
      <div
        style={{
          display: "flex",
          fontSize: titulo,
          fontWeight: 800,
          lineHeight: 1.05,
          color: cor,
          ...(maxLargura ? { maxWidth: maxLargura } : {}),
        }}
      >
        {d.titulo}
      </div>
      <div style={{ display: "flex", fontSize: Math.round(titulo * 0.42), color: suave }}>
        {d.quando}
      </div>
      <div style={{ display: "flex", fontSize: Math.round(titulo * 0.34), color: suave }}>
        Fotos por {d.fotografo}
      </div>
    </div>
  );
}

/** Chamada e link ao lado do QR Code. */
function Chamada({
  d,
  tamanho,
  cor = BRANCO,
  link,
}: {
  d: DadosDaArte;
  tamanho: number;
  cor?: string;
  link: string;
}) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: Math.round(tamanho * 0.3), flex: 1 }}
    >
      <div
        style={{ display: "flex", fontSize: tamanho, fontWeight: 800, lineHeight: 1.1, color: cor }}
      >
        Encontre as suas com uma selfie
      </div>
      <div
        style={{
          display: "flex",
          fontSize: Math.round(tamanho * 0.68),
          fontWeight: 800,
          color: link,
        }}
      >
        {d.link}
      </div>
    </div>
  );
}

function Tela({
  d,
  fundo,
  children,
}: {
  d: DadosDaArte;
  fundo: string;
  children: ReactElement | ReactElement[];
}) {
  const { largura, altura } = FORMATOS_DE_ARTE[d.formato];
  return (
    <div
      style={{
        width: largura,
        height: altura,
        display: "flex",
        position: "relative",
        background: fundo,
        color: BRANCO,
        fontFamily: "Jakarta, sans-serif",
        fontWeight: 500,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function FundoInteiro({ d, veu }: { d: DadosDaArte; veu: string }) {
  const { largura, altura } = FORMATOS_DE_ARTE[d.formato];
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        display: "flex",
        width: largura,
        height: altura,
      }}
    >
      <Foto src={d.imagem} largura={largura} altura={altura} />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: largura,
          height: altura,
          display: "flex",
          background: d.imagem ? veu : "transparent",
        }}
      />
    </div>
  );
}

export function desenharArte(d: DadosDaArte): ReactElement {
  const c = CORES_DE_ARTE[d.cor];
  const { largura: L, altura: A } = FORMATOS_DE_ARTE[d.formato];
  const story = d.formato === "story";
  const tituloGrande = story ? 96 : 80;
  const qr = story ? 240 : 200;

  switch (d.modelo) {
    // 2. Foto em cima, faixa colorida embaixo com o texto e o QR Code.
    case "2": {
      const foto = areaDaImagem("2", d.formato);
      return (
        <Tela d={d} fundo={c.fundo}>
          <div style={{ display: "flex", flexDirection: "column", width: L, height: A }}>
            <Foto src={d.imagem} largura={foto.largura} altura={foto.altura} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                flex: 1,
                padding: 64,
                gap: 28,
              }}
            >
              <Selo
                texto="FOTOS LIBERADAS"
                fundo={c.destaque}
                cor={c.tinta === c.fundo ? c.fundo : "#0B0B0F"}
                tamanho={34}
              />
              <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
                <div style={{ display: "flex", flex: 1 }}>
                  <Textos d={d} titulo={story ? 76 : 60} />
                </div>
                <Qr src={d.qr} lado={story ? 200 : 170} />
              </div>
            </div>
          </div>
          <div style={{ position: "absolute", top: 56, left: 64, display: "flex" }}>
            <Marca tamanho={44} destaque={c.destaque} />
          </div>
        </Tela>
      );
    }
    // 3. Fundo branco: texto e QR Code em cima, foto com cantos arredondados embaixo.
    case "3": {
      const foto = areaDaImagem("3", d.formato);
      return (
        <Tela d={d} fundo={BRANCO}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: L,
              height: A,
              padding: 72,
              gap: 40,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 32,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 24, flex: 1 }}>
                <Marca
                  tamanho={40}
                  cor="#0B0B0F"
                  destaque={c.fundo === "#0B0B0F" ? "#2362FE" : c.fundo}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: 34,
                    fontWeight: 800,
                    color: c.fundo,
                    letterSpacing: 1,
                  }}
                >
                  FOTOS DISPONÍVEIS
                </div>
                <Textos
                  d={d}
                  titulo={story ? 72 : 58}
                  cor="#0B0B0F"
                  suave="#4B5563"
                  maxLargura={640}
                />
              </div>
              <Qr src={d.qr} lado={story ? 210 : 170} borda={10} />
            </div>
            <div style={{ display: "flex", flex: 1, alignItems: "flex-end" }}>
              <Foto src={d.imagem} largura={foto.largura} altura={foto.altura} raio={36} />
            </div>
          </div>
        </Tela>
      );
    }
    // 4. Foto inteira e um cartão branco embaixo, com o texto na cor escolhida.
    case "4":
      return (
        <Tela d={d} fundo={c.fundo}>
          <FundoInteiro
            d={d}
            veu="linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%)"
          />
          <div style={{ position: "absolute", top: 64, left: 64, display: "flex" }}>
            <Marca tamanho={48} destaque={c.destaque} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 56,
              right: 56,
              bottom: 56,
              display: "flex",
              flexDirection: "column",
              gap: 28,
              background: BRANCO,
              borderRadius: 40,
              padding: 52,
            }}
          >
            <Selo texto="AS FOTOS CHEGARAM" fundo={c.fundo} cor={BRANCO} tamanho={30} />
            <Textos d={d} titulo={story ? 70 : 58} cor="#0B0B0F" suave="#4B5563" />
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <Qr src={d.qr} lado={story ? 170 : 140} borda={8} />
              <Chamada d={d} tamanho={34} cor="#0B0B0F" link={c.fundo} />
            </div>
          </div>
        </Tela>
      );
    // 5. Foto quadrada numa moldura branca, como uma foto impressa, sobre a cor.
    case "5": {
      const foto = areaDaImagem("5", d.formato);
      return (
        <Tela d={d} fundo={c.fundo}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              width: L,
              height: A,
              padding: story ? "96px 72px" : "56px 72px",
            }}
          >
            <Marca tamanho={48} destaque={c.destaque} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: BRANCO,
                padding: 24,
                paddingBottom: 30,
                borderRadius: 12,
                transform: "rotate(-2deg)",
                gap: 18,
                boxShadow: "0 30px 60px rgba(0,0,0,0.35)",
              }}
            >
              <Foto
                src={d.imagem}
                largura={foto.largura - 48}
                altura={story ? foto.altura - 48 : foto.altura - 260}
              />
              <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#0B0B0F" }}>
                {d.titulo}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 32, width: L - 144 }}>
              <Qr src={d.qr} lado={story ? 200 : 150} />
              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>
                  Fotos liberadas!
                </div>
                <div style={{ display: "flex", fontSize: 30, opacity: 0.9 }}>{d.quando}</div>
                <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: c.destaque }}>
                  {d.link}
                </div>
              </div>
            </div>
          </div>
        </Tela>
      );
    }
    // 6. Foto inteira com degradê da cor subindo de baixo; texto e QR Code sobre o degradê.
    case "6":
      return (
        <Tela d={d} fundo={c.fundo}>
          <FundoInteiro
            d={d}
            veu={`linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, ${c.fundo}CC 62%, ${c.fundo} 88%)`}
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: L,
              height: A,
              padding: 72,
            }}
          >
            <Marca tamanho={48} destaque={c.destaque} />
            <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
              <Selo texto="FOTOS DISPONÍVEIS" fundo={c.destaque} cor="#0B0B0F" tamanho={32} />
              <Textos d={d} titulo={tituloGrande} />
              <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
                <Qr src={d.qr} lado={qr - 40} />
                <Chamada d={d} tamanho={38} link={c.destaque} />
              </div>
            </div>
          </div>
        </Tela>
      );
    // 7. Faixa de cor em cima com o título grande; foto embaixo; QR Code na divisa.
    case "7": {
      const foto = areaDaImagem("7", d.formato);
      const faixa = A - foto.altura;
      return (
        <Tela d={d} fundo={c.fundo}>
          <div style={{ display: "flex", flexDirection: "column", width: L, height: A }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: faixa,
                padding: 64,
                paddingRight: 340,
              }}
            >
              <Marca tamanho={44} destaque={c.destaque} />
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 32,
                    fontWeight: 800,
                    color: c.destaque,
                    letterSpacing: 1,
                  }}
                >
                  FOTOS LIBERADAS
                </div>
                <Textos d={d} titulo={story ? 74 : 58} />
              </div>
            </div>
            <Foto src={d.imagem} largura={foto.largura} altura={foto.altura} />
          </div>
          <div
            style={{
              position: "absolute",
              right: 64,
              top: faixa - (story ? 150 : 125),
              display: "flex",
            }}
          >
            <Qr src={d.qr} lado={story ? 260 : 210} />
          </div>
        </Tela>
      );
    }
    // 8. Minimalista: foto inteira, um selo pequeno em cima e uma tira branca embaixo.
    case "8":
      return (
        <Tela d={d} fundo={c.fundo}>
          <FundoInteiro
            d={d}
            veu="linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 25%)"
          />
          <div
            style={{
              position: "absolute",
              top: 64,
              left: 64,
              right: 64,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Marca tamanho={44} destaque={c.destaque} />
            <Selo texto="FOTOS NO AR" fundo={c.fundo} cor={BRANCO} tamanho={28} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              gap: 32,
              background: BRANCO,
              padding: "40px 64px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: story ? 52 : 44,
                  fontWeight: 800,
                  color: "#0B0B0F",
                  lineHeight: 1.05,
                }}
              >
                {d.titulo}
              </div>
              <div style={{ display: "flex", fontSize: 28, color: "#4B5563" }}>{d.quando}</div>
              <div
                style={{
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 800,
                  color: c.fundo === "#0B0B0F" ? "#2362FE" : c.fundo,
                }}
              >
                {d.link}
              </div>
            </div>
            <Qr src={d.qr} lado={story ? 170 : 140} borda={6} />
          </div>
        </Tela>
      );
    // Banner 1: foto inteira com véu, texto à esquerda, QR Code à direita.
    case "b1":
      return (
        <Tela d={d} fundo={c.fundo}>
          <FundoInteiro
            d={d}
            veu="linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 100%)"
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: L,
              height: A,
              padding: 56,
              gap: 40,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1 }}>
              <Marca tamanho={34} destaque={c.destaque} />
              <Selo texto="AS FOTOS CHEGARAM" fundo={c.destaque} cor="#0B0B0F" tamanho={22} />
              <Textos d={d} titulo={56} maxLargura={720} />
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
            >
              <Qr src={d.qr} lado={170} borda={10} />
              <div
                style={{
                  display: "flex",
                  maxWidth: 230,
                  fontSize: 16,
                  fontWeight: 800,
                  color: c.destaque,
                  textAlign: "center",
                }}
              >
                {d.link}
              </div>
            </div>
          </div>
        </Tela>
      );
    // Banner 2: foto à esquerda, bloco de cor à direita com o texto e o QR Code.
    case "b2": {
      const foto = areaDaImagem("b2", d.formato);
      return (
        <Tela d={d} fundo={c.fundo}>
          <Foto src={d.imagem} largura={foto.largura} altura={foto.altura} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              flex: 1,
              padding: 44,
            }}
          >
            <Marca tamanho={32} destaque={c.destaque} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 800,
                  color: c.destaque,
                  letterSpacing: 1,
                }}
              >
                FOTOS LIBERADAS
              </div>
              <Textos d={d} titulo={40} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Qr src={d.qr} lado={110} borda={8} />
              <div style={{ display: "flex", fontSize: 18, fontWeight: 800, color: c.destaque }}>
                {d.link}
              </div>
            </div>
          </div>
        </Tela>
      );
    }
    // Banner 3: fundo branco, texto à esquerda, foto arredondada à direita.
    case "b3": {
      const foto = areaDaImagem("b3", d.formato);
      return (
        <Tela d={d} fundo={BRANCO}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: L,
              height: A,
              padding: 48,
              gap: 44,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: A - 96,
                flex: 1,
              }}
            >
              <Marca
                tamanho={32}
                cor="#0B0B0F"
                destaque={c.fundo === "#0B0B0F" ? "#2362FE" : c.fundo}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 22,
                    fontWeight: 800,
                    color: c.fundo,
                    letterSpacing: 1,
                  }}
                >
                  FOTOS DISPONÍVEIS
                </div>
                <Textos d={d} titulo={44} cor="#0B0B0F" suave="#4B5563" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <Qr src={d.qr} lado={104} borda={6} />
                <div
                  style={{
                    display: "flex",
                    fontSize: 18,
                    fontWeight: 800,
                    color: c.fundo === "#0B0B0F" ? "#2362FE" : c.fundo,
                  }}
                >
                  {d.link}
                </div>
              </div>
            </div>
            <Foto src={d.imagem} largura={foto.largura} altura={foto.altura} raio={28} />
          </div>
        </Tela>
      );
    }
    // 1. Clássico: foto inteira com véu escuro, título em cima, QR Code embaixo.
    default:
      return (
        <Tela d={d} fundo={c.fundo}>
          <FundoInteiro
            d={d}
            veu="linear-gradient(180deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.85) 100%)"
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: L,
              height: A,
              padding: 72,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <Marca tamanho={52} destaque={c.destaque} />
              <Selo texto="As fotos chegaram!" fundo={c.destaque} cor="#0B0B0F" tamanho={36} />
              <Textos d={d} titulo={tituloGrande} maxLargura={940} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
              <Qr src={d.qr} lado={qr} />
              <Chamada d={d} tamanho={44} link={c.destaque} />
            </div>
          </div>
        </Tela>
      );
  }
}
