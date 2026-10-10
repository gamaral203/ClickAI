# Deploy e contas

Passo a passo para colocar o ClicouAí no ar. O código já está pronto para estas configurações; o que falta é criar as contas e preencher as variáveis de ambiente. Todas as variáveis estão explicadas em [`.env.example`](../.env.example).

## 1. Contas

| Serviço | Para quê | Quando é preciso | Atenção |
|---|---|---|---|
| Vercel | Hospedar o site | Agora | Funções na região `gru1` (São Paulo), já em `vercel.json` |
| Sentry | Avisar de erros | Agora | Plano gratuito basta no começo |
| Asaas | Pix, cartão e saque (gateway principal) | Agora (comece pelo sandbox) | Passo a passo em "Asaas" (item 3). Com `ASAAS_API_KEY`, vale no lugar do Mercado Pago |
| Mercado Pago | Pix, cartão e saque (alternativa) | Só se o Asaas não estiver configurado | Saque em produção só com a chave pública cadastrada no Mercado Pago e `MP_PAYOUTS_HABILITADO=1` (item 3) |
| Google Cloud | Login com Google | Agora | Tela de consentimento OAuth publicada |
| Banco (Supabase) | Dados | Agora | Região São Paulo. A produção usa `DATABASE_URL` (pooler, porta 6543) e `DATABASE_URL_DIRETA` (direta, porta 5432), cadastradas à mão na Vercel; `POSTGRES_URL` e `POSTGRES_URL_NON_POOLING` são a alternativa, criadas pela integração do Marketplace (Storage → Supabase). O plano gratuito pausa o projeto depois de 7 dias sem uso. O build roda as migrações (`npm run db:migrar`); num banco vazio, a produção grava só as categorias (ver item 3) |
| Cloudflare R2 | Fotos (e vídeos, depois) | Agora, para enviar fotos | Dois buckets: público (prévias) e privado (originais). Passo a passo no item 7 |
| AWS | Reconhecimento facial (Rekognition) | Fase 12 | Região `sa-east-1` (São Paulo). Usuário IAM só com as permissões do `.env.example`; chaves em `REKOGNITION_*`, nunca em `AWS_*` (item 3) |
| WhatsApp (Meta ou parceiro) | Entrega pelo WhatsApp | Fase 13 | Decisão em aberto |

## 2. Primeiro deploy na Vercel

1. Em vercel.com, **Add New → Project** e importe o repositório do GitHub. O framework (Next.js) é detectado sozinho.
2. Em **Settings → Environment Variables**, cadastre as variáveis do item 3 para *Production* (e as de teste para *Preview*).
3. Faça o deploy. A região `gru1` vem do `vercel.json`; confira em **Settings → Functions** que aparece *São Paulo (gru1)*.

## 3. Variáveis obrigatórias em produção

