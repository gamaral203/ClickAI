import { z } from "zod";

// Regra de senha nova, a mesma no cadastro e na troca de senha (/conta/seguranca).

export const TAMANHO_MINIMO_SENHA = 8;
export const TAMANHO_MAXIMO_SENHA = 200;

export const senhaNovaSchema = z
  .string(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
  .min(TAMANHO_MINIMO_SENHA, `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
  .max(TAMANHO_MAXIMO_SENHA, "Senha muito longa.");
