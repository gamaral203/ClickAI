import { z } from "zod";

/** Tokens dos pacotes e código do cupom vindos do navegador, como o carrinho e o checkout aceitam. */
export const opcoesCompra = z.object({
  pacotes: z.array(z.string().max(20_000)).max(20).optional(),
  cupom: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
});
