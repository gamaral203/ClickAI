// Gera as prévias e miniaturas de exemplo com a marca d'água gravada, usando a mesma função
// do processamento real (src/servicos/imagens.ts).
//
// Uso: npm run exemplos:gerar
//
// Baixa fotos do picsum.photos (licença Unsplash, uso livre) como se fossem os originais
// enviados pelo fotógrafo e grava em public/exemplo/. Só precisa rodar de novo se a marca
// d'água ou a quantidade de fotos de exemplo mudar.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { gerarMiniatura, gerarPrevia } from "../src/servicos/imagens";

/** Fotos diferentes; os eventos de exemplo reaproveitam estas em ciclo. */
const QUANTIDADE = 24;

const raiz = process.cwd();
const pastaPrevias = path.join(raiz, "public", "exemplo", "previas");
const pastaMiniaturas = path.join(raiz, "public", "exemplo", "miniaturas");
const arquivoManifesto = path.join(raiz, "src", "dados", "exemplo", "imagens.json");

async function baixar(indice: number) {
  // Uma em cada quatro vertical, como nos eventos de exemplo. 2400 px simula o JPEG original.
  const vertical = indice % 4 === 3;
  const [largura, altura] = vertical ? [1600, 2400] : [2400, 1600];
  const url = `https://picsum.photos/seed/clicouai-exemplo-${indice}/${largura}/${altura}.jpg`;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao baixar ${url}: ${resposta.status}`);
  return Buffer.from(await resposta.arrayBuffer());
}

async function main() {
  await Promise.all([
    mkdir(pastaPrevias, { recursive: true }),
    mkdir(pastaMiniaturas, { recursive: true }),
  ]);

  const manifesto: { largura: number; altura: number }[] = [];
  for (let i = 0; i < QUANTIDADE; i++) {
    const original = await baixar(i);
    const [previa, miniatura] = await Promise.all([
      gerarPrevia(original),
      gerarMiniatura(original),
    ]);
    await Promise.all([
      writeFile(path.join(pastaPrevias, `${i}.webp`), previa.buffer),
      writeFile(path.join(pastaMiniaturas, `${i}.webp`), miniatura.buffer),
    ]);
    manifesto.push({ largura: previa.largura, altura: previa.altura });
    console.log(
      `${i + 1}/${QUANTIDADE}  prévia ${previa.largura}×${previa.altura} ${Math.round(previa.buffer.length / 1024)} KB` +
        `  miniatura ${Math.round(miniatura.buffer.length / 1024)} KB`,
    );
  }

  await writeFile(arquivoManifesto, JSON.stringify(manifesto, null, 2) + "\n");
  console.log(`Manifesto salvo em ${path.relative(raiz, arquivoManifesto)}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
