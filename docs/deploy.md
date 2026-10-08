# Deploy e contas

Passo a passo para colocar o ClicouAí no ar. O código já está pronto para estas configurações; o que falta é criar as contas e preencher as variáveis de ambiente. Todas as variáveis estão explicadas em [`.env.example`](../.env.example).

## 1. Contas

| Serviço | Para quê | Quando é preciso | Atenção |
|---|---|---|---|
| Vercel | Hospedar o site | Agora | Funções na região `gru1` (São Paulo), já em `vercel.json` |
| Sentry | Avisar de erros | Agora | Plano gratuito basta no começo |
| Mercado Pago | Pix, cartão e saque | Agora (credenciais de teste) | Saque em produção só com a chave pública cadastrada no Mercado Pago e `MP_PAYOUTS_HABILITADO=1` (item 3) |
| Google Cloud | Login com Google | Agora | Tela de consentimento OAuth publicada |
| Banco (Supabase) | Dados | Agora | Pelo Marketplace da Vercel (Storage → Supabase), região São Paulo; cria `POSTGRES_URL` (pooler) e `POSTGRES_URL_NON_POOLING` (direta) no projeto. O plano gratuito pausa o projeto depois de 7 dias sem uso. O build roda as migrações (`npm run db:migrar`); num banco vazio, a produção grava só as categorias (ver item 3) |
| Cloudflare R2 | Fotos (e vídeos, depois) | Agora, para enviar fotos | Dois buckets: público (prévias) e privado (originais). Passo a passo no item 7 |
| AWS | Reconhecimento facial (Rekognition) | Fase 12 | Usuário IAM só com as permissões do `.env.example` |
| WhatsApp (Meta ou parceiro) | Entrega pelo WhatsApp | Fase 13 | Decisão em aberto |

## 2. Primeiro deploy na Vercel

1. Em vercel.com, **Add New → Project** e importe o repositório do GitHub. O framework (Next.js) é detectado sozinho.
2. Em **Settings → Environment Variables**, cadastre as variáveis do item 3 para *Production* (e as de teste para *Preview*).
3. Faça o deploy. A região `gru1` vem do `vercel.json`; confira em **Settings → Functions** que aparece *São Paulo (gru1)*.

## 3. Variáveis obrigatórias em produção

