// Comparação visual da marca d'água (docs/riscos.md, "Marca d'água removida com ferramentas de
// IA"). Gera as prévias com várias configurações e modelos, com o mesmo código do processamento
// real (src/servicos/imagens.ts), e grava tudo numa pasta temporária FORA do repositório, com um
// index.html para comparar lado a lado e um resumo.json com tamanhos e tempos.
//
// Uso: npm run marcas:comparar [-- --saida <pasta fora do repositório>]
//
// Fotos de entrada: as fotos da página inicial que já estão no repositório (public/inicio/) e
// imagens sintéticas geradas aqui (nada é baixado da internet). O tempo de CPU por foto é medido
// com um "original" sintético de 24 MP (6000 × 4000), como o de uma câmera de evento.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";

import { MODELOS_MARCA, type ModeloMarca } from "../src/lib/marca-dagua";
import { CONFIG_MARCA_PADRAO, type ConfigMarca } from "../src/lib/protecao-previas";
import { gerarVersoes } from "../src/servicos/imagens";

const raiz = process.cwd();

function pastaDeSaida() {
  const i = process.argv.indexOf("--saida");
  const escolhida = i > 0 ? process.argv[i + 1] : undefined;
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const pasta = path.resolve(escolhida ?? path.join(tmpdir(), "clicouai-marcas", carimbo));
  const relativa = path.relative(raiz, pasta);
  if (!relativa.startsWith("..") && !path.isAbsolute(relativa)) {
    throw new Error(`A pasta de saída precisa ficar fora do repositório: ${pasta}`);
  }
  return pasta;
}

