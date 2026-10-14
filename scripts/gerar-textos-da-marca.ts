// Gera os textos da marca d'água "Proteção forte" (src/servicos/imagens.ts) como PNG
// transparente em public/marca/. São imagens prontas porque o servidor da Vercel não tem fontes
// instaladas: um <text> no SVG sairia em quadradinhos. Usa uma fonte sem serifa em negrito do
// computador onde o script roda (o librsvg do sharp não carrega @font-face). Rodar de novo só se
// o texto mudar:
//   npx tsx scripts/gerar-textos-da-marca.ts

import path from "node:path";

import sharp from "sharp";

/** Texto branco com sombra escura (aparece em foto clara e escura); `caixa` põe uma borda. */
function svgDoTexto(texto: string, caixa: boolean) {
  const tamanho = 96;
  const largura = Math.round(texto.length * tamanho * 0.62) + (caixa ? 120 : 40);
  const altura = tamanho + (caixa ? 90 : 50);
  const estilo = `text{font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:${tamanho}px}`;
  const meio = altura / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
  <style>${estilo}</style>
  ${
    caixa
      ? `<rect x="9" y="9" width="${largura - 18}" height="${altura - 18}" rx="22" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="7" transform="translate(3,3)"/>
  <rect x="9" y="9" width="${largura - 18}" height="${altura - 18}" rx="22" fill="none" stroke="#fff" stroke-width="7"/>`
      : ""
  }
  <text x="50%" y="${meio}" dy="0.35em" text-anchor="middle" fill="#000" fill-opacity="0.4" transform="translate(4,4)">${texto}</text>
  <text x="50%" y="${meio}" dy="0.35em" text-anchor="middle" fill="#fff">${texto}</text>
</svg>`;
}

async function gerar(arquivo: string, texto: string, caixa: boolean) {
  const destino = path.join(process.cwd(), "public/marca", arquivo);
  await sharp(Buffer.from(svgDoTexto(texto, caixa)))
    .trim()
    .png()
    .toFile(destino);
  console.log(destino);
}

void (async () => {
  await gerar("foto-protegida.png", "Foto protegida", false);
  await gerar("nao-tire-print.png", "Não tire print", true);
})();