| Variável | O que é |
|---|---|
| `DATABASE_URL` ou `POSTGRES_URL` | Banco (a integração do Supabase cria `POSTGRES_URL`). Sem ela, o build de produção falha de propósito: o banco em memória seria um por servidor e os pedidos Pix sumiriam |
| `APP_URL` | Endereço do site, ex. `https://clicouai.com.br`. Usado nos links, no QR Code, no login com Google e nas lojas |
| `APP_SECRET` | Segredo de 32+ caracteres que assina os pacotes e os links das mensagens. Sem ele, o site não gera esses links |
| `CRON_SECRET` | Protege `/api/jobs/pedidos` |
| `MP_ACCESS_TOKEN`, `NEXT_PUBLIC_MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `MP_AMBIENTE` | Mercado Pago |
| `MP_PAYOUTS_PRIVATE_KEY`, `MP_PAYOUTS_HABILITADO` | Saque real pelo Payouts (ver "Saque em produção" abaixo). Sem as duas, o saque em produção é recusado sem chamar a API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS` | Login com Google e quem entra como gestor |
| `GESTORES` | Contas de gestor da equipe com e-mail e senha (só o hash, gerado por `npm run senha:hash`). Em produção, a conta de exemplo de gestor não existe |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Erros no Sentry |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Envio dos source maps no build (opcional, mas ajuda a ler os erros) |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Domínio próprio das lojas |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Busca por selfie (Amazon Rekognition). Sem elas, a busca responde "indisponível" em produção. O usuário IAM precisa de `rekognition:CreateCollection`, `IndexFaces` e `SearchFacesByImage`. Opcional: `REKOGNITION_SEMELHANCA` (padrão 90) |
| `RESEND_API_KEY`, `EMAIL_REMETENTE` | E-mails (confirmação de conta, entrega, lembrete do Pix, aviso de venda). O domínio do remetente precisa estar verificado no Resend |
| `NEXT_PUBLIC_EMAIL_PRIVACIDADE` | E-mail do encarregado de dados na política de privacidade |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ORIGINAIS`, `R2_BUCKET_PUBLICO`, `R2_URL_PUBLICA` | Armazenamento das fotos (item 7). Sem elas o site funciona, mas o envio de fotos responde "Armazenamento de fotos não configurado" |

Contas de exemplo (`clicouai123`) não existem em produção. Os eventos de exemplo só entram com `SEMEAR_EXEMPLOS=1` (opcional, lido só quando o banco está vazio), sob fotógrafos de exemplo sem login. Preview e desenvolvimento continuam com o PGlite e todos os exemplos quando não há banco.

Gere `APP_SECRET` e `CRON_SECRET` com:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Trocar o `APP_SECRET` invalida os links de pedido já enviados por e-mail e WhatsApp.

### Liberação temporária do prazo de saque (só para teste)

`SAQUE_SEM_PRAZO_EMAILS` (e-mails separados por vírgula) faz o **gestor** (papel `admin`) com esse e-mail sacar as próprias vendas sem esperar 1/30 dias, com a comissão normal de 10%. Fotógrafos comuns não são afetados, mesmo que o e-mail esteja na lista. A tela Financeiro mostra um aviso enquanto está ativa e cada saque liberado fica registrado no log. Serve só para validar o saque: cadastre em *Production*, faça **Redeploy**, teste e depois apague a variável e faça outro Redeploy. Lembre que, com `MP_AMBIENTE=producao`, o saque só sai depois de ligar o Payouts (abaixo).

### Saque em produção (Payouts com `X-signature`)

Em produção, o Mercado Pago exige em cada `POST /v1/payouts` o header `X-signature`: assinatura **Ed25519** dos bytes exatos do corpo JSON enviado, em base64. O app assina com a chave privada de `MP_PAYOUTS_PRIVATE_KEY` e manda `X-enforce-signature: true` (sem `X-test-token`). A chave pública fica cadastrada no Mercado Pago.

1. **Gerar o par** (uma vez; já feito em 07/10/2026). Num terminal na raiz do projeto:

   ```
   node -e "const c=require('crypto');const {privateKey,publicKey}=c.generateKeyPairSync('ed25519');require('fs').writeFileSync('docs/mercadopago/payouts-chave-publica.pem',publicKey.export({type:'spki',format:'pem'}));process.stdout.write(Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'))" > chave-privada.b64
   ```

   `chave-privada.b64` é a privada (PEM PKCS8 em base64, numa linha). Nunca a commite nem cole em chat ou e-mail.
2. **Cadastrar a privada na Vercel**, só em *Production*, pelo terminal (o valor vai pela entrada padrão, não aparece no histórico): `npx vercel env add MP_PAYOUTS_PRIVATE_KEY production < chave-privada.b64`. Para rodar local, a mesma linha em `MP_PAYOUTS_PRIVATE_KEY=` no `.env`. Depois apague `chave-privada.b64`.
3. **Enviar a pública ao Mercado Pago** (`docs/mercadopago/payouts-chave-publica.pem`, formato PEM SPKI), pedindo o cadastro para a aplicação e a liberação do Payouts Pix em produção. A mensagem pronta está em [mercadopago/mensagem-para-o-mercado-pago.md](mercadopago/mensagem-para-o-mercado-pago.md).
4. **Ligar a trava** só quando o Mercado Pago confirmar: `MP_PAYOUTS_HABILITADO=1` em *Production* e **Redeploy**. Até lá, o saque em produção é recusado antes de chamar a API e o saldo volta ao fotógrafo.
5. **Primeiro saque real de R$ 1,00** (o mínimo) para validar: conferir no painel do Mercado Pago e na tela Financeiro que ficou `pago`.

**Trocar a chave** (vazamento ou rotina): desligue `MP_PAYOUTS_HABILITADO`, gere um par novo (passo 1), envie a pública nova ao Mercado Pago, troque `MP_PAYOUTS_PRIVATE_KEY` na Vercel (`npx vercel env rm MP_PAYOUTS_PRIVATE_KEY production` e o passo 2) e, quando o Mercado Pago confirmar a nova pública, ligue a trava e faça Redeploy.

**Saque que não sai como esperado:** recusa clara no primeiro envio (assinatura, token, permissão, corpo inválido) marca `falhou` e devolve o saldo. Recusa ambígua (referência repetida, conflito, código desconhecido), qualquer recusa num reenvio e Pix devolvido (`refunded`) deixam o saque em `processando` com um log `ALERTA saque para revisão manual`: confira no painel do Mercado Pago se o Pix saiu antes de mexer no saldo.

## 4. Domínio do site e lojas

- Em **Settings → Domains**, adicione o domínio do site (ex. `clicouai.com.br`) e o curinga `*.clicouai.com.br`, que abre as lojas por subdomínio (`liaramos.clicouai.com.br`).
- O curinga só funciona com o domínio usando os **nameservers da Vercel**. Se o DNS estiver em outro lugar (Registro.br, Cloudflare), aponte os nameservers para a Vercel.
- Domínio próprio de cada loja (ex. `fotos.liaramos.com.br`): o fotógrafo conecta em **Painel → Minha loja**, e o site cadastra o domínio no projeto pela API da Vercel. A loja só abre no domínio depois que o DNS é verificado.

## 5. Sentry e alertas

1. Crie o projeto em sentry.io com a plataforma **Next.js** e copie a DSN para `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN`.
2. Em **Alerts → Create Alert → Issues**, crie um alerta "A new issue is created" com e-mail para a equipe. Opcional: outro para "Number of events > 50 em 1 hora".
3. Depois do deploy, confira em **Issues** que nada estranho apareceu.

O Sentry recebe os erros sem tokens de pedido, cookies, corpo das requisições (onde vai a selfie da busca facial) e dados pessoais do usuário; a limpeza está em [`src/lib/sentry.ts`](../src/lib/sentry.ts). O Session Replay está desligado de propósito: ele gravaria a tela com as fotos das pessoas.

## 6. Depois do deploy

- **Mercado Pago:** cadastre o webhook `https://<domínio>/api/webhooks/mercadopago` no evento "Order (Mercado Pago)".
- **Google Cloud:** acrescente `https://<domínio>/api/auth/google/callback` às URIs de redirecionamento.
- **Busca por selfie:** as fotos enviadas antes de configurar a AWS (ou em que a indexação falhou) não aparecem na busca. Em cada evento do painel, o quadro "Busca por selfie" mostra quantas fotos têm rosto cadastrado e tem o botão "Cadastrar rostos que faltam".
- **Job de pedidos:** `GET /api/jobs/pedidos` (expira o Pix vencido, manda o lembrete do Pix 20 minutos depois do pedido e o de carrinho) roda a cada 10 minutos pelo GitHub Actions ([`.github/workflows/jobs.yml`](../.github/workflows/jobs.yml)). Cadastre no repositório, em **Settings → Secrets and variables → Actions**, os segredos `APP_URL` e `CRON_SECRET` (o mesmo da Vercel). O cron da Vercel em `vercel.json` roda uma vez por dia, só como reserva (no plano Hobby não dá para rodar mais vezes). Para testar na hora: **Actions → Job de pedidos → Run workflow**.

