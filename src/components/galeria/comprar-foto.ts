"use client";

import { adicionarAoCarrinho } from "@/components/carrinho/carrinho";
import { enviarMetrica } from "@/components/metricas/registrar";

/**
 * "Comprar foto" do visualizador: o mesmo que o "Adicionar ao carrinho" da página da foto
 * (`BotaoAdicionar`). Só põe o id no carrinho do navegador; preço e desconto saem do servidor no
 * carrinho e no checkout, que não mudam.
 */
export function comprarFoto(fotoId: string) {
  adicionarAoCarrinho(fotoId);
  enviarMetrica({ tipo: "carrinho", fotoId });
}
