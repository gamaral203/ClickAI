// Pedidos pagos lembrados no próprio navegador (localStorage): quem comprou sem conta e fechou a
// página encontra as fotos de novo pela faixa "Você tem fotos compradas" ao voltar ao site. Guarda
// só o link do pedido (o mesmo do e-mail) e um resumo; nada vai para o servidor. Qualquer falha do
// armazenamento (aba anônima, bloqueado) só desliga a lembrança.

export type PedidoNoAparelho = {
  id: string;
  /** Link assinado da página do pedido (o mesmo do e-mail de entrega). */
  link: string;
  pagoEm: string;
  fotos: number;
  eventos: string[];
};

const CHAVE = "clicouai_pedidos";
const CHAVE_DISPENSA = "clicouai_pedidos_dispensa";
const MAXIMO = 10;
/** Fechar a faixa a esconde por 3 dias. */
const DISPENSA_MS = 3 * 24 * 60 * 60 * 1000;

function ler(): PedidoNoAparelho[] {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(valor)
      ? valor.filter((p) => p && typeof p.id === "string" && typeof p.link === "string")
      : [];
  } catch {
    return [];
  }
}

export function pedidosNoAparelho(): PedidoNoAparelho[] {
  return ler().sort((a, b) => b.pagoEm.localeCompare(a.pagoEm));
}

export function lembrarPedido(pedido: PedidoNoAparelho) {
  try {
    const outros = ler().filter((p) => p.id !== pedido.id);
    localStorage.setItem(CHAVE, JSON.stringify([pedido, ...outros].slice(0, MAXIMO)));
  } catch {
    // Sem armazenamento: só não lembra.
  }
}

export function esquecerPedidos() {
  try {
    localStorage.removeItem(CHAVE);
    localStorage.removeItem(CHAVE_DISPENSA);
  } catch {
    // Nada a fazer.
  }
}

export function faixaDispensada(agora = Date.now()) {
  try {
    return agora < Number(localStorage.getItem(CHAVE_DISPENSA) ?? 0);
  } catch {
    return false;
  }
}

export function dispensarFaixa(agora = Date.now()) {
  try {
    localStorage.setItem(CHAVE_DISPENSA, String(agora + DISPENSA_MS));
  } catch {
    // Nada a fazer.
  }
}
