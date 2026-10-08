# Tarefas — ClicouAí

Lista única do que já foi feito, do que está em andamento e do que falta. Ao concluir uma tarefa, marque `[x]` e mova para **Concluído** no mesmo commit da mudança. Os códigos entre colchetes (ex.: `[R-alta]`) apontam riscos de [riscos.md](riscos.md) que a tarefa resolve.

**Ordem do projeto:** primeiro o produto inteiro com dados de exemplo, atrás de uma camada de dados (`src/dados/`). As integrações (banco, login real, R2, processamento de imagem e vídeo, reconhecimento facial e numérico, gateway, e-mail, WhatsApp) ficam por último, quando formos testar com fotos reais; nesse momento a camada de dados de exemplo é trocada pela do banco, sem mexer nas telas.

## Concluído

- [x] Documento de arquitetura ([arquitetura.md](arquitetura.md))
- [x] Mapa de riscos ([riscos.md](riscos.md))
- [x] Regras do projeto e padrão de commits ([CLAUDE.md](CLAUDE.md))
- [x] Repositório no GitHub
- [x] Logo e paleta de cores ([marca/marca.md](marca/marca.md))
- [x] Lista de tarefas (este arquivo)
- [x] Skill de segurança `vibe-code-security` e página de skills ([skills.md](skills.md))
- [x] Skills de interface `ui-ux-pro-max` e `motion-framer`
- [x] Referência de produto: Fotto ([referencias/fotto.md](referencias/fotto.md))
- [x] Decisão: reconhecimento facial e numérico, vídeo e os 12 recursos da referência entram no MVP
- [x] Decisão: só JPEG, sem RAW
- [x] Iniciar o projeto Next.js com TypeScript, Tailwind, shadcn/ui, ESLint e Prettier (Next.js 16)
- [x] Aplicar as cores e a logo da marca no tema
- [x] `.gitignore` com `.env*`, source maps e chaves privadas, antes do primeiro segredo existir
- [x] Security headers no `next.config` e `productionBrowserSourceMaps: false`
- [x] Tipos do domínio (evento, foto, pedido…) espelhando o modelo de dados da arquitetura
- [x] Camada de dados em `src/dados/` com implementação de exemplo (troca pelo banco na Fase 11)
- [x] Layout comum: cabeçalho com logo e navegação, rodapé
- [x] Lista de eventos com busca por nome ou data
- [x] Página do evento, renderizada no servidor
- [x] Paginação por cursor
- [x] Página da foto
- [x] Prévias servidas sem otimização da Vercel (`next/image` sem otimizador) — custo `[Baixa]`
- [x] Prévia e miniatura com marca d'água gravada nos pixels, com Sharp (`src/servicos/imagens.ts`); fotos de exemplo geradas com ela (`npm run exemplos:gerar`)
- [x] Aplicar rotação do EXIF, converter para sRGB e remover metadados das prévias `[Média]`
- [x] Tipos e dados de exemplo no modelo novo (vídeo, pastas, visibilidade, liberação, colaboradores, cupons, descontos, pacote, loja, denúncia), com a galeria respeitando liberação, senha e "só após a busca"
- [x] Carrinho no navegador, com itens de vários eventos e preços recalculados no servidor a cada vez
- [x] Servidor recalcula o total a partir dos dados, nunca do navegador `[R-alta]`
- [x] Divisão da venda entre dono do evento e colaborador, com a sobra de centavos para o autor; a comissão da plataforma sai no saque `[Média]`
- [x] Pedido criado como `pendente` e confirmação idempotente; simulada quando não há credenciais do Mercado Pago
- [x] Página do pedido acessada pelo link com token, com aguardando pagamento, confirmado e expirado
- [x] Download só de item de pedido pago, conferindo o token daquele pedido; qualquer recusa dá o mesmo 404 `[R-alta]`
- [x] Acesso de convidado por token (link do pedido, guardado só como hash)
- [x] Registro em `downloads`, com contador na página do pedido
- [x] Cadastro, login e saída de cliente e fotógrafo com sessão simulada (senha com scrypt, cookie HttpOnly, token guardado só como hash) até a Fase 11
- [x] Confirmação de e-mail (link simulado até a Fase 13) e vínculo das compras de convidado com o mesmo e-mail só depois de confirmado
- [x] Área "Minhas compras" com pedidos pagos (download pela sessão) e pendentes (concluir pagamento); compra de cliente logado fica ligada à conta e o checkout já vem preenchido
- [x] Cadastro de fotógrafo: perfil público (nome, endereço, bio, Instagram, site), CPF/CNPJ validado e chave Pix de saque (o próprio CPF/CNPJ, confirmado), no painel com checklist do que falta para vender
- [x] Gestão de eventos no painel: criar (rascunho), editar todas as configurações (datas em horário de Brasília, preços, visibilidade com senha guardada só como hash, liberação, ordenação), publicar, arquivar e liberar agora; `revisao` só a equipe muda
- [x] Só publicar evento com chave Pix confirmada `[Média]`
- [x] Envio de fotos em lote no painel (simulado até a Fase 12): arrastar e soltar, JPEG conferido pelo conteúdo, até 30 MB e 500 por envio, conferido também no servidor
- [x] Gestão das fotos do evento com exclusão lógica (`excluida_em`): sai da galeria, mas quem comprou continua baixando `[Média]`
- [x] Vendas no painel: saldo disponível, antecipável e a liberar, e extrato por venda, incluindo a parte do dono quando um colaborador vende
- [x] Decisão: Mercado Pago, com pagamento dentro do site e sem split; comissão de 10% descontada no saque; saque antecipado com 1% a mais
- [x] Mercado Pago: Pix (QR Code na página do pedido) e cartão (Card Payment Brick, à vista) pela API de Orders, com idempotência e valor sempre do servidor
- [x] Webhook do Mercado Pago com assinatura `x-signature` conferida, status lido na API e conferência da order pela página do pedido (cobre webhook atrasado e `localhost`) `[R-alta]`
- [x] Saque do fotógrafo por Pix (Payouts, ambiente de teste): normal em 30 dias com 10%, antecipado a partir de 1 dia com 11%, só para a chave do próprio CPF/CNPJ, idempotente e sem liberar o saldo em caso de timeout `[R-alta]`
- [x] `.env.example` com as variáveis do Mercado Pago
- [x] Eventos recentes e busca direto na página inicial; carrossel com fotos horizontais no computador e as verticais no celular
- [x] Login com Google (OAuth com PKCE), ligado à conta de mesmo e-mail, com conta de vendedor pelo botão "Vender fotos com Google" e gestores por `ADMIN_EMAILS`
- [x] Papéis cliente, fotógrafo e gestor, conferidos no servidor; cada papel cai na sua área depois do login
- [x] Painel de gestão (`/admin`): visão geral com entradas, saídas, receita e o que é devido por vendedor; todas as vendas; histórico de saques; usuários com troca de papel (só gestor)
- [x] Busca por selfie na página do evento: consentimento, selfie reduzida no navegador, só em memória no servidor, limite por IP; Amazon Rekognition com credenciais da AWS ou rostos de exemplo sem elas `[R-alta]`
- [x] Busca por número de peito
- [x] Correção: a busca por número de peito recusava todo número no servidor (regex sem `\d`)
- [x] Testes automatizados com Vitest (`npm run test`): divisão da venda, saque e saldo, conversão de reais, CPF/CNPJ e validação dos filtros
- [x] Visibilidade do evento: tela de senha (cookie HttpOnly por evento, token guardado só como hash, limite de tentativas por IP; trocar a senha derruba os acessos antigos) e fotos todas ou só após a busca
- [x] Liberação automática, manual e agendada, com contagem regressiva que recarrega a galeria ao chegar a hora
- [x] Ordenação por envio, captura, nome do arquivo ou aleatória
- [x] Filtros por categoria e cidade na lista de eventos
- [x] Filtro por horário na galeria (opcional por evento), pelo endereço e mantido ao carregar mais fotos
- [x] Lista de fotos não identificadas (opcional por evento)
- [x] Link, QR Code (SVG na tela e PNG para imprimir, gerados no servidor) e WhatsApp ao publicar, no painel; botão Compartilhar na página do evento
- [x] Correções: leitura do relógio na sessão durante a pré-renderização, menu do painel rolando a página para o lado no celular e links com cara de botão "outline" sem borda

