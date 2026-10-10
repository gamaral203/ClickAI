# Segurança — checklist de 19 itens

Auditoria do código contra o checklist de segurança (HTTPS, senhas, MFA, limites, validação, sanitização, SQL injection, migrações, rollback, controle de acesso, sessão, segredos, CORS, logs, backups, criptografia, dependências, menor privilégio e monitoramento). Conferido em 8 out. 2026. Os riscos de negócio ficam em [riscos.md](riscos.md); as tarefas abertas, em [tarefas.md](tarefas.md).

Legenda: ✅ feito · ⚠️ parcial (o código está pronto, falta configuração ou um passo de fora) · ❌ falta.

| # | Item | Estado | Onde está | O que falta |
|---|---|---|---|---|
| 1 | HTTPS | ✅ | Vercel só serve HTTPS; `Strict-Transport-Security` de 2 anos com `includeSubDomains` (`next.config.ts:16`); CSP com `upgrade-insecure-requests` (`src/lib/csp.ts:97`); cookies `Secure` na produção (`src/servicos/sessao.ts`) | Opcional: `preload` no HSTS depois do domínio definitivo |
| 2 | Senhas com hash | ✅ | scrypt com sal aleatório de 16 bytes e comparação em tempo constante (`src/lib/senha.ts:10`); login com hash falso quando o e-mail não existe (mesmo tempo); `GESTORES` guarda só o hash; troca de senha em `/conta/seguranca` com a senha atual (limite do login), o código do MFA se ligado e aviso por e-mail (`src/servicos/troca-senha.ts`) | Recuperação de senha por e-mail ("esqueci a senha") |
| 3 | MFA | ✅ (opcional) | TOTP com app autenticador para fotógrafo e gestor, em Perfil e recebimento (`src/servicos/mfa.ts`, `src/lib/mfa.ts`, `src/app/(fotografo)/painel/perfil/mfa-acoes.ts`); pedido no login com senha e com o Google (`/entrar/codigo`), na troca de CPF/CNPJ e em cada saque | Tornar obrigatório para gestor (tarefa na Fase 14) |
| 4 | Rate limit | ✅ | Tabela `tentativas`, regras em `src/servicos/limites.ts:18`: login (e-mail e IP), cadastro, reenvio de confirmação, busca facial, senha do evento, checkout, cartão (contra teste de cartão), Pix, denúncia, remoção de foto, URLs de envio e de download, código do MFA e métricas | — |
| 5 | Validação de inputs | ✅ | Zod em todas as 55 Server Actions e nas 10 rotas (ou no schema do serviço que elas chamam, como `src/servicos/envios.ts`); ids sempre `z.uuid()`; arquivos conferidos pelo conteúdo (fotos: JPEG, PNG, WebP, TIFF e AVIF pelos magic numbers, RAW e HEIC recusados no servidor, teto de 200 MB e de 160 megapixels; selfie) | Regra contínua para código novo |
| 6 | Sanitização de dados | ✅ | React escapa todo texto; o único `dangerouslySetInnerHTML` é o SVG do QR Code gerado no servidor a partir do nosso próprio link (`src/components/painel/compartilhar-evento.tsx:183`); loja só aceita IDs de GA/GTM, conferidos ao salvar e ao montar (`src/lib/loja.ts:46`); site do perfil só `http(s)`; `Content-Disposition` com nome ASCII limpo e `filename*` codificado (`src/lib/r2.ts:115`); imagens da loja regravadas pelo sharp, sem metadados; CSP com nonce e `'strict-dynamic'` (`src/proxy.ts`) | Testar a CSP com o Brick real e o 3DS (Fase 14) |
| 7 | SQL injection | ✅ | Drizzle com parâmetros em todas as consultas (inclusive nas montadas com o template `sql`); o único `sql.raw` é DDL constante, sem entrada de usuário (`src/db/papel-app.ts`) | — |
| 8 | Migrations | ✅ | `drizzle-kit generate` em `src/db/migracoes` (0000 a 0010), aplicadas pelo `npm run db:migrar` antes de cada build (`scripts/migrar.ts`); teste confere RLS em toda tabela (`src/db/seguranca.test.ts`) | — |
| 9 | Rollback | ⚠️ | Código: Instant Rollback da Vercel (ver abaixo). Banco: migrações só para frente e aditivas (colunas novas opcionais), então o código anterior continua funcionando com o schema novo | Combinar a regra: migração que remove ou renomeia coluna vai em dois deploys (primeiro o código para de usar, depois a migração) |
| 10 | Controle de acesso | ✅ | `exigirFotografo`/`exigirGestor` no topo de toda página, rota e ação do painel e da gestão (`src/servicos/sessao.ts:426` e `:441`); consultas do painel sempre filtradas pela conta (`buscarEventoDoFotografo(id, conta.id)`); download só de item de pedido pago do próprio cliente ou com o token do link, mesma resposta 404 para todo motivo (`src/servicos/downloads.ts:41`); saque sempre do fotógrafo logado, valor calculado no servidor; jobs com `CRON_SECRET` em tempo constante (`src/lib/cron.ts:10`) | — |
| 11 | Expiração de sessão | ✅ | Cookie `HttpOnly`, `SameSite=Lax`, assinado, 30 dias desde o login; gestor 12 horas (`src/servicos/sessao.ts:50`); "Sair" revoga no servidor; "Sair de todos" derruba todas; troca de senha (mantém a atual com cookie novo), de CPF/CNPJ e ligar/desligar o MFA derrubam as outras sessões; login com MFA pendente vale 5 minutos | Sem expiração por inatividade (decisão: renovar o cookie a cada página custaria uma escrita por requisição) |
| 12 | Secrets | ✅ | Só em variáveis de ambiente; `.env*` no `.gitignore`; módulos com `server-only`; sem `NEXT_PUBLIC_` em segredo; produção recusa subir sem `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` (`src/lib/ambiente-producao.ts`) e nada é assinado sem um `APP_SECRET` de 32+ caracteres (`src/lib/assinatura.ts`); chave do Payouts só na Vercel | Rotação anotada das chaves (R2, AWS, Mercado Pago) |
| 13 | CORS | ✅ | Nenhuma rota responde `Access-Control-Allow-Origin`: a API é só do próprio site; Server Actions conferem a origem (padrão do Next); o bucket de originais aceita `PUT`/`GET` só do domínio do site ([deploy.md](deploy.md), item 7) | Acrescentar o domínio definitivo no CORS do R2 quando existir |
| 14 | Logs | ✅ | Logs sem selfie, token, cookie, CPF ou resposta do Mercado Pago (corpo não enumerável em `ErroMercadoPago`); só o nome do erro da AWS e do login com Google; Sentry limpa tokens, cookies, corpo e dados pessoais (`src/lib/sentry.ts:28`); limites guardam só HMAC (sem IP nem e-mail) | — |
| 15 | Backups | ❌ | — | Supabase Pro (backup diário) e, se o orçamento permitir, PITR; testar uma restauração (ver abaixo) |
| 16 | Criptografia | ⚠️ | TLS em todo tráfego; banco cifrado em repouso pelo Supabase; segredo do MFA com AES-256-GCM (`src/lib/mfa.ts:87`); senhas, tokens de pedido, de e-mail e de evento só como hash; conexão com o banco confere o certificado quando `DATABASE_CA_CERT` existe (`src/db/conexao.ts:63`) | Cadastrar `DATABASE_CA_CERT` (sem ela, o TLS do banco não confere quem responde) |
| 17 | Dependências | ⚠️ | `npm audit fix` aplicado sem `--force` | Sobram: `braces`/`fast-glob` no CLI do shadcn (alta, ReDoS, não roda no servidor), `tinypool` do vitest (crítica, só nos testes) e `esbuild` do drizzle-kit (moderada, só no desenvolvimento). Todas só com versão maior; atualizar vitest 5 e drizzle-kit numa tarefa própria |
| 18 | PMP (menor privilégio) | ⚠️ | RLS em todas as tabelas e `anon`/`authenticated` sem acesso (migrações 0001 e 0002); usuário IAM da AWS só com as ações do Rekognition; `GITHUB_TOKEN` sem permissões no job agendado; o `db:migrar` já prepara o papel `clicouai_app` (`src/db/papel-app.ts`) | O app ainda conecta como `postgres` (dono das tabelas) e o escopo do token do R2 não foi conferido: passos abaixo |
| 19 | Monitoramento | ⚠️ | Sentry no servidor, edge e navegador, ligado pela `SENTRY_DSN` (`src/instrumentation.ts`); alertas `ALERTA saque para revisão manual` e de cupom no log | Cadastrar `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (não existem na Vercel), criar os alertas e um monitor de disponibilidade |

## Verificação em duas etapas

- **Quem usa:** opcional para fotógrafo e gestor (Perfil e recebimento). Ligar pede a senha atual (ou login com o Google de menos de 10 minutos), para quem roubou só o cookie não trancar a dona da conta do lado de fora com o celular dele.
- **Guardado:** segredo TOTP cifrado com AES-256-GCM em `usuarios.mfa_segredo`, com chave derivada do `APP_SECRET` por HKDF; 10 códigos de recuperação só como HMAC em `codigos_recuperacao`. Biblioteca `otpauth` (RFC 6238, SHA-1, 6 dígitos, 30 s, janela de ±1 passo).
- **Quando pede:** login com senha, login com o Google, troca de CPF/CNPJ e cada saque. Cada código de 6 dígitos vale uma vez (`mfa_ultimo_passo`), cada código de recuperação também; 6 tentativas erradas em 15 minutos bloqueiam (regra `mfa_usuario`).
- **Google:** a decisão é pedir o código também depois do Google. O Google prova que a pessoa controla o Gmail, não que está com o celular; quem invadiu só o e-mail não entra.
- **Perdeu o celular e os códigos:** hoje só pelo suporte, que confere a identidade e desliga no banco (`update usuarios set mfa_segredo = null, mfa_ativado_em = null, mfa_ultimo_passo = null where email = '...'; delete from codigos_recuperacao where usuario_id = '...';`).
- **Trocar o `APP_SECRET`** torna os segredos ilegíveis: avise quem usa e desligue a verificação de todos depois ([deploy.md](deploy.md), item 3).

## Passos que dependem de você

### Menor privilégio no banco (item 18)

1. No Supabase, **SQL Editor**, rode (troque a senha por uma gerada com `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`):

   ```sql
   create role clicouai_app with login password 'SENHA_FORTE_AQUI';
   ```

2. Faça um **Redeploy** na Vercel (ou espere o próximo push): o `db:migrar` dá ao papel só `SELECT`, `INSERT`, `UPDATE` e `DELETE` e cria a política do RLS em todas as tabelas. Para conferir no SQL Editor: `select count(*) from pg_policies where policyname = 'acesso_do_app';` deve dar o número de tabelas do schema `public`.
3. Monte a URL do pooler com o papel novo: a mesma da `DATABASE_URL` atual, trocando o usuário `postgres.<ref>` por `clicouai_app.<ref>` e a senha pela nova (porta 6543).
4. Na Vercel, **Settings → Environment Variables**, troque só a `DATABASE_URL` (Production) por essa URL. A `DATABASE_URL_DIRETA` continua com o `postgres` (as migrações precisam do dono). Faça Redeploy e confira o login e uma página do painel.
5. Se algo falhar, volte a `DATABASE_URL` antiga e faça Redeploy.

### Escopo do token do R2 (item 18)

Cloudflare → **R2 Object Storage → Manage API tokens** → abra o token usado em `R2_ACCESS_KEY_ID`. Ele deve ter **Object Read & Write** e, em *Specify bucket(s)*, só `fotos-originais` e `fotos-publicas`. Se estiver como *Admin Read & Write* ou *Apply to all buckets*, crie um token novo com esse escopo, troque `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` na Vercel (Production), faça Redeploy, envie uma foto de teste e só então apague o token antigo.

### Certificado do banco (item 16)

Supabase → **Project Settings → Database → SSL Configuration → Download certificate**. No Git Bash, `base64 -w0 prod-ca-2021.crt` e cadastre o resultado como `DATABASE_CA_CERT` em Production; faça Redeploy. Se o build falhar no `db:migrar` com erro de certificado, apague a variável, faça Redeploy e avise.

### Backups (item 15)

1. Supabase → **Billing**: passar para o plano Pro antes do lançamento (o gratuito pausa o projeto depois de 7 dias sem uso e não tem backup diário para restaurar).
2. **Database → Backups**: conferir que os backups diários aparecem. Se o orçamento permitir, ligar o add-on **Point in Time Recovery**.
3. Uma vez, restaurar um backup num projeto de teste e conferir que pedidos, lançamentos e saques voltaram.

### Rollback (item 9)

- **Código:** Vercel → **Deployments** → deploy anterior que estava bom → **⋯ → Instant Rollback** (no Hobby, volta para o deploy de produção anterior). O rollback não desfaz migrações: por isso elas são só aditivas.
- **Banco:** não há migração "para trás". Para desfazer dados, restaurar um backup (item 15).

### Monitoramento (item 19)

1. Criar o projeto no Sentry e cadastrar `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN` na Vercel ([deploy.md](deploy.md), item 5), com o alerta "A new issue is created" por e-mail.
2. Um monitor de disponibilidade grátis (UptimeRobot ou Better Stack) na página inicial, a cada 5 minutos, com aviso por e-mail.
3. Alertas de cobrança na Vercel, Cloudflare, AWS e Supabase (Fase 14).