/** Imagens sintéticas: pessoa estilizada, cena com textura fina e fundo liso. */
async function sinteticas(): Promise<{ nome: string; buffer: Buffer }[]> {
  const pessoa =
    `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600">` +
    `<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc3ff"/><stop offset="1" stop-color="#e9d8b0"/></linearGradient></defs>` +
    `<rect width="2400" height="1600" fill="url(#c)"/>` +
    `<rect y="1150" width="2400" height="450" fill="#6b8f3a"/>` +
    `<ellipse cx="1200" cy="520" rx="150" ry="185" fill="#c98e6b"/>` +
    `<rect x="980" y="700" width="440" height="560" rx="120" fill="#ffd400"/>` +
    `<rect x="1040" y="1240" width="140" height="360" fill="#1d3a8a"/><rect x="1220" y="1240" width="140" height="360" fill="#1d3a8a"/>` +
    `<text x="1200" y="1000" font-size="150" text-anchor="middle" fill="#111" font-family="sans-serif">327</text>` +
    `</svg>`;
  const textura = await sharp({
    create: {
      width: 2400,
      height: 1600,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .blur(1.2)
    .jpeg({ quality: 92 })
    .toBuffer();
  const liso = await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 40, g: 46, b: 60 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  return [
    {
      nome: "sintetica-pessoa",
      buffer: await sharp(Buffer.from(pessoa)).jpeg({ quality: 92 }).toBuffer(),
    },
    { nome: "sintetica-textura", buffer: textura },
    { nome: "sintetica-lisa", buffer: liso },
  ];
}

type Caso = { id: string; titulo: string; modelo: ModeloMarca; config: ConfigMarca };

const P = CONFIG_MARCA_PADRAO;
const CASOS: Caso[] = [
  { id: "padrao", titulo: "Padrão (configuração inicial)", modelo: "padrao", config: P },
  {
    id: "sem-variacao",
    titulo: "Sem variação por foto (todas iguais)",
    modelo: "padrao",
    config: { ...P, variacao: false },
  },
  {
    id: "minimo",
    titulo: "Pisos: opacidade 25%, 8 marcas, tamanho 60%",
    modelo: "padrao",
    config: { ...P, opacidadePct: 25, quantidade: 8, tamanhoPct: 60 },
  },
  {
    id: "denso",
    titulo: "Denso: 32 marcas, opacidade 50%",
    modelo: "padrao",
    config: { ...P, quantidade: 32, opacidadePct: 50 },
  },
  {
    id: "grande",
    titulo: "Logos grandes: tamanho 150%",
    modelo: "padrao",
    config: { ...P, tamanhoPct: 150 },
  },
  {
    id: "economica",
    titulo: "Prévia 1200 px, qualidade 60",
    modelo: "padrao",
    config: { ...P, larguraPrevia: 1200, qualidade: 60 },
  },
  ...MODELOS_MARCA.filter((m) => m !== "padrao").map((m) => ({
    id: `modelo-${m}`,
    titulo: `Modelo do fotógrafo: ${m}`,
    modelo: m,
    config: P,
  })),
];

/** Ids de foto de exemplo: o mesmo arquivo com ids diferentes mostra a variação por foto. */
const IDS = [
  "6f1d2c3a-0000-4000-8000-000000000001",
  "6f1d2c3a-0000-4000-8000-000000000002",
  "6f1d2c3a-0000-4000-8000-000000000003",
];

async function medirCpu(saida: string) {
  // "Original" de 24 MP com ruído (decodificar custa como uma foto de verdade).
  const original = await sharp({
    create: {
      width: 6000,
      height: 4000,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: "gaussian", mean: 128, sigma: 50 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  sharp.concurrency(1);
  const amostras: { msParede: number; msCpu: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const cpu0 = process.cpuUsage();
    const t0 = performance.now();
    await gerarVersoes(original, "padrao", { semente: `cpu-${i}`, config: P });
    const cpu = process.cpuUsage(cpu0);
    // A primeira aquece os caches (logo, textos): fica fora da média.
    if (i > 0) {
      amostras.push({ msParede: performance.now() - t0, msCpu: (cpu.user + cpu.system) / 1000 });
    }
  }
  sharp.concurrency(0);
  const media = (k: "msParede" | "msCpu") =>
    Math.round(amostras.reduce((s, a) => s + a[k], 0) / amostras.length);
  const resultado = {
    original: "JPEG sintético 6000 × 4000 (24 MP), 1 thread do libvips",
    tamanhoOriginalMb: +(original.length / 1e6).toFixed(1),
    msParedePorFoto: media("msParede"),
    msCpuPorFoto: media("msCpu"),
  };
  await writeFile(path.join(saida, "cpu.json"), JSON.stringify(resultado, null, 2));
  return resultado;
}

async function main() {
  const saida = pastaDeSaida();
  await mkdir(saida, { recursive: true });

  const pastaInicio = path.join(raiz, "public", "inicio");
  const fotos = [
    ...(await Promise.all(
      (await readdir(pastaInicio))
        .filter((f) => f.endsWith(".webp"))
        .map(async (f) => ({
          nome: f.replace(/\.webp$/, ""),
          buffer: await readFile(path.join(pastaInicio, f)),
        })),
    )),
    ...(await sinteticas()),
  ];

  const linhas: string[] = [];
  const resumo: Record<string, unknown>[] = [];
  for (const caso of CASOS) {
    const celulas: string[] = [];
    for (const [i, foto] of fotos.entries()) {
      const id = IDS[i % IDS.length];
      const t0 = performance.now();
      const v = await gerarVersoes(foto.buffer, caso.modelo, { semente: id, config: caso.config });
      const ms = Math.round(performance.now() - t0);
      const base = `${caso.id}__${foto.nome}`;
      await Promise.all([
        writeFile(path.join(saida, `${base}.webp`), v.previa.buffer),
        writeFile(path.join(saida, `${base}-celular.webp`), v.previaCelular.buffer),
        writeFile(path.join(saida, `${base}-miniatura.webp`), v.miniatura.buffer),
      ]);
      resumo.push({
        caso: caso.id,
        foto: foto.nome,
        previa: `${v.previa.largura}x${v.previa.altura}`,
        previaKb: Math.round(v.previa.buffer.length / 1024),
        celularKb: Math.round(v.previaCelular.buffer.length / 1024),
        miniaturaKb: Math.round(v.miniatura.buffer.length / 1024),
        ms,
      });
      celulas.push(
        `<figure><a href="${base}.webp"><img src="${base}.webp" loading="lazy" alt=""></a>` +
          `<figcaption>${foto.nome} · ${Math.round(v.previa.buffer.length / 1024)} KB</figcaption></figure>`,
      );
    }
    linhas.push(`<h2>${caso.titulo}</h2><div class="grade">${celulas.join("")}</div>`);
  }

  // A mesma foto com três ids: o desenho muda de uma foto para outra.
  const pessoa = fotos.find((f) => f.nome === "sintetica-pessoa")!;
  const variacao: string[] = [];
  for (const id of IDS) {
    const v = await gerarVersoes(pessoa.buffer, "padrao", { semente: id, config: P });
    const nome = `variacao__${id.slice(-4)}.webp`;
    await writeFile(path.join(saida, nome), v.previa.buffer);
    variacao.push(
      `<figure><img src="${nome}" alt=""><figcaption>id …${id.slice(-4)}</figcaption></figure>`,
    );
  }
  linhas.unshift(
    `<h2>Mesma foto, ids diferentes (variação por foto)</h2><div class="grade">${variacao.join("")}</div>`,
  );

  const cpu = await medirCpu(saida);
  await writeFile(
    path.join(saida, "resumo.json"),
    JSON.stringify({ cpu, versoes: resumo }, null, 2),
  );
  await writeFile(
    path.join(saida, "index.html"),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Comparação das marcas</title><style>body{font-family:system-ui,sans-serif;margin:16px;background:#f4f6fb;color:#061a42}` +
      `.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}` +
      `figure{margin:0}img{width:100%;height:auto;border-radius:6px;display:block}figcaption{font-size:12px;margin-top:4px}</style>` +
      `<h1>Comparação das marcas d'água</h1><p>CPU por foto (24 MP, 1 thread): ${cpu.msCpuPorFoto} ms; tempo: ${cpu.msParedePorFoto} ms.</p>` +
      linhas.join(""),
  );
  console.log(`Pronto: ${path.join(saida, "index.html")}`);
  console.log(
    `CPU por foto (24 MP, 1 thread): ${cpu.msCpuPorFoto} ms; tempo: ${cpu.msParedePorFoto} ms`,
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