| Variável | O que é |
|---|---|
| `DATABASE_URL` e `DATABASE_URL_DIRETA` (ou `POSTGRES_URL` e `POSTGRES_URL_NON_POOLING`) | Banco: a produção usa as duas primeiras, cadastradas à mão; as `POSTGRES_*` são as que a integração do Supabase cria. Sem ela, o build de produção falha de propósito: o banco em memória seria um por servidor e os pedidos Pix sumiriam |
| `DATABASE_CA_CERT` (recomendada) | Certificado raiz do Supabase (**Database Settings → SSL Configuration → Download certificate**), em base64 numa linha: `base64 -w0 prod-ca-2021.crt` no Git Bash. Com ela, a conexão confere o certificado do banco (`rejectUnauthorized: true`); sem ela, cifra sem conferir. Cadastre em *Production* e faça Redeploy: se o deploy falhar no `db:migrar` com erro de certificado, apague a variável e avise |
| `APP_URL` | Endereço do site; em produção, `https://www.clicouai.com` (sem barra no fim). Usado nos links, no QR Code, no login com Google e nas lojas |
| `APP_SECRET` | Segredo de 32+ caracteres que assina os pacotes e os links das mensagens. Sem ele, o site não gera esses links |
| `CRON_SECRET` | Protege `/api/jobs/pedidos` e `/api/jobs/revisao` |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_AMBIENTE` | Asaas (gateway principal). Com `ASAAS_API_KEY`, as variáveis do Mercado Pago deixam de ser exigidas; sem `ASAAS_WEBHOOK_TOKEN`, o build de produção falha de propósito |
| `MP_ACCESS_TOKEN`, `NEXT_PUBLIC_MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `MP_AMBIENTE` | Mercado Pago, só sem o Asaas. Sem `MP_ACCESS_TOKEN` ou `MP_WEBHOOK_SECRET`, o build de produção falha de propósito (`scripts/migrar.ts`, com o nome do que falta) e o servidor recusa cair no pagamento simulado (`src/lib/ambiente-producao.ts`) |
| `MP_PAYOUTS_PRIVATE_KEY`, `MP_PAYOUTS_HABILITADO` | Saque real pelo Payouts (ver "Saque em produção" abaixo). Sem as duas, o saque em produção é recusado sem chamar a API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS` | Login com Google e quem entra como gestor |
| `GESTORES` | Contas de gestor da equipe com e-mail e senha (só o hash, gerado por `npm run senha:hash`). Em produção, a conta de exemplo de gestor não existe |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Erros no Sentry |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Envio dos source maps no build (opcional, mas ajuda a ler os erros) |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Domínio próprio das lojas |
| `REKOGNITION_REGIAO`, `REKOGNITION_ACCESS_KEY_ID`, `REKOGNITION_SECRET_ACCESS_KEY` | Busca por selfie (Amazon Rekognition). Região `sa-east-1`. Sem elas, a busca responde "indisponível" em produção. **Não use `AWS_REGION`, `AWS_ACCESS_KEY_ID` nem `AWS_SECRET_ACCESS_KEY`**: na Vercel esses nomes são da plataforma (a região da função e credenciais temporárias que não valem na sua conta), e o app não os lê. O usuário IAM precisa só de `rekognition:CreateCollection`, `rekognition:IndexFaces` e `rekognition:SearchFacesByImage` (e `rekognition:DeleteFaces`, opcional). Opcional: `REKOGNITION_SEMELHANCA` (padrão 90) e `REKOGNITION_PREFIXO` (padrão `clicouai`). Se a busca falhar, o log da função mostra o nome do erro da AWS (ex.: `UnrecognizedClientException` = chave errada; `AccessDeniedException` = falta permissão) |
| `RESEND_API_KEY`, `EMAIL_REMETENTE` | E-mails (confirmação de conta, entrega, lembrete do Pix, aviso de venda). O domínio do remetente precisa estar verificado no Resend, então use `clicouai.com` (já comprado; o Resend não verifica `vercel.app`) e verifique-o lá antes de cadastrar as variáveis. Para teste local, `onboarding@resend.dev` só entrega ao e-mail da conta do Resend; não usar em produção |
| `NEXT_PUBLIC_EMAIL_PRIVACIDADE` | E-mail do encarregado de dados na política de privacidade |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_ORIGINAIS`, `R2_BUCKET_PUBLICO`, `R2_URL_PUBLICA` | Armazenamento das fotos (item 7). Sem elas o site funciona, mas o envio de fotos responde "Armazenamento de fotos não configurado" |

Contas de exemplo (`clicouai123`) não existem em produção. Os eventos de exemplo só entram com `SEMEAR_EXEMPLOS=1` (opcional, lido só quando o banco está vazio), sob fotógrafos de exemplo sem login. Preview e desenvolvimento continuam com o PGlite e todos os exemplos quando não há banco.

Gere `APP_SECRET` e `CRON_SECRET` com:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Trocar o `APP_SECRET` invalida os links de pedido já enviados por e-mail e WhatsApp e torna ilegíveis os segredos da verificação em duas etapas (cifrados com uma chave derivada dele): antes de trocar, avise quem usa a verificação e, depois, desligue-a para todos no banco (`update usuarios set mfa_segredo = null, mfa_ativado_em = null, mfa_ultimo_passo = null; delete from codigos_recuperacao;`), para que liguem de novo.

### Liberação temporária do prazo de saque (só para teste)

`SAQUE_SEM_PRAZO_EMAILS` (e-mails separados por vírgula) faz o **gestor** (papel `admin`) com esse e-mail sacar as próprias vendas sem esperar 1/30 dias, com a comissão normal de 10%. Fotógrafos comuns não são afetados, mesmo que o e-mail esteja na lista. A tela Financeiro mostra um aviso enquanto está ativa e cada saque liberado fica registrado no log. Serve só para validar o saque: cadastre em *Production*, faça **Redeploy**, teste e depois apague a variável e faça outro Redeploy. Lembre que, com `MP_AMBIENTE=producao`, o saque só sai depois de ligar o Payouts (abaixo).

### Asaas

