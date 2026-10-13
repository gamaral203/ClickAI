// Cria no Cloudflare Stream o perfil de marca d'água dos vídeos (uma vez só) e mostra o id para
// guardar em CLOUDFLARE_STREAM_MARCA. Uso:
//   CLOUDFLARE_STREAM_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run stream:marca [url-da-imagem]
// Sem a URL, usa o logo claro do site (public/logo-clara.png), que lê bem sobre vídeo.

import { criarPerfilDeMarca } from "../src/lib/stream";

const url = process.argv[2] ?? "https://www.clicouai.com/logo-clara.png";

criarPerfilDeMarca(url)
  .then(({ uid }) => {
    console.log(`Perfil criado. Guarde na Vercel: CLOUDFLARE_STREAM_MARCA=${uid}`);
  })
  .catch((erro) => {
    console.error("Não foi possível criar o perfil:", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
