// "Banco" de exemplo: as coleções de ./dados compartilhadas no processo, para que cadastros e
// edições feitos em tempo de execução apareçam em todas as rotas. Some ao reiniciar o servidor;
// na Fase 11 é trocado pelo PostgreSQL.

import { compartilhado } from "./compartilhado";
import * as iniciais from "./dados";

const banco = compartilhado("dados-exemplo", () => ({
  fotografos: iniciais.fotografos,
  categorias: iniciais.categorias,
  eventos: iniciais.eventos,
  senhasEventos: iniciais.senhasEventos,
  pastas: iniciais.pastas,
  colaboradores: iniciais.colaboradores,
  fotos: iniciais.fotos,
  numeros: iniciais.numeros,
  faixasDesconto: iniciais.faixasDesconto,
  pacotes: iniciais.pacotes,
  cupons: iniciais.cupons,
  lojas: iniciais.lojas,
}));

export const {
  fotografos,
  categorias,
  eventos,
  senhasEventos,
  pastas,
  colaboradores,
  fotos,
  numeros,
  faixasDesconto,
  pacotes,
  cupons,
  lojas,
} = banco;

// Chave própria: um servidor de desenvolvimento já rodando ganha os rostos sem reiniciar.
export const rostos = compartilhado("rostos-exemplo", () => iniciais.rostos);

/**
 * Acessos liberados pela senha do evento. Chave: hash do token do cookie. Guarda o hash da
 * senha da época: se o fotógrafo trocar a senha, os acessos antigos deixam de valer.
 */
export const acessosEvento = compartilhado(
  "acessos-evento",
  () => new Map<string, { eventoId: string; senhaHash: string; expiraEm: number }>(),
);

export { urlOriginalDeExemplo } from "./dados";