- [x] Cálculo dos descontos no servidor, na ordem da arquitetura (pacote, progressivo, cupom), com o desconto gravado em cada item e a divisão feita sobre o valor pago `[Média]`
- [x] Pacote "todas as minhas fotos" oferecido depois da busca, com token assinado das fotos encontradas (`APP_SECRET`) `[R-alta]`
- [x] Cupom no checkout, com a mensagem do motivo quando não vale; uso somado só no pagamento confirmado, respeitando o limite `[Média]`
- [x] Correção: a página do pedido lia o relógio antes de esperar a requisição
- [x] Preço individual opcional por foto ou vídeo, no painel
- [x] Painel "Descontos e cupons": regra padrão de desconto progressivo e cupons (percentual, valor e fotos grátis, com limite de usos, datas, eventos e mínimo; código único na plataforma)
- [x] Desconto progressivo próprio e pacote "todas as minhas fotos" na página do evento, no painel
- [x] Colaboradores: o dono adiciona pelo e-mail da conta de vendedor, com comissão e nota; o colaborador envia fotos em "Colaborações"; não dá para remover quem ainda tem fotos no evento
- [x] Entrega por e-mail e WhatsApp (com consentimento) depois do pagamento, com link assinado; envio simulado, visível em `/admin/mensagens`
- [x] Job de pedidos (`/api/jobs/pedidos`, protegido por `CRON_SECRET`): expira os pendentes vencidos, conferindo no Mercado Pago antes, e manda o lembrete de carrinho abandonado uma vez, com link que remonta o carrinho
- [x] Pastas: criar, renomear e excluir no painel, escolher a pasta de cada foto e filtrar por pasta na galeria
- [x] Loja própria: nome, descrição, cores (texto legível calculado pelo contraste) e subdomínio, no painel "Minha loja"; página da loja com os eventos do fotógrafo, aberta no subdomínio pelo `proxy.ts`
- [x] Google Analytics e Tag Manager da loja só pelo ID, conferido ao salvar e de novo ao montar a página `[R-alta]`
- [x] Denúncia de evento e de foto (motivo, descrição e contato; dados de empresa para direitos autorais), com limite por IP e confirmação ao denunciante
- [x] Análise das denúncias em `/admin/denuncias`: só o gestor decide; procedente tira a foto da galeria ou põe o evento em `revisao`, improcedente devolve o evento ao ar; as partes são avisadas (simulado)
- [x] Correção: os formulários novos do painel não apagam mais o que foi digitado quando o servidor devolve um erro
- [x] Região `gru1` das funções na Vercel, em `vercel.json` `[R-alta]`
- [x] Sentry no servidor, no edge e no navegador, ligado pela `SENTRY_DSN`; os eventos saem sem tokens, cookies, corpo das requisições e dados pessoais, e sem Session Replay
- [x] Domínio próprio das lojas: o fotógrafo conecta no painel, o site cadastra pela API da Vercel e verifica o DNS (simulado sem credenciais); o `proxy.ts` abre a loja no domínio verificado
- [x] Guia de deploy e contas ([deploy.md](deploy.md))
- [x] Primeiro deploy na Vercel (`clickai-hazel.vercel.app`), com gestores da equipe pela variável `GESTORES` (só hashes de senha) e sem a conta de exemplo de gestor em produção
- [x] Prioridades do Daniel (fotógrafo termina o evento, sobe, publica e vende sem perder tempo):
  - Dashboard do fotógrafo em `/painel`: vendas do dia e do mês, saldo disponível, a receber, ticket médio e conversão (30 dias)
  - Métricas sem dado pessoal (visita ao evento, visita à foto, adição ao carrinho), uma vez por aba, com limite por IP em `/api/metricas`
  - Desempenho em `/painel/desempenho`: visitas, carrinhos, pedidos, itens, conversão e faturamento por evento, e as fotos que mais vendem
  - Financeiro transparente: no extrato, quanto o cliente pagou, a sua parte, a taxa, o líquido e a previsão de repasse de cada venda
  - Duplicar evento (com descontos e pacote) e modelos de configuração, usados em Novo evento
  - Envio de fotos em lotes de 25 com barra de progresso, "Continuar envio" se a conexão cair, e fotos repetidas puladas pelo SHA-256 do arquivo
  - Divulgação: mensagem pronta editável para o WhatsApp e imagens automáticas de story (1080×1920) e feed (1080×1350) com o QR Code
  - Já existiam: reconhecimento facial e por número, pacotes, desconto progressivo, cupons, carrinho abandonado, QR Code, link e equipe com divisão automática