## 7. Cloudflare R2 (fotos)

> O bucket de originais precisa de CORS com `GET` para o domínio do site, além do `PUT` do envio: o botão "Compartilhar" do pedido baixa a foto no navegador para mandar ao Instagram.

As fotos vão direto do navegador do fotógrafo para o R2, por URL assinada; o servidor só confere, gera prévia e miniatura com marca d'água e move o original (docs/arquitetura.md, "Upload"). São dois buckets: o de originais é **privado** (só se baixa por URL assinada de 15 minutos, depois da compra) e o público guarda só prévias e miniaturas.

1. **Buckets.** No painel da Cloudflare, **R2 Object Storage → Create bucket**: crie `fotos-originais` e `fotos-publicas` (localização automática, classe Standard).
2. **Acesso público só no bucket público.** Em `fotos-publicas` → **Settings → Public Development URL** → **Enable**. Copie a URL (`https://pub-….r2.dev`) para `R2_URL_PUBLICA`, sem barra no fim. Depois, para cache de CDN, troque por um domínio próprio em **Custom Domains** (ex. `img.clicouai.com.br`) e atualize `R2_URL_PUBLICA`; o banco guarda só as chaves, então nada mais muda. **Nunca** ligue acesso público no `fotos-originais`.
3. **CORS no bucket de originais** (o navegador faz o PUT direto nele). Em `fotos-originais` → **Settings → CORS Policy → Add CORS policy**, cole:

   ```json
   [
     {
       "AllowedOrigins": ["https://clickai-hazel.vercel.app", "http://localhost:3000"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Ao trocar para o domínio definitivo, acrescente-o em `AllowedOrigins`. O download não precisa de CORS (é um redirecionamento).
4. **Ciclo de vida da pasta temporária.** Em `fotos-originais` → **Settings → Object lifecycle rules → Add rule**: nome `apagar-envios`, prefixo `envios/`, **Delete objects** depois de **1 dia**. Apaga o que sobrou de envios abandonados ou recusados; o original conferido fica em `originais/`.
5. **Token de acesso.** Em **R2 Object Storage → Manage API tokens → Create API token**: permissão **Object Read & Write**, aplicada **só aos buckets** `fotos-originais` e `fotos-publicas`, sem prazo (ou com rotação anotada). Copie o **Access Key ID** e o **Secret Access Key** (o segredo aparece uma vez só). O **Account ID** aparece na página inicial do R2.
6. **Variáveis na Vercel** (*Production*; em *Preview* só se quiser testar com buckets separados):

   | Variável | Valor |
   |---|---|
   | `R2_ACCOUNT_ID` | Account ID da Cloudflare |
   | `R2_ACCESS_KEY_ID` | Access Key ID do token |
   | `R2_SECRET_ACCESS_KEY` | Secret Access Key do token |
   | `R2_BUCKET_ORIGINAIS` | `fotos-originais` |
   | `R2_BUCKET_PUBLICO` | `fotos-publicas` |
   | `R2_URL_PUBLICA` | `https://pub-….r2.dev` (sem barra no fim) |

