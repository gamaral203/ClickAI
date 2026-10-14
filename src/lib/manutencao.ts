import type { Usuario } from "@/dados/tipos";

// Regras puras do modo de manutenção (docs/arquitetura.md, "Modo de manutenção"). Quem decide se
// a manutenção está ligada é o banco (src/dados/manutencao.ts); aqui fica quem passa e por onde.

/** Resposta das ações e rotas recusadas durante a manutenção. */
export const MENSAGEM_MANUTENCAO = "Estamos em manutenção, tente em alguns minutos.";

/** Segundos sugeridos no `Retry-After` das rotas recusadas. */
export const ESPERA_MANUTENCAO_S = 300;

/**
 * Com a manutenção ligada, só o gestor (`admin`) com sessão válida usa o site. Visitante,
 * cliente, fotógrafo e gestor deslogado veem a tela de manutenção.
 */
export function bloqueiaNaManutencao(
  ativa: boolean,
  usuario: Pick<Usuario, "papel"> | null,
): boolean {
  return ativa && usuario?.papel !== "admin";
}

/** Páginas sempre abertas: o login, para o gestor conseguir entrar (e com ele o código). */
const PAGINAS_ABERTAS = new Set([
  "/entrar",
  "/entrar/codigo",
  "/entrar/esqueci-senha",
  "/entrar/nova-senha",
]);

/**
 * Prefixos sempre abertos: a gestão (só gestor entra, de qualquer forma), o login com o Google,
 * os webhooks de pagamento (a confirmação dos pedidos não pode parar) e os jobs do cron
 * (protegidos pelo CRON_SECRET).
 */
const PREFIXOS_ABERTOS = ["/admin", "/api/auth", "/api/webhooks", "/api/jobs", "/_next"];

/**
 * O caminho continua funcionando com a manutenção ligada, para qualquer pessoa? Além das listas
 * acima, os arquivos estáticos e ícones (caminho com extensão, como /logo.png e /icon.png).
 *
 * Nas rotas de API, `respostaDaManutencao` (src/servicos/manutencao.ts) consulta esta lista. As
 * páginas seguem a mesma lista pela estrutura: as abertas ficam em grupos sem o portão
 * ((acesso) e (admin)); o teste src/lib/manutencao.test.ts confere página por página.
 */
export function caminhoLiberadoNaManutencao(caminho: string): boolean {
  const limpo = caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho;
  if (PAGINAS_ABERTAS.has(limpo)) return true;
  if (PREFIXOS_ABERTOS.some((p) => limpo === p || limpo.startsWith(`${p}/`))) return true;
  const ultimo = limpo.slice(limpo.lastIndexOf("/") + 1);
  return /\.[a-z0-9]{2,5}$/i.test(ultimo) && !limpo.startsWith("/api/");
}