- [x] Decisão: banco Supabase (Postgres, no lugar do Neon), pelo Marketplace da Vercel, região São Paulo
- [x] Schema do banco em `src/db/schema.ts` (Drizzle), com as tabelas e os índices da arquitetura e as tabelas que só existiam em memória (confirmação de e-mail, acessos por senha de evento, mensagens); primeira migração em `src/db/migracoes`
- [x] Código pronto para o Supabase: driver postgres.js (pooler em modo transaction), RLS em todas as tabelas e acesso de `anon` e `authenticated` revogado, com testes `[R-alta]`
- [x] Camada de dados sobre o banco, com as mesmas funções: Postgres pela URL com pooler (postgres.js, com transações) e PGlite em memória sem `DATABASE_URL` `[R-alta]`
- [x] Dados de exemplo como semente do banco; `npm run db:migrar` aplica as migrações (roda antes de cada build) e grava a semente num banco vazio; gestores de `GESTORES` sincronizados a cada início
- [x] Usuários, contas de fotógrafo, confirmações de e-mail, pedidos, lançamentos, saques, mensagens e denúncias no banco; transações no pedido com itens, nas faixas, nos cupons e na reserva do saque
- [x] Correção: produção sem `DATABASE_URL`/`POSTGRES_URL` não cai mais no PGlite (cada servidor da Vercel tinha seu banco e pedidos Pix sumiam); o app e `npm run db:migrar` param com erro, e preview e desenvolvimento seguem com o PGlite `[R-alta]`
- [x] Correção: a semente na produção grava só as categorias, sem contas de exemplo com a senha pública; `SEMEAR_EXEMPLOS=1` liga os eventos de exemplo, sob fotógrafos sem login `[R-alta]`
- [x] Modal da busca por reconhecimento facial: "Tirar foto" (câmera, no celular) ou "Carregar foto" (galeria), com o consentimento antes e a rolagem até as fotos encontradas
- [x] Gestor usa, com a própria conta, as áreas de cliente (Minhas compras, carrinho, checkout, downloads) e todo o painel do fotógrafo, além do `/admin`; a conta de fotógrafo dele é criada no primeiro acesso ao painel, sem duplicar em acessos simultâneos
- [x] Correção: páginas do painel (como "Novo evento") ficavam carregando até a função da Vercel estourar o tempo. O postgres.js mandava a próxima consulta pela mesma conexão antes da resposta da anterior, e o pooler do Supabase em modo transaction travava; o driver passou a ser o node-postgres, com uma consulta por vez em cada conexão `[R-alta]`
- [x] Celular: cabeçalho com menu (logo, carrinho e botão), menu dos painéis com a página atual marcada (barra com "Menu" no celular, lateral no computador), tabelas que viram cartões, cartões de números em duas colunas, lista de eventos e faixas de desconto reorganizadas, fotos do evento no painel mostradas de 24 em 24. Conferido com Playwright em 390 px: 27 páginas sem rolar para o lado
- [x] Gráfico de vendas por dia (30 dias) no dashboard do fotógrafo e na visão geral da gestão, com tooltip e tabela
- [x] Link próprio de cada fotógrafo (`/fotografo/<endereço>`), com só os eventos dele, mostrado no painel com Copiar e WhatsApp; o nome do fotógrafo na página do evento leva a esse link
## Em andamento