7. Faça um novo deploy (as variáveis só valem a partir dele) e confira: envie uma foto num evento de teste, veja a miniatura no painel, publique, compre com Pix de teste e baixe o original.

As chaves do R2 ficam só no servidor (`src/lib/r2.ts`); o navegador recebe apenas URLs assinadas de um objeto, válidas por 15 minutos. O processamento de cada foto roda na própria Server Action de confirmação (até 60 s por foto) até ir para o Inngest.

## 8. Máquina nova (para quem vai programar)

O `.env.local` não vai para o git. Numa máquina nova:

1. `git clone https://github.com/gamaral203/ClickAI` e `npm install`.
2. `npm run dev` já funciona sem nenhuma variável: o banco é o PGlite em memória, com os dados de exemplo (contas de exemplo em [README](../README.md)).
3. Para usar as mesmas variáveis da Vercel: `npx vercel login`, `npx vercel link --project clickai --scope amaralgabriel357-9380s-projects --yes` e `npx vercel env pull .env.local`.
4. **Depois do `env pull`, edite o `.env.local`:** em `GESTORES`, troque cada `$` por `\$`. O Next trata `$` como variável e, sem o escape, os gestores não são criados (aparece "GESTORES fora do formato esperado" no terminal). Na Vercel o valor fica como está.
5. Sem `DATABASE_URL` nem `POSTGRES_URL` no `.env.local`, o app usa o PGlite. Com elas (depois do `env pull`, quando o Supabase existir), o desenvolvimento local usa o banco de verdade: cuidado, é o mesmo banco da produção. Para continuar no PGlite, apague essas linhas do `.env.local`.
6. Antes de abrir um PR: `npm run lint`, `npm run test`, `npm run format:check` e `npm run build`.

