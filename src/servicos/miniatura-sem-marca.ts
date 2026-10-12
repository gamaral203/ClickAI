import "server-only";

import { z } from "zod";

import { originalDoAutor, type Usuario } from "@/dados";
import { emProducao } from "@/db/conexao";
import { lerOriginal, r2Configurado } from "@/lib/r2";

import { abrirOriginal } from "./imagens";
import { limiteAtingido } from "./limites";
import { contaDoPainel } from "./sessao";

// Miniatura SEM marca d'água de uma foto, só para o AUTOR dela (docs/CLAUDE.md, exceção do
// autor): é como as fotos vendidas aparecem em Meus clientes, no painel. Gerada na hora a partir
// do original (o bucket público só tem as versões com marca) e entregue pela rota
// /api/painel/sem-marca/[fotoId], que o navegador guarda só para ele (cache privado).
//
// Conferido a cada pedido: sessão, conta de fotógrafo, autoria (`fotos.enviada_por`, foto pronta;
// excluída também vale) e um limite por usuário. Sem a liberação do app autenticador, por ser
// miniatura (LADO_SEM_MARCA): o arquivo original continua só pelo "Baixar", com a liberação.

/** Lado menor da miniatura, em pixels (como a miniatura pública, que tem 400 de largura). */
export const LADO_SEM_MARCA = 400;

export type ResultadoSemMarca =
  | { ok: true; imagem: Buffer }
  | { ok: false; motivo: "nao_encontrado" | "limite" | "indisponivel" };

export async function miniaturaSemMarca(
  usuario: Usuario | null,
  fotoId: unknown,
): Promise<ResultadoSemMarca> {
  const id = z.uuid().safeParse(fotoId);
  if (!usuario || !id.success) return { ok: false, motivo: "nao_encontrado" };
  const conta = await contaDoPainel(usuario);
  if (!conta) return { ok: false, motivo: "nao_encontrado" };
  const foto = await originalDoAutor(id.data, conta.id);
  if (!foto) return { ok: false, motivo: "nao_encontrado" };
  if (await limiteAtingido("sem_marca_usuario", usuario.id)) {
    return { ok: false, motivo: "limite" };
  }

  let original: Buffer | null = null;
  try {
    original = await lerArquivo(foto.chave);
  } catch (erro) {
    console.error("[sem-marca] falha ao ler o original", { foto: foto.id }, erro);
  }
  if (!original) return { ok: false, motivo: "indisponivel" };
  try {
    const imagem = await abrirOriginal(original)
      .rotate()
      .resize({
        width: LADO_SEM_MARCA,
        height: LADO_SEM_MARCA,
        fit: "outside",
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer();
    return { ok: true, imagem };
  } catch {
    // Vídeo ou arquivo que o Sharp não abre: a tela mostra a miniatura pública no lugar.
    return { ok: false, motivo: "indisponivel" };
  }
}

async function lerArquivo(chave: string): Promise<Buffer | null> {
  if (chave.startsWith("originais/")) return r2Configurado() ? lerOriginal(chave) : null;
  // Dados de exemplo (só fora da produção): o original é uma imagem pública de exemplo.
  if (/^https:\/\//.test(chave) && !emProducao()) {
    const resposta = await fetch(chave);
    return resposta.ok ? Buffer.from(await resposta.arrayBuffer()) : null;
  }
  return null;
}