- [ ] **Fase 11 (banco): trocar para o Supabase.** O código já está pronto para ele (branch `feat/supabase`): driver postgres.js com o pooler, RLS ligado em todas as tabelas e acesso público revogado. Sem banco, o deploy de produção falha de propósito (antes caía no PGlite em cada servidor da Vercel e os pedidos se perdiam entre servidores). Para terminar, nesta ordem:
  1. Fazer o merge do PR do `feat/supabase` na `main`.
  2. Criar o banco: `vercel integration add supabase --scope amaralgabriel357-9380s-projects` (ou no painel: Storage → Supabase), região São Paulo (`sa-east-1`), plano gratuito, ligado ao projeto `clickai`. Se a Vercel pedir, aceitar os termos do Supabase no navegador. A integração cadastra `POSTGRES_URL` e `POSTGRES_URL_NON_POOLING`.
  3. Fazer um novo deploy de produção (`vercel redeploy` do último deploy, ou um push na `main`). O build roda `npm run db:migrar`: aplica as migrações e, no banco vazio, grava só as categorias (os eventos de exemplo só com `SEMEAR_EXEMPLOS=1`). Sem a URL do banco, o build de produção falha.
  4. Conferir no site (`clickai-hazel.vercel.app`): login de um gestor e uma compra com Pix de teste, abrindo a página do pedido por mais de 10 segundos.
  5. Cadastrar o webhook do Mercado Pago (ver [deploy.md](deploy.md), item 6).
  6. Lembrar: o plano gratuito do Supabase pausa o projeto depois de 7 dias sem uso; antes do lançamento, passar para o Pro (backups diários).
