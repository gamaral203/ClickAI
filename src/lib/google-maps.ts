// Carrega o Maps JavaScript API no navegador, uma vez só e só quando alguém pede o mapa (abrir
// "Escolher no mapa" ou rolar até o mapa do evento). Faz o mesmo que o carregador oficial do
// Google (o "bootstrap" que cria `google.maps.importLibrary`), escrito aqui para pôr o nonce da
// CSP no <script>: sem o nonce, a CSP bloqueia o script; com ele, o Maps repassa o nonce aos
// scripts que injeta depois. Nenhum pacote a mais.

declare global {
  interface Window {
    /** O Google chama quando a chave é recusada (inválida, sem a API ativa ou fora do domínio). */
    gm_authFailure?: () => void;
    __clicouaiMapaPronto?: () => void;
  }
}

const TEMPO_LIMITE_MS = 20_000;

let carregamento: Promise<void> | null = null;
let chaveRecusada = false;
const avisosDeFalha = new Set<() => void>();

/**
 * Avisa quando o Google recusar a chave. Isso pode acontecer depois do script carregar (o mapa
 * fica cinza com "Ops! Algo deu errado"), então a tela troca o mapa pela mensagem de erro.
 */
export function aoRecusarChave(aviso: () => void): () => void {
  if (chaveRecusada) aviso();
  avisosDeFalha.add(aviso);
  return () => avisosDeFalha.delete(aviso);
}

export function carregarGoogleMaps({
  chave,
  nonce,
}: {
  chave: string;
  nonce: string | null;
}): Promise<void> {
  if (chaveRecusada) return Promise.reject(new Error("Chave do Google Maps recusada."));
  if (typeof google !== "undefined" && typeof google.maps?.importLibrary === "function") {
    return Promise.resolve();
  }
  carregamento ??= new Promise<void>((resolve, reject) => {
    const desistir = (motivo: string) => {
      carregamento = null;
      reject(new Error(motivo));
    };
    const limite = window.setTimeout(
      () => desistir("O Google Maps demorou demais para carregar."),
      TEMPO_LIMITE_MS,
    );
    window.__clicouaiMapaPronto = () => {
      window.clearTimeout(limite);
      resolve();
    };
    window.gm_authFailure = () => {
      chaveRecusada = true;
      avisosDeFalha.forEach((aviso) => aviso());
    };

    const parametros = new URLSearchParams({
      key: chave,
      v: "weekly",
      language: "pt-BR",
      region: "BR",
      loading: "async",
      callback: "__clicouaiMapaPronto",
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${parametros}`;
    script.async = true;
    if (nonce) script.nonce = nonce;
    script.onerror = () => {
      window.clearTimeout(limite);
      script.remove();
      desistir("Não foi possível carregar o Google Maps.");
    };
    document.head.append(script);
  });
  return carregamento;
}

/** Ponto do Maps (LatLng ou literal) como números. */
export function latLngDe(
  ponto: google.maps.LatLng | google.maps.LatLngLiteral | google.maps.LatLngAltitudeLiteral,
): { lat: number; lng: number } {
  return typeof ponto.lat === "function"
    ? { lat: (ponto as google.maps.LatLng).lat(), lng: (ponto as google.maps.LatLng).lng() }
    : { lat: ponto.lat as number, lng: ponto.lng as number };
}
