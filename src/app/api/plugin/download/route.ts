import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { downloadZip } from "client-zip";

import { respostaDaManutencao } from "@/servicos/manutencao";

// Download do plugin do Lightroom Classic (plugin-lightroom/ClicouAi.lrplugin, docs/arquitetura.md,
// "Plugin do Lightroom"): um .zip com a pasta do plugin e o passo a passo. Os arquivos entram no
// pacote da função por `outputFileTracingIncludes` (next.config.ts). Público: o plugin não tem
// segredo nenhum; quem envia é a chave de acesso de cada fotógrafo.

const PASTA = path.join(process.cwd(), "plugin-lightroom");
const PLUGIN = "ClicouAi.lrplugin";

export async function GET(request: Request) {
  // Como o resto do site, fica fora do ar no modo de manutenção.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const nomes = (await readdir(path.join(PASTA, PLUGIN))).filter((n) => n.endsWith(".lua"));
  const arquivos = await Promise.all(
    nomes.map(async (nome) => ({
      name: `${PLUGIN}/${nome}`,
      input: await readFile(path.join(PASTA, PLUGIN, nome)),
    })),
  );
  arquivos.push({ name: "LEIA-ME.txt", input: await readFile(path.join(PASTA, "LEIA-ME.txt")) });
  const zip = downloadZip(arquivos);
  return new Response(zip.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="ClicouAi-Lightroom.zip"',
      "Cache-Control": "no-store",
    },
  });
}