- [ ] Busca e recursos do evento (Fase 7): faltam só os vídeos na galeria (junto com o worker de vídeo da Fase 12)

## Decisões de produto em aberto

Podem ser fechadas a qualquer momento; as de banco, reconhecimento, WhatsApp e worker de vídeo só são necessárias na Parte B. Entre parênteses, o que a Fotto fez.

- [ ] Tipo de foto: só eventos, ou também banco de imagens? (só eventos)
- [ ] Retenção: por quanto tempo os originais ficam disponíveis após o evento? (indeterminado)
- [ ] Acesso do cliente logado e do convidado: para sempre ou com prazo? (para sempre)
- [ ] Provedor de reconhecimento facial e numérico: serviço pronto ou modelo próprio?
- [ ] WhatsApp: Cloud API da Meta ou parceiro? Quem paga as mensagens?
- [ ] Worker de vídeo: Fly.io ou Railway?

## Diferenciais para depois (ideias do Daniel)

Não entram no MVP; ficam registrados para quando o básico estiver rodando com fotos reais.

- [ ] IA para marcar fotos desfocadas ou quase repetidas (rajadas) no envio, para o fotógrafo descartar antes de publicar
- [ ] Sugestão automática de preço por evento, a partir das vendas de eventos parecidos
- [ ] Fotos patrocinadas ou gratuitas dentro do mesmo evento (o patrocinador paga, o participante baixa de graça)
- [ ] Assistente de vendas que sugere ações para faturar mais (ex.: "ative o pacote", "divulgue de novo no WhatsApp")
- [ ] Criação de evento em etapas curtas (assistente passo a passo), além dos modelos e da cópia de evento que já existem

# Parte A — Produto com dados de exemplo

## Fase 1 — Base do app

- [ ] Validação de entrada com Zod em todas as Server Actions e rotas (regra contínua; já aplicada na galeria)

## Fase 2 — Galeria (cliente)

Concluída (ver **Concluído**).

## Fase 3 — Carrinho e checkout (pagamento simulado)

Concluída (ver **Concluído**).

## Fase 4 — Download (simulado)

Concluída (ver **Concluído**). A área "Minhas compras" depende de login e foi para a Fase 5.

## Fase 5 — Contas (telas)

Concluída (ver **Concluído**). Foto de perfil e capa dependem de upload e foram para a Fase 12.

## Fase 6 — Painel do fotógrafo

Concluída (ver **Concluído**). O envio de vídeos foi para a Fase 12, com o upload real.


## Fase 7 — Busca e recursos do evento

- [ ] Vídeos na galeria e na página do item, com prévia e marca d'água

## Fase 8 — Recursos de venda

Concluída (ver **Concluído**). O convite de colaborador para quem ainda não tem conta e o envio real das mensagens ficaram para a Fase 13.

## Fase 9 — Loja própria e moderação

Concluída (ver **Concluído**). Ficaram para depois: logo da loja e anexos da denúncia (dependem do upload, Fase 12), domínio próprio da loja (Fase 10) e as páginas de evento e checkout com a marca da loja (hoje a loja lista os eventos e o evento abre com a marca do ClicouAí).

# Parte B — Integrações (por último)

## Fase 10 — Contas e infraestrutura

O código está pronto (ver **Concluído**); falta a parte de fora do código, seguindo [deploy.md](deploy.md):

