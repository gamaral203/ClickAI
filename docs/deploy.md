# Deploy e contas

Passo a passo para colocar o ClicouAí no ar. O código já está pronto para estas configurações; o que falta é criar as contas e preencher as variáveis de ambiente. Todas as variáveis estão explicadas em [`.env.example`](../.env.example).

## 1. Contas

| Serviço | Para quê | Quando é preciso | Atenção |
|---|---|---|---|
| Vercel | Hospedar o site | Agora | Funções na região `gru1` (São Paulo), já em `vercel.json` |
| Sentry | Avisar de erros | Agora | Plano gratuito basta no começo |
| Mercado Pago | Pix, cartão e saque | Agora (credenciais de teste) | Produção só depois de validar o saque (Fase 13) |
| Google Cloud | Login com Google | Agora | Tela de consentimento OAuth publicada |
| Banco (Supabase ou Neon) | Dados | Fase 11 | Região São Paulo; decisão em aberto em [tarefas.md](tarefas.md) |
| Cloudflare R2 | Fotos e vídeos | Fase 12 | Dois buckets: público (prévias) e privado (originais) |
| AWS | Reconhecimento facial (Rekognition) | Fase 12 | Usuário IAM só com as permissões do `.env.example` |
| WhatsApp (Meta ou parceiro) | Entrega pelo WhatsApp | Fase 13 | Decisão em aberto |

## 2. Primeiro deploy na Vercel

1. Em vercel.com, **Add New → Project** e importe o repositório do GitHub. O framework (Next.js) é detectado sozinho.
2. Em **Settings → Environment Variables**, cadastre as variáveis do item 3 para *Production* (e as de teste para *Preview*).
3. Faça o deploy. A região `gru1` vem do `vercel.json`; confira em **Settings → Functions** que aparece *São Paulo (gru1)*.

## 3. Variáveis obrigatórias em produção

| Variável | O que é |
|---|---|
| `APP_URL` | Endereço do site, ex. `https://clicouai.com.br`. Usado nos links, no QR Code, no login com Google e nas lojas |
| `APP_SECRET` | Segredo de 32+ caracteres que assina os pacotes e os links das mensagens. Sem ele, o site não gera esses links |
| `CRON_SECRET` | Protege `/api/jobs/pedidos` |
| `MP_ACCESS_TOKEN`, `NEXT_PUBLIC_MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `MP_AMBIENTE` | Mercado Pago |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS` | Login com Google e quem entra como gestor |
| `GESTORES` | Contas de gestor da equipe com e-mail e senha (só o hash, gerado por `npm run senha:hash`). Em produção, as contas de exemplo de gestor e atendente não existem |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Erros no Sentry |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Envio dos source maps no build (opcional, mas ajuda a ler os erros) |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Domínio próprio das lojas |

Gere `APP_SECRET` e `CRON_SECRET` com:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Trocar o `APP_SECRET` invalida os links de pedido já enviados por e-mail e WhatsApp.

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
- **Job de pedidos:** agende `GET /api/jobs/pedidos` de hora em hora, com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. O cron da Vercel faz isso no plano Pro; no Hobby ele só roda uma vez por dia. Alternativa: o Inngest, previsto na arquitetura (Fase 13).
