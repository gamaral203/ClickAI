// Conversão entre as linhas do banco (src/db/schema.ts) e os tipos do domínio (./tipos.ts). As
// datas viram texto ISO, como as telas já usam; campos internos (hash da senha do evento, chave
// do original no R2) não saem daqui.

import type * as t from "@/db/schema";
import { urlPublica } from "@/lib/url-publica";

import type {
  Colaborador,
  Cupom,
  Denuncia,
  Evento,
  FaixaDesconto,
  Foto,
  FotografoConta,
  ItemPedido,
  Lancamento,
  Loja,
  Mensagem,
  Pacote,
  Pasta,
  PedidoInterno,
  Saque,
  UsuarioInterno,
} from "./tipos";

/** Cópia do objeto sem as chaves informadas. */
export function omitir<T extends object, K extends keyof T>(obj: T, ...chaves: K[]): Omit<T, K> {
  const copia = { ...obj };
  for (const chave of chaves) delete copia[chave];
  return copia;
}

export function iso(data: Date): string;
export function iso(data: Date | null): string | null;
export function iso(data: Date | null) {
  return data ? data.toISOString() : null;
}

export function deIso(texto: string): Date;
export function deIso(texto: string | null): Date | null;
export function deIso(texto: string | null) {
  return texto ? new Date(texto) : null;
}

export function paraUsuario(r: typeof t.usuarios.$inferSelect): UsuarioInterno {
  return { ...r, emailConfirmadoEm: iso(r.emailConfirmadoEm), criadoEm: iso(r.criadoEm) };
}

export function paraFotografo(r: typeof t.fotografos.$inferSelect): FotografoConta {
  return { ...r };
}

export function paraEvento(r: typeof t.eventos.$inferSelect): Evento {
  const e = omitir(r, "senhaHash");
  return {
    ...e,
    inicioEm: iso(e.inicioEm),
    fimEm: iso(e.fimEm),
    liberadoEm: iso(e.liberadoEm),
  };
}

export function paraFoto(r: typeof t.fotos.$inferSelect): Foto {
  const f = omitir(r, "chaveOriginal", "tamanhoBytes", "hashConteudo");
  return {
    ...f,
    urlPrevia: urlPublica(f.urlPrevia),
    urlMiniatura: urlPublica(f.urlMiniatura),
    capturadaEm: iso(f.capturadaEm),
    criadoEm: iso(f.criadoEm),
    excluidaEm: iso(f.excluidaEm),
  };
}

export function paraPasta(r: typeof t.pastas.$inferSelect): Pasta {
  return { ...r };
}

export function paraColaborador(r: typeof t.colaboradores.$inferSelect): Colaborador {
  return { ...r };
}

export function paraCupom(r: typeof t.cupons.$inferSelect, eventoIds: string[]): Cupom {
  return { ...r, inicioEm: iso(r.inicioEm), expiraEm: iso(r.expiraEm), eventoIds };
}

export function paraFaixa(r: typeof t.faixasDesconto.$inferSelect): FaixaDesconto {
  return { ...r };
}

export function paraPacote(r: typeof t.pacotes.$inferSelect): Pacote {
  return { ...r, expiraEm: iso(r.expiraEm) };
}

export function paraPedido(r: typeof t.pedidos.$inferSelect): PedidoInterno {
  const { pixCopiaECola, pixQrCodeBase64, ...p } = r;
  return {
    ...p,
    acessoExpiraEm: iso(p.acessoExpiraEm),
    expiraEm: iso(p.expiraEm),
    pagoEm: iso(p.pagoEm),
    lembreteEnviadoEm: iso(p.lembreteEnviadoEm),
    criadoEm: iso(p.criadoEm),
    pix:
      pixCopiaECola && pixQrCodeBase64
        ? { copiaECola: pixCopiaECola, qrCodeBase64: pixQrCodeBase64 }
        : null,
  };
}

export function paraItem(r: typeof t.itensPedido.$inferSelect): ItemPedido {
  return { ...r };
}

export function paraLancamento(r: typeof t.lancamentos.$inferSelect): Lancamento {
  return { ...r, disponivelEm: iso(r.disponivelEm), antecipavelEm: iso(r.antecipavelEm) };
}

export function paraSaque(r: typeof t.saques.$inferSelect): Saque {
  return { ...r, criadoEm: iso(r.criadoEm), pagoEm: iso(r.pagoEm) };
}

export function paraLoja(r: typeof t.lojas.$inferSelect): Loja {
  return { ...r };
}

export function paraDenuncia(r: typeof t.denuncias.$inferSelect): Denuncia {
  return { ...r, criadoEm: iso(r.criadoEm) };
}

export function paraMensagem(r: typeof t.mensagens.$inferSelect): Mensagem {
  return { ...r, criadoEm: iso(r.criadoEm) };
}