- [ ] Criar contas: Vercel, Sentry, banco (região São Paulo), Cloudflare R2, AWS (Rekognition), Google Cloud (OAuth) e WhatsApp
- [ ] Domínio próprio do site, com o curinga `*.` nos nameservers da Vercel, e as variáveis de produção dos serviços (Mercado Pago, Google, Sentry)
- [ ] Alertas de erro no Sentry

## Fase 11 — Banco e autenticação

- [ ] Criar o Supabase pela Vercel e rodar as migrações no banco de produção (passos em **Em andamento**)
- [ ] Avaliar o Better Auth no lugar da sessão em cookie assinado, mantendo o login com Google e os quatro papéis (com sessões revogáveis no banco)

## Fase 12 — Upload, processamento e reconhecimento

- [ ] Indexar os rostos de cada foto no Rekognition no job de processamento (`indexarRostos` em `src/lib/reconhecimento.ts`) e gravar em `rostos`
- [ ] Rota que gera URL assinada de upload e cria o item como `processando`
- [ ] Foto de perfil e capa do fotógrafo, e logo da loja
- [ ] Anexos da denúncia no bucket privado, por URL assinada
- [ ] Upload direto do navegador ao R2, em lote `[R-alta]`
- [ ] Envio de vídeos no painel, com upload multipart e retomada
- [ ] Pasta temporária com regra de ciclo de vida no R2 (evita órfãos)
- [ ] Conferir o tipo real do arquivo e limitar o tamanho (JPEG até 30 MB; MP4/MOV até 500 MB e 5 minutos)
- [ ] Job no Inngest que chama `gerarPrevia` e `gerarMiniatura` (função já pronta em `src/servicos/imagens.ts`) e envia o resultado ao R2
- [ ] Ler a data de captura do EXIF e calcular o hash para marcar duplicados
- [ ] Worker de vídeo com FFmpeg: prévia 720p com marca d'água, miniatura e quadros para o reconhecimento (testar com vídeos reais)
- [ ] Indexar rostos e números no job (fotos e quadros de vídeo)
- [ ] Rota de busca facial real: selfie só em memória, sem log, rate limit `[R-alta]`
- [ ] Job que revisa itens presos em `processando`
- [ ] Domínio de imagens na CDN da Cloudflare
- [ ] Download real por URL assinada de 15 minutos

## Fase 13 — Pagamento, e-mail e WhatsApp

- [ ] Saque em produção: implementar o header `X-signature` do Payouts (confirmar o algoritmo com o Mercado Pago) `[R-alta]`
- [ ] Cadastrar o webhook de produção e conferir no Mercado Pago o prazo de liberação do dinheiro do cartão (afeta o saque antecipado)
- [ ] Somar o uso do cupom na mesma transação que marca o pedido como pago
- [ ] Agendar o job de pedidos (`/api/jobs/pedidos`) de hora em hora, pelo Inngest ou pelo cron da Vercel (no plano Hobby o cron é só diário)
- [ ] Job que confere saques em processamento (hoje só a página de vendas confere)
- [ ] Estorno e chargeback: lançamento negativo descontado do próximo saque
- [ ] E-mail de confirmação com o link de downloads (Resend)
- [ ] Entrega por WhatsApp e lembrete de carrinho abandonado pela API real (hoje simulados em `src/servicos/mensagens.ts`)
- [ ] Convite de colaborador por e-mail para quem ainda não tem conta
- [ ] Liberação agendada e aviso aos colaboradores por e-mail

## Fase 14 — Antes do lançamento

- [ ] Revisar os 10 riscos de prioridade alta
- [ ] CSP completa de scripts (com nonce), depois de definir os scripts do gateway, do Sentry e do Google Analytics/Tag Manager das lojas
- [ ] Rodar o checklist da `vibe-code-security` ([skills.md](skills.md))
- [ ] Rate limit em login, cadastro, busca facial, envio de e-mail e geração de URLs assinadas
- [ ] Alertas de cobrança na Vercel, R2, Inngest, banco, provedor de reconhecimento e WhatsApp
- [ ] Política de privacidade (com selfie e DPO), termos de uso, política de conteúdo, exclusão de conta e canal de remoção de fotos (LGPD)
- [ ] Backup do banco com recuperação para um ponto no tempo
- [ ] Fluxo de estorno e chargeback
- [ ] Central de ajuda com artigos para comprador e fotógrafo