1. **Conta:** crie em [sandbox.asaas.com](https://sandbox.asaas.com) para testar e em [asaas.com](https://www.asaas.com) para valer (pode ser CPF; o Asaas pede documentos para aprovar).
2. **Chave da API:** Integrações > Chave de API. Cadastre na Vercel `ASAAS_API_KEY` e `ASAAS_AMBIENTE` (`sandbox` ou `producao`). Nunca cole a chave em chat ou no código.
3. **Token dos webhooks:** gere um com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` e cadastre como `ASAAS_WEBHOOK_TOKEN` na Vercel.
4. **Webhook de cobranças e transferências:** Integrações > Webhooks > novo, URL `https://<domínio>/api/webhooks/asaas`, o mesmo token, eventos de **cobranças** e de **transferências**.
5. **Validação de saque:** Integrações > Mecanismos de segurança > *Validação de saque via webhook*, URL `https://<domínio>/api/webhooks/asaas/saque`, o mesmo token. Marque também a validação de reembolsos Pix. Com isso, o Asaas pergunta ao site antes de cada saída: o site aprova só a transferência que bate com um saque do ClicouAí (valor e chave Pix) e só uma por saque, o que impede pagar duas vezes e protege contra quem roubar a chave da API. **Transferência manual pelo app do Asaas é recusada**; para pagar alguém à mão, desligue a validação antes e ligue de novo depois.
6. **Redeploy** e um teste: compre R$ 1,00 no Pix, confira que o pedido virou pago; depois um saque de R$ 1,00.

Como funciona: o checkout pede o CPF (o Asaas exige). Pix mostra o QR Code na página do pedido; o cartão é pago na página segura do Asaas (o número do cartão não passa pelo ClicouAí). O Pix do Asaas vale até o fim do dia, mas o pedido vence em 1 hora: o job cancela a cobrança e expira o pedido. **O dinheiro do cartão no Asaas só fica disponível perto de 30 dias depois**, por isso venda no cartão não entra no saque antecipado (só Pix entra).

### Saque em produção (Payouts com `X-signature`, só Mercado Pago)

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

A produção está em **https://www.clicouai.com** (domínio comprado na Vercel, com os nameservers dela). Em **Settings → Domains** do projeto `clickai` estão:

| Domínio | Papel |
|---|---|
| `www.clicouai.com` | Site principal; é o `APP_URL` de Production (sem barra no fim) e o segredo `APP_URL` do GitHub Actions |
| `clicouai.com` | Redireciona (308) para `www.clicouai.com` |
| `*.clicouai.com` | Curinga que abre as lojas por subdomínio (`liaramos.clicouai.com`) |
| `clickai-hazel.vercel.app` | Endereço antigo; continua abrindo o site |

- O `proxy.ts` tira o `www.` do `APP_URL` para achar o domínio do site: `www.clicouai.com` e `clicouai.com` são o site; `nome.clicouai.com` é a loja `nome`; qualquer outro host (fora `*.vercel.app` e `localhost`) é tratado como domínio próprio de loja. Por isso, com o `APP_URL` errado, a página inicial do domínio novo mostra "Loja não encontrada".
- O curinga só funciona com o domínio usando os **nameservers da Vercel**. Se o DNS estiver em outro lugar (Registro.br, Cloudflare), aponte os nameservers para a Vercel.
- Ao trocar o domínio do site, atualize também, fora do código: a URI de redirecionamento do Google (`{APP_URL}/api/auth/google/callback`), a URL do webhook do gateway de pagamento, o domínio do remetente no Resend, o CORS do bucket de originais (item 7) e o segredo `APP_URL` do GitHub Actions.
- Domínio próprio de cada loja (ex. `fotos.liaramos.com.br`): o fotógrafo conecta em **Painel → Minha loja**, e o site cadastra o domínio no projeto pela API da Vercel. A loja só abre no domínio depois que o DNS é verificado.

## 5. Sentry e alertas

1. Crie o projeto em sentry.io com a plataforma **Next.js** e copie a DSN para `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN`.
2. Em **Alerts → Create Alert → Issues**, crie um alerta "A new issue is created" com e-mail para a equipe. Opcional: outro para "Number of events > 50 em 1 hora".
3. Depois do deploy, confira em **Issues** que nada estranho apareceu.

O Sentry recebe os erros sem tokens de pedido, cookies, corpo das requisições (onde vai a selfie da busca facial) e dados pessoais do usuário; a limpeza está em [`src/lib/sentry.ts`](../src/lib/sentry.ts). O Session Replay está desligado de propósito: ele gravaria a tela com as fotos das pessoas.

## 6. Depois do deploy

- **Asaas:** webhooks e validação de saque, itens 4 e 5 de "Asaas" acima.
- **Mercado Pago (só sem o Asaas):** cadastre o webhook `https://<domínio>/api/webhooks/mercadopago` nos eventos "Order (Mercado Pago)" e "Chargebacks" (reembolso e chargeback de order chegam como `type: "order"`).
- **Google Cloud:** acrescente `https://<domínio>/api/auth/google/callback` às URIs de redirecionamento.
- **Busca por selfie:** as fotos enviadas antes de configurar o Rekognition (ou em que a indexação falhou) não aparecem na busca. Em cada evento do painel, o quadro "Busca por selfie" mostra quantas fotos têm rosto cadastrado e quantas ainda não passaram pelo reconhecimento, com o botão "Cadastrar rostos que faltam" (só as que não passaram; foto sem rosto não volta) e "Refazer o cadastro de todas" (apaga os rostos do evento e cadastra de novo; para apagar também da coleção, o usuário IAM precisa de `rekognition:DeleteFaces`).
- **Job de pedidos:** `GET /api/jobs/pedidos` (expira o Pix vencido, manda o lembrete do Pix 20 minutos depois do pedido e o de carrinho) roda a cada 10 minutos pelo GitHub Actions ([`.github/workflows/jobs.yml`](../.github/workflows/jobs.yml)). Cadastre no repositório, em **Settings → Secrets and variables → Actions**, os segredos `APP_URL` e `CRON_SECRET` (o mesmo da Vercel). O cron da Vercel em `vercel.json` roda uma vez por dia, só como reserva (no plano Hobby não dá para rodar mais vezes). Para testar na hora: **Actions → Job de pedidos → Run workflow**. O mesmo workflow chama em seguida `GET /api/jobs/revisao`, que confere no Mercado Pago os saques em `processando` (casos ambíguos continuam em revisão manual, sem devolver saldo) e revisa até 5 fotos presas em `processando` há mais de 30 minutos; sem Mercado Pago ou R2 configurados, a parte correspondente não faz nada.

### Tamanho das funções e retenção de deploys

O plano Hobby da Vercel tem 10 GB de **Functions Storage**, somando as funções de todos os deploys guardados. Em outubro de 2026 estourou (10,25 GB) porque o PGlite (~20 MB) e as migrações entravam em quase todas as ~60 funções de cada deploy.

- No build da produção (`VERCEL_ENV=production` ou com `DATABASE_URL`/`POSTGRES_URL`), o `next.config.ts` tira das funções o `@electric-sql/pglite`, `src/db/migracoes` e `public/exemplo` (`outputFileTracingExcludes`). A soma dos arquivos rastreados das funções caiu de ~1,7 GB para ~0,4 GB por deploy. Os previews, que rodam no PGlite, continuam com tudo.
- O Sharp (e a libvips) entra só nas funções que processam imagem (painel, `/api/envios/processar`, `/api/jobs/*`, divulgação). Ao importar algo pesado, confira que não passou a ser rastreado por todas as rotas.
- **Retenção recomendada:** manter os 5 deploys de produção mais recentes (e sempre o que está nos domínios) e apagar os previews depois do merge da PR e os deploys com erro. Para listar: `npx vercel ls clickai`; para apagar: `npx vercel rm <url> --yes`. Dá para automatizar em **Project → Settings → Security → Deployment Retention Policy** (ex.: previews 7 dias, produção 30 dias; a Vercel nunca apaga o deploy atual dos domínios).

## 7. Cloudflare R2 (fotos)

> O bucket de originais precisa de CORS com `GET` para o domínio do site, além do `PUT` do envio: o botão "Compartilhar" do pedido baixa a foto no navegador para mandar ao Instagram.

As fotos vão direto do navegador do fotógrafo para o R2, por URL assinada; o servidor só confere, gera prévia e miniatura com marca d'água e move o original (docs/arquitetura.md, "Upload"). São dois buckets: o de originais é **privado** (só se baixa por URL assinada de 15 minutos, depois da compra) e o público guarda só prévias e miniaturas.

1. **Buckets.** No painel da Cloudflare, **R2 Object Storage → Create bucket**: crie `fotos-originais` e `fotos-publicas` (localização automática, classe Standard).
2. **Acesso público só no bucket público.** Em `fotos-publicas` → **Settings → Public Development URL** → **Enable**. Copie a URL (`https://pub-….r2.dev`) para `R2_URL_PUBLICA`, sem barra no fim. Depois, para cache de CDN, troque por um domínio próprio em **Custom Domains** (ex. `img.clicouai.com`) e atualize `R2_URL_PUBLICA`; o banco guarda só as chaves, então nada mais muda. **Nunca** ligue acesso público no `fotos-originais`.
3. **CORS no bucket de originais** (o navegador faz o PUT do envio direto nele, e o botão "Compartilhar" do pedido, em `src/components/pagamento/compartilhar-foto.tsx`, faz um `fetch` que segue o 302 até a URL assinada e lê a foto, o que exige `GET`). Em `fotos-originais` → **Settings → CORS Policy → Add CORS policy**, cole:

   ```json
   [
     {
       "AllowedOrigins": ["https://www.clicouai.com", "https://clicouai.com", "https://clickai-hazel.vercel.app", "http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Ao trocar de domínio, acrescente o novo em `AllowedOrigins`. O download pelo link não precisa de CORS (é navegação, não `fetch`); o `GET` na regra é para o compartilhar.
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

