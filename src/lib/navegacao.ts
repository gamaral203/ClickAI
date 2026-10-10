import type { Papel, Usuario } from "@/dados/tipos";

// Navegação por papel (docs/arquitetura.md, "Login e papéis"). Funções puras: o cabeçalho, o
// rodapé, as páginas da vitrine e o checkout decidem por aqui, num ponto só.
//
// Visitante e cliente veem o site de compra (cabeçalho com Início, Eventos e carrinho). Fotógrafo
// e gestor veem o cabeçalho do painel: atalhos de trabalho, sem carrinho nem vitrine, porque
// conta de fotógrafo não compra fotos (a regra vale no servidor, em `podeComprar`).

export type ItemNavegacao = {
  href: string;
  rotulo: string;
  /** Marcado só no endereço exato (o início de uma área, como /painel). */
  exato?: boolean;
};

export type Navegacao = {
  variante: "publico" | "painel";
  /** Links do cabeçalho no computador. */
  desktop: ItemNavegacao[];
  /** Links do menu do celular (o "Sair" fica fora: é um formulário). */
  celular: ItemNavegacao[];
  /** Link com o nome da pessoa (Minhas compras ou Perfil), ou `null` para o visitante. */
  perfil: ItemNavegacao | null;
  /** Mostra o carrinho no cabeçalho. */
  carrinho: boolean;
  /** Mostra o selo da meta de vendas (só o fotógrafo: a conta de gestão não tem meta). */
  meta: boolean;
  /** Rodapé completo do site ou o curto do painel. */
  rodape: "completo" | "curto";
};

type UsuarioNavegacao = Pick<Usuario, "papel" | "nome"> | null;

/** Para onde mandar cada papel depois do login, quando não há um ?proximo=. */
export function inicioDoPapel(papel: Papel) {
  if (papel === "admin") return "/admin";
  if (papel === "fotografo") return "/painel";
  return "/minhas-compras";
}

/** Conta que usa o cabeçalho do painel: fotógrafo e gestor (o gestor também vende). */
export function usaPainel(usuario: Pick<Usuario, "papel"> | null): boolean {
  return usuario?.papel === "fotografo" || usuario?.papel === "admin";
}

/**
 * Quem pode comprar fotos: o convidado (`null`) e o cliente. Conta de fotógrafo ou de gestor
 * não compra; para comprar, a pessoa sai da conta ou usa uma conta de cliente.
 */
export function podeComprar(usuario: Pick<Usuario, "papel"> | null): boolean {
  return !usaPainel(usuario);
}

/**
 * Destino do logo. No painel, o início do painel; o gestor, dentro da gestão (/admin/*), volta
 * para a visão geral da gestão.
 */
export function destinoDoLogo(papel: Papel | null, caminho: string | null): string {
  if (papel === "admin" && (caminho === "/admin" || caminho?.startsWith("/admin/"))) {
    return "/admin";
  }
  if (papel === "fotografo" || papel === "admin") return "/painel";
  return "/";
}

/**
 * O link aponta para a página atual (ou para uma seção dela)? Com `exato`, só a própria página:
 * o "Início" do painel não fica marcado em /painel/eventos.
 */
export function linkAtivo(caminho: string | null, href: string, exato = false): boolean {
  if (!caminho) return false;
  if (caminho === href) return true;
  return !exato && caminho.startsWith(`${href}/`);
}

const PUBLICO: ItemNavegacao[] = [
  { href: "/", rotulo: "Início" },
  { href: "/eventos", rotulo: "Eventos" },
];

const ATALHOS_PAINEL: ItemNavegacao[] = [
  { href: "/painel", rotulo: "Início", exato: true },
  { href: "/painel/eventos", rotulo: "Meus eventos" },
  { href: "/painel/vendas", rotulo: "Financeiro" },
  { href: "/painel/desempenho", rotulo: "Desempenho" },
  { href: "/painel/loja", rotulo: "Minha loja" },
];

const GESTAO: ItemNavegacao = { href: "/admin", rotulo: "Gestão" };
const METAS: ItemNavegacao = { href: "/painel/metas", rotulo: "Metas" };
const PERFIL_PAINEL: ItemNavegacao = { href: "/painel/perfil", rotulo: "Perfil e recebimento" };
const SEGURANCA: ItemNavegacao = { href: "/conta/seguranca", rotulo: "Senha e segurança" };
const AJUDA: ItemNavegacao = { href: "/ajuda", rotulo: "Ajuda" };

/** Links do cabeçalho (e o rodapé) para quem está na página: visitante, cliente ou quem vende. */
export function linksDoCabecalho(usuario: UsuarioNavegacao): Navegacao {
  if (!usuario) {
    return {
      variante: "publico",
      desktop: PUBLICO,
      celular: [
        ...PUBLICO,
        { href: "/entrar", rotulo: "Entrar" },
        { href: "/cadastro", rotulo: "Criar conta" },
        { href: "/cadastro?tipo=fotografo", rotulo: "Quero vender minhas fotos" },
        AJUDA,
      ],
      perfil: null,
      carrinho: true,
      meta: false,
      rodape: "completo",
    };
  }

  if (usaPainel(usuario)) {
    const atalhos = usuario.papel === "admin" ? [...ATALHOS_PAINEL, GESTAO] : ATALHOS_PAINEL;
    return {
      variante: "painel",
      desktop: atalhos,
      celular: [...atalhos, METAS, PERFIL_PAINEL, SEGURANCA, AJUDA],
      perfil: PERFIL_PAINEL,
      carrinho: false,
      meta: usuario.papel === "fotografo",
      rodape: "curto",
    };
  }

  const compras: ItemNavegacao = { href: "/minhas-compras", rotulo: "Minhas compras" };
  return {
    variante: "publico",
    desktop: PUBLICO,
    celular: [...PUBLICO, compras, SEGURANCA, AJUDA],
    perfil: compras,
    carrinho: true,
    meta: false,
    rodape: "completo",
  };
}

/**
 * A vitrine (início e lista de eventos) é para quem compra. Fotógrafo e gestor logados vão para o
 * painel; `null` para quem fica na página. As páginas de um evento, de uma foto, de um fotógrafo
 * e as lojas continuam abertas para eles, para verem o que o cliente vê.
 */
export function destinoDaVitrine(
  usuario: Pick<Usuario, "papel"> | null,
  pagina: "/" | "/eventos",
): string | null {
  if (!usuario || !usaPainel(usuario)) return null;
  if (pagina === "/eventos") return "/painel/eventos";
  return usuario.papel === "admin" ? "/admin" : "/painel";
}
