# Segurança — checklist de 20 itens

Auditoria do código contra o checklist de segurança (HTTPS, senhas, MFA, limites, validação, sanitização, SQL injection, migrações, rollback, controle de acesso, sessão, segredos, CORS, logs, backups, criptografia, dependências, menor privilégio e monitoramento). Conferido em 8 out. 2026; o item 20 (retenção de dados pelos serviços de IA da AWS) entrou em 14 out. 2026. Os riscos de negócio ficam em [riscos.md](riscos.md); as tarefas abertas, em [tarefas.md](tarefas.md).

Legenda: ✅ feito · ⚠️ parcial (o código está pronto, falta configuração ou um passo de fora) · ❌ falta.

| # | Item | Estado | Onde está | O que falta |
|---|---|---|---|---|
| 1 | HTTPS | ✅ | Vercel só serve HTTPS; `Strict-Transport-Security` de 2 anos com `includeSubDomains` (`next.config.ts:16`); CSP com `upgrade-insecure-requests` (`src/lib/csp.ts:97`); cookies `Secure` na produção (`src/servicos/sessao.ts`) | Opcional: `preload` no HSTS depois do domínio definitivo |
| 2 | Senhas com hash | ✅ | scrypt com sal aleatório de 16 bytes e comparação em tempo constante (`src/lib/senha.ts:10`); login com hash falso quando o e-mail não existe (mesmo tempo); `GESTORES` guarda só o hash; troca de senha em `/conta/seguranca` com a senha atual (limite do login), o código do MFA se ligado e aviso por e-mail (`src/servicos/troca-senha.ts`); "Esqueci a senha" por e-mail com token só como hash, 30 minutos e uso único; contas de exemplo com a senha pública só no PGlite, e a dica delas em `/entrar` nunca na produção (`src/lib/dados-de-exemplo.ts`) | — |
| 3 | MFA | ✅ | Gestor: código de 6 dígitos por e-mail obrigatório no login com senha e com o Google (`src/servicos/codigo-login.ts`, `/entrar/codigo`; só o HMAC no banco, 10 minutos, 5 tentativas, uso único). TOTP com app autenticador, opcional para fotógrafo e gestor, em Perfil e recebimento (`src/servicos/mfa.ts`, `src/lib/mfa.ts`, `src/app/(fotografo)/painel/perfil/mfa-acoes.ts`); pedido no login com senha e com o Google, na troca de CPF/CNPJ, em cada saque e para liberar o download dos originais pelo autor, em lote ou foto a foto (vale 3 horas para aquele evento) | Na produção sem o Resend, o código do gestor fica desligado (para não trancar a equipe fora) e `/admin` avisa: configurar `RESEND_API_KEY` e `EMAIL_REMETENTE` |
| 4 | Rate limit | ✅ | Tabela `tentativas`, regras em `src/servicos/limites.ts:18`: login (e-mail e IP), cadastro, reenvio de confirmação, busca facial, senha do evento, checkout, cartão (contra teste de cartão), Pix, denúncia, remoção de foto, URLs de envio e de download, lotes de originais do dono do evento e da aba Fotos vendidas, originais baixados um a um pelo autor, busca por rosto no painel (30 por hora por usuário), código do MFA, métricas e, contra a raspagem das prévias, galeria (`galeria_ip`), página da foto (`foto_ip`) e busca por número (`busca_numero_ip`); cada bloqueio vai para o log só com o nome da regra e soma no contador `limite:<regra>` do dia, sem IP | — |
| 5 | Validação de inputs | ✅ | Zod em todas as Server Actions e rotas (inclusive a busca por rosto do painel e o lote da aba Fotos vendidas) (ou no schema do serviço que elas chamam, como `src/servicos/envios.ts`); ids sempre `z.uuid()`; arquivos conferidos pelo conteúdo (fotos: JPEG, PNG, WebP, TIFF e AVIF pelos magic numbers, RAW e HEIC recusados no servidor, teto de 200 MB e de 160 megapixels; selfie) | Regra contínua para código novo |
| 6 | Sanitização de dados | ✅ | React escapa todo texto; o único `dangerouslySetInnerHTML` é o SVG do QR Code gerado no servidor a partir do nosso próprio link (`src/components/painel/compartilhar-evento.tsx:183`); loja só aceita IDs de GA/GTM, conferidos ao salvar e ao montar (`src/lib/loja.ts:46`); site do perfil só `http(s)`; `Content-Disposition` com nome ASCII limpo e `filename*` codificado (`src/lib/r2.ts:115`); imagens da loja regravadas pelo sharp, sem metadados; CSP com nonce e `'strict-dynamic'` (`src/proxy.ts`) | Testar a CSP com o Brick real e o 3DS (Fase 14) |
| 7 | SQL injection | ✅ | Drizzle com parâmetros em todas as consultas (inclusive nas montadas com o template `sql`); o único `sql.raw` é DDL constante, sem entrada de usuário (`src/db/papel-app.ts`) | — |
| 8 | Migrations | ✅ | `drizzle-kit generate` em `src/db/migracoes` (0000 a 0010), aplicadas pelo `npm run db:migrar` antes de cada build (`scripts/migrar.ts`); teste confere RLS em toda tabela (`src/db/seguranca.test.ts`) | — |
| 9 | Rollback | ⚠️ | Código: Instant Rollback da Vercel (ver abaixo). Banco: migrações só para frente e aditivas (colunas novas opcionais), então o código anterior continua funcionando com o schema novo | Combinar a regra: migração que remove ou renomeia coluna vai em dois deploys (primeiro o código para de usar, depois a migração) |
| 10 | Controle de acesso | ✅ | `exigirFotografo`/`exigirGestor` no topo de toda página, rota e ação do painel e da gestão (`src/servicos/sessao.ts:426` e `:441`), inclusive no Painel de uso (`/admin/uso`, cada ação de assinatura e de configuração) e na proteção das prévias (`/admin/marca-dagua`: salvar, pedir a regeração, lotes e amostra; o serviço confere o papel de novo e o teste `src/servicos/protecao-previas.test.ts` cobre visitante, cliente e fotógrafo); consultas do painel sempre filtradas pela conta (`buscarEventoDoFotografo(id, conta.id)`); download só de item de pedido pago do próprio cliente ou com o token do link, mesma resposta 404 para todo motivo (`src/servicos/downloads.ts:41`); exceção estreita: só o autor baixa o original das fotos que enviou (uma por vez, dono ou colaborador, por 302 para a URL assinada, ou em lote no evento que criou), conferido no servidor a cada foto e a cada lote, com auditoria em `downloads_do_dono` (`src/servicos/originais-do-dono.ts`); saque sempre do fotógrafo logado, valor calculado no servidor; jobs com `CRON_SECRET` em tempo constante (`src/lib/cron.ts:10`); `gravarPublico` recusa qualquer chave fora de `previas/`, `miniaturas/`, `eventos/` e `perfis/` (`src/lib/r2.ts`), então um original nunca vai ao bucket público nem por engano; testes de IDOR trocando o id do item, do pedido, do evento e da foto (download do comprador, original e miniatura sem marca do autor, lotes do dono e da aba Fotos vendidas) e de vazamento de chave do original nas leituras públicas (`src/servicos/idor-download.test.ts`, `src/servicos/idor-autor.test.ts`, `src/dados/vazamento-originais.test.ts`) | — |
| 11 | Expiração de sessão | ✅ | Cookie `HttpOnly`, `SameSite=Lax`, assinado, 30 dias desde o login; gestor 12 horas (`src/servicos/sessao.ts:50`); "Sair" revoga no servidor; "Sair de todos" derruba todas; troca de senha (mantém a atual com cookie novo), de CPF/CNPJ e ligar/desligar o MFA derrubam as outras sessões; login com MFA pendente vale 5 minutos (10 com o código por e-mail do gestor) | Sem expiração por inatividade (decisão: renovar o cookie a cada página custaria uma escrita por requisição) |
| 12 | Secrets | ✅ | Só em variáveis de ambiente; `.env*` no `.gitignore`; módulos com `server-only`; sem `NEXT_PUBLIC_` em segredo; produção recusa subir sem `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` (`src/lib/ambiente-producao.ts`) e nada é assinado sem um `APP_SECRET` de 32+ caracteres (`src/lib/assinatura.ts`); chave do Payouts só na Vercel | Rotação anotada das chaves (R2, AWS, Mercado Pago) |
| 13 | CORS | ✅ | Nenhuma rota responde `Access-Control-Allow-Origin`: a API é só do próprio site; Server Actions conferem a origem (padrão do Next); o bucket de originais aceita `PUT`/`GET` só do domínio do site ([deploy.md](deploy.md), item 7) | Acrescentar o domínio definitivo no CORS do R2 quando existir |
| 14 | Logs | ✅ | Logs sem selfie (nem a foto do rosto da busca do painel), token, cookie, CPF ou resposta do Mercado Pago (corpo não enumerável em `ErroMercadoPago`); só o nome do erro da AWS e do login com Google; Sentry limpa tokens, a assinatura das URLs do R2 (`X-Amz-Signature`, `X-Amz-Credential`), cookies, corpo e dados pessoais (`src/lib/sentry.ts`); as URLs assinadas dos originais nunca são logadas; limites guardam só HMAC (sem IP nem e-mail); os contadores do Painel de uso (`contadores_uso`) guardam só dia, chave e total, sem a selfie, o IP ou o destinatário; os bloqueios por limite aparecem no log só com o nome da regra | — |
| 15 | Backups | ❌ | — | Supabase Pro (backup diário) e, se o orçamento permitir, PITR; testar uma restauração (ver abaixo) |
| 16 | Criptografia | ⚠️ | TLS em todo tráfego; banco cifrado em repouso pelo Supabase; segredo do MFA com AES-256-GCM (`src/lib/mfa.ts:87`); senhas, tokens de pedido, de e-mail e de evento só como hash; conexão com o banco confere o certificado quando `DATABASE_CA_CERT` existe (`src/db/conexao.ts:63`) | Cadastrar `DATABASE_CA_CERT` (sem ela, o TLS do banco não confere quem responde) |
| 17 | Dependências | ⚠️ | `npm audit fix` aplicado sem `--force` | Sobram: `braces`/`fast-glob` no CLI do shadcn (alta, ReDoS, não roda no servidor), `tinypool` do vitest (crítica, só nos testes) e `esbuild` do drizzle-kit (moderada, só no desenvolvimento). Todas só com versão maior; atualizar vitest 5 e drizzle-kit numa tarefa própria |
| 18 | PMP (menor privilégio) | ⚠️ | RLS em todas as tabelas e `anon`/`authenticated` sem acesso (migrações 0001 e 0002); usuário IAM da AWS só com as ações do Rekognition; `GITHUB_TOKEN` sem permissões no job agendado; o `db:migrar` já prepara o papel `clicouai_app` (`src/db/papel-app.ts`) | O app ainda conecta como `postgres` (dono das tabelas) e o escopo do token do R2 não foi conferido: passos abaixo |
| 19 | Monitoramento | ⚠️ | Sentry no servidor, edge e navegador, ligado pela `SENTRY_DSN` (`src/instrumentation.ts`); alertas `ALERTA saque para revisão manual` e de cupom no log | Cadastrar `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (não existem na Vercel), criar os alertas e um monitor de disponibilidade |
| 20 | Retenção pelo provedor de IA | ⚠️ | Do nosso lado, a selfie (e a foto do rosto da busca do painel) fica só na memória da requisição e nunca vai para banco, R2, log ou storage do navegador (`src/lib/reconhecimento.ts`, `src/app/api/busca-facial/route.ts`). Mas, pelos termos da AWS, os serviços de IA (Rekognition incluso) podem guardar e usar o conteúdo enviado (selfies e fotos dos eventos) para melhorar os serviços, inclusive fora da região `sa-east-1`, a menos que a conta esteja coberta pela política de opt-out de serviços de IA do AWS Organizations | **Passo obrigatório antes do lançamento:** ligar o opt-out na organização da AWS (passo a passo abaixo). Enquanto ele não estiver ligado, a frase "não guarda a imagem da busca" da política de privacidade (`/privacidade`) não é verdadeira |

## Verificação em duas etapas

- **Gestor:** além do app (opcional), o login de todo gestor pede um código enviado ao e-mail da conta, com a senha ou com o Google ([arquitetura.md](arquitetura.md), "Login e papéis", item 10). Com o app ligado, a tela aceita qualquer um dos dois. Na produção sem o Resend, o código por e-mail fica desligado e `/admin` avisa.
- **Quem usa:** opcional para fotógrafo e gestor (Perfil e recebimento). Ligar pede a senha atual (ou login com o Google de menos de 10 minutos), para quem roubou só o cookie não trancar a dona da conta do lado de fora com o celular dele.
- **Guardado:** segredo TOTP cifrado com AES-256-GCM em `usuarios.mfa_segredo`, com chave derivada do `APP_SECRET` por HKDF; 10 códigos de recuperação só como HMAC em `codigos_recuperacao`. Biblioteca `otpauth` (RFC 6238, SHA-1, 6 dígitos, 30 s, janela de ±1 passo).
- **Quando pede:** login com senha, login com o Google, troca de CPF/CNPJ e cada saque. Cada código de 6 dígitos vale uma vez (`mfa_ultimo_passo`), cada código de recuperação também; 6 tentativas erradas em 15 minutos bloqueiam (regra `mfa_usuario`).
- **Google:** a decisão é pedir o código também depois do Google. O Google prova que a pessoa controla o Gmail, não que está com o celular; quem invadiu só o e-mail não entra.
- **Códigos de emergência (recuperação):** a tela que os mostra diz em destaque "Códigos de emergência (não são para entrar agora)", explica que o dia a dia usa o código de 6 números do app, tem "Copiar" e "Baixar .txt" e só sai da tela depois de "Guardei meus códigos". No login, o campo pede "o código de 6 números do app autenticador (Google Authenticator)" e um link secundário troca para "Usar um código de emergência". Motivo: em 11/10/2026 um fotógrafo ligou a verificação, achou que a lista de 10 códigos era "o código de entrar" e gastou 2 deles tentando adivinhar.
- **Perdeu o celular, mas tem os códigos de emergência:** entra com um deles e desliga em Perfil e recebimento com outro (testado em `src/servicos/mfa.test.ts`).
- **Perdeu o celular e os códigos:** hoje só pelo suporte, que confere a identidade e desliga no banco (`update usuarios set mfa_segredo = null, mfa_ativado_em = null, mfa_ultimo_passo = null where email = '...'; delete from codigos_recuperacao where usuario_id = '...';`).
- **Trocar o `APP_SECRET`** torna os segredos ilegíveis: avise quem usa e desligue a verificação de todos depois ([deploy.md](deploy.md), item 3).

## Códigos por e-mail (confirmação do cadastro e acesso do gestor)

- **Um código por vez:** enquanto o código vale (não usado, não vencido, com tentativas sobrando), "Reenviar", um login novo ou refazer o cadastro mandam o **mesmo** código; todo e-mail que chegar traz o mesmo número. O código só muda depois de usado, vencido ou com as 5 tentativas esgotadas. Confirmação do cadastro: vale 2 horas desde que foi gerado. Acesso do gestor: 10 minutos a cada envio, no máximo 2 horas.
- **Por que não um código fixo:** um código permanente seria uma segunda senha de 6 dígitos que nunca muda, vazaria uma vez e valeria para sempre. O código atual troca sozinho e só vale por pouco tempo.
- **Guardado:** a conferência continua pelo HMAC (`codigo_hash`). Para reenviar o mesmo código, a linha guarda também o código cifrado com AES-256-GCM (`codigo_cifrado`, chave derivada do `APP_SECRET` por HKDF com propósito próprio e o dono como dado autenticado, `src/lib/codigo-cifrado.ts`, migração 0025). O cifrado some com a linha (código usado), ao esgotar as tentativas e, no job de pedidos, quando o código vence.
- **Abuso:** o reenvio não zera as tentativas (senão cada reenvio daria mais 5 chutes); outro envio em menos de 30 segundos não sai (clique duplo, tela recarregada: a tela diz "Já enviamos o código"); os limites de envio por e-mail/usuário e por IP continuam contando também o reenvio do mesmo código (cota do Resend).
- **Sem o código no assunto nem no log:** o assunto é "Seu código ClicouAí (vale até HH:MM)"; o código só vai no corpo. A tela mostra o e-mail mascarado, a hora do envio e até quando o código vale.

## Print e captura de tela das prévias (o que dá e o que não dá)

Pesquisa de 15/10/2026, motivada por clientes que abrem a galeria no celular, tiram print e pedem a uma IA para apagar a marca. Resumo: **na web não existe forma de bloquear print**, em nenhum navegador, no celular ou no computador. O que protege é o que está nos pixels e no servidor.

- **Celular, navegador:** nem o Android nem o iOS avisam a página de que um print foi tirado (botões físicos, gesto, gravação de tela ou espelhamento). O `FLAG_SECURE` do Android, que deixa a tela preta no print, só vale para apps nativos (e para o WebView dentro de um app que o liga); o Chrome e o Safari não o ligam para um site. No iOS, um app nativo só fica sabendo depois do print (`userDidTakeScreenshotNotification`), sem impedir; a página web nem isso.
- **Computador:** o print do sistema (Win+Shift+S, Cmd+Shift+3/4/5, Ferramenta de Captura) é tratado pelo sistema antes do navegador; às vezes a página recebe o `keyup` da tecla PrintScreen ou perde o foco, mas o print já foi feito. Extensões, outro monitor, uma câmera apontada para a tela e o DevTools (aba Rede, com a URL da prévia) passam sempre.
- **DRM:** vídeo cifrado (EME/Widevine/PlayReady/FairPlay com caminho protegido de hardware) pode sair preto no print em alguns aparelhos, mas só serve para vídeo, exige servidor de licenças (serviço pago) e não protege foto. Não adotado.
- **CSS e eventos** (`user-select`, `-webkit-touch-callout`, `draggable=false`, `onContextMenu`): tiram o "Salvar imagem" e o arrastar do caso casual; não impedem print nem quem copia a URL. Ficam como complemento, sem prejudicar o resto: a galeria e a página da foto continuam com texto alternativo, foco pelo teclado (o link da foto recebe foco), zoom por pinça (o viewport não trava o zoom; não há `user-scalable=no` nem `touch-action` que o impeça) e a compra. O clique do meio e o Ctrl+clique ainda abrem a foto em outra aba; o botão direito na miniatura, não.
- **Desfoque na hora do print** (`ProtecaoContraPrint`, de antes desta pesquisa): desfoca as prévias quando a janela perde o foco, o mouse sai da página ou a tecla PrintScreen chega; é fricção para o print do computador, não bloqueio, e não pega nenhum print do celular. Ao soltar a PrintScreen, ele também tenta esvaziar a área de transferência (`navigator.clipboard.writeText("")`), o que o navegador só permite com a página em foco e que apaga o que a pessoa tinha copiado: vale revisar se fica.
- **O que de fato protege** (todas no servidor): a marca gravada nos pixels, distribuída e variando por foto, com logo grande sobre o centro e o terço de cima (um print ou um recorte levam a marca junto); a prévia bem menor que o original, com qualidade controlada pela gestão; o original só por URL assinada curta depois do pagamento; e o limite por IP contra baixar as prévias em massa. Mesmo assim, uma IA generativa pode refazer a foto sem a marca: o objetivo é que dê trabalho e saia pior que comprar, não que seja impossível.

Roteiro de teste manual por aparelho (não há aparelhos no ambiente de desenvolvimento; a emulação de celular do Chrome sem janela cobriu menu de contexto, arrastar, foco, toque para abrir a foto e adicionar ao carrinho, mas não conseguiu simular a pinça nem nenhum print):

| Aparelho | O que conferir |
|---|---|
| Android (Chrome) | Pinça amplia a galeria e a página da foto; toque longo na miniatura não oferece "Baixar imagem"; toque abre a foto; "Adicionar ao carrinho" e o checkout com Pix funcionam; print pelo botão sai com a marca (esperado: o print não é bloqueado) |
| iPhone (Safari) | Pinça amplia; toque longo não abre o menu de "Salvar na Fotos" nem a prévia do link; toque abre a foto; carrinho e checkout; print sai com a marca |
| Computador (Chrome, Edge, Firefox, Safari) | Botão direito na foto não mostra "Salvar imagem como"; arrastar a foto para a área de trabalho não copia o arquivo; Tab chega às fotos com o anel de foco; Ctrl+roda e Ctrl+"+" ampliam; carrinho e checkout; com a PrintScreen, a prévia desfoca por um instante, mas o print feito por outro programa sai com a marca |

## Passos que dependem de você

### Opt-out de serviços de IA da AWS (item 20, obrigatório)

Sem este passo, a AWS pode guardar e usar as selfies e as fotos que mandamos ao Rekognition, inclusive fora de São Paulo ([documentação da AWS](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html)). A política vale para a conta inteira; não há opção no Rekognition nem no código.

1. Entre no console da AWS com a conta **de gerenciamento** da organização (a conta "dona"). Se a conta do Rekognition ainda não faz parte de uma organização, abra **AWS Organizations → Create an organization** com ela: ela vira a conta de gerenciamento.
2. **AWS Organizations → Policies → AI services opt-out policies → Enable AI services opt-out policies.**
3. **Create policy**, nome `optout-servicos-de-ia`, com este conteúdo (`default` cobre todos os serviços de IA, o Rekognition incluso):

   ```json
   {
     "services": {
       "default": {
         "opt_out_policy": {
           "@@assign": "optOut"
         }
       }
     }
   }
   ```

4. Abra a política criada → **Targets → Attach** → marque o **Root** da organização (vale para todas as contas, inclusive as que entrarem depois) → **Attach policy**.
5. Para conferir: **AWS Organizations → AWS accounts** → a conta do Rekognition → aba **Policies** → **AI services opt-out policies → View effective policy**: o serviço `rekognition` (ou o `default`) deve aparecer com `optOut`.
6. Anote a data aqui e no item 20 da tabela (vira ✅). Segundo a mesma página da AWS, o opt-out também pede a exclusão do conteúdo que já tinha sido guardado antes dele.

Os rostos cadastrados nas coleções (`{prefixo}-{evento_id}`) continuam na região `sa-east-1`: eles são o índice da busca, guardados por nós de propósito, e a coleção de evento parado há 120 dias é apagada pelo job das coleções (ver [arquitetura.md](arquitetura.md), "Busca por selfie" e "Coleções arquivadas").

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
