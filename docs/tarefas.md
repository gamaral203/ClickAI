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
- [x] Envio de fotos em lote no painel (simulado até a Fase 12): arrastar e soltar, JPEG conferido pelo conteúdo, até 30 MB, conferido também no servidor
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
- [x] Busca por selfie na página do evento: consentimento, selfie reduzida no navegador, só em memória no servidor, limite por IP; Amazon Rekognition com as credenciais `REKOGNITION_*` ou rostos de exemplo sem elas `[R-alta]`
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
  - Envio de fotos em lotes automáticos com barra de progresso, "Continuar envio" se a conexão cair, e fotos repetidas puladas pelo SHA-256 do arquivo
  - Divulgação: mensagem pronta editável para o WhatsApp e imagens automáticas de story (1080×1920) e feed (1080×1350) com o QR Code
  - Já existiam: reconhecimento facial e por número, pacotes, desconto progressivo, cupons, carrinho abandonado, QR Code, link e equipe com divisão automática
- [x] Decisão: banco Supabase (Postgres), região São Paulo, no lugar do Neon
- [x] Schema do banco em `src/db/schema.ts` (Drizzle), com as tabelas e os índices da arquitetura e as tabelas que só existiam em memória (confirmação de e-mail, acessos por senha de evento, mensagens); primeira migração em `src/db/migracoes`
- [x] Código pronto para o Supabase: driver postgres.js (pooler em modo transaction), RLS em todas as tabelas e acesso de `anon` e `authenticated` revogado, com testes `[R-alta]`
- [x] Camada de dados sobre o banco, com as mesmas funções: Postgres pela URL com pooler (postgres.js, com transações) e PGlite em memória sem `DATABASE_URL` `[R-alta]`
- [x] Dados de exemplo como semente do banco; `npm run db:migrar` aplica as migrações (roda antes de cada build) e grava a semente num banco vazio; gestores de `GESTORES` sincronizados a cada início
- [x] Usuários, contas de fotógrafo, confirmações de e-mail, pedidos, lançamentos, saques, mensagens e denúncias no banco; transações no pedido com itens, nas faixas, nos cupons e na reserva do saque
- [x] Supabase criado (São Paulo) e ligado à Vercel: `DATABASE_URL` (pooler, porta 6543) e `DATABASE_URL_DIRETA` (direta, porta 5432) cadastradas à mão em Production, não pela integração; migrações rodando no build e deploy de produção no ar. O código também aceita `POSTGRES_URL` e `POSTGRES_URL_NON_POOLING` (alternativa da integração) `[R-alta]`
- [x] Job de pedidos agendado a cada 10 minutos pelo GitHub Actions (`.github/workflows/jobs.yml`, com `APP_URL` e `CRON_SECRET`); o cron diário da Vercel fica de reserva, porque no plano Hobby ele só roda uma vez por dia
- [x] Correção: produção sem `DATABASE_URL`/`POSTGRES_URL` não cai mais no PGlite (cada servidor da Vercel tinha seu banco e pedidos Pix sumiam); o app e `npm run db:migrar` param com erro, e preview e desenvolvimento seguem com o PGlite `[R-alta]`
- [x] Correção: a semente na produção grava só as categorias, sem contas de exemplo com a senha pública; `SEMEAR_EXEMPLOS=1` liga os eventos de exemplo, sob fotógrafos sem login `[R-alta]`
- [x] Modal da busca por reconhecimento facial: "Tirar foto" (câmera, no celular) ou "Carregar foto" (galeria), com o consentimento antes e a rolagem até as fotos encontradas
- [x] Gestor usa, com a própria conta, as áreas de cliente (Minhas compras, carrinho, checkout, downloads) e todo o painel do fotógrafo, além do `/admin`; a conta de fotógrafo dele é criada no primeiro acesso ao painel, sem duplicar em acessos simultâneos
- [x] Correção: páginas do painel (como "Novo evento") ficavam carregando até a função da Vercel estourar o tempo. O postgres.js mandava a próxima consulta pela mesma conexão antes da resposta da anterior, e o pooler do Supabase em modo transaction travava; o driver passou a ser o node-postgres, com uma consulta por vez em cada conexão `[R-alta]`
- [x] Celular: cabeçalho com menu (logo, carrinho e botão), menu dos painéis com a página atual marcada (barra com "Menu" no celular, lateral no computador), tabelas que viram cartões, cartões de números em duas colunas, lista de eventos e faixas de desconto reorganizadas, fotos do evento no painel mostradas de 24 em 24. Conferido com Playwright em 390 px: 27 páginas sem rolar para o lado
- [x] Gráfico de vendas por dia (30 dias) no dashboard do fotógrafo e na visão geral da gestão, com tooltip e tabela
- [x] Link próprio de cada fotógrafo (`/fotografo/<endereço>`), com só os eventos dele, mostrado no painel com Copiar e WhatsApp; o nome do fotógrafo na página do evento leva a esse link
- [x] Envio real de fotos ao Cloudflare R2 (Fase 12, fotos): URL assinada de PUT por foto (tipo e tamanho na assinatura), pedida em lotes de 25 com a foto em `processando`; envio direto do navegador ao bucket privado, 3 por vez, com progresso por arquivo e total, erro por arquivo e "Tentar de novo" (reaproveita o item pelo hash) `[R-alta]`
- [x] Confirmação de cada foto no servidor (síncrona, até o Inngest): tamanho, JPEG de verdade pelo conteúdo e SHA-256 conferidos; prévia e miniatura com marca d'água no bucket público; original movido de `envios/` (pasta temporária com ciclo de vida) para `originais/`; largura, altura e data de captura do EXIF; `erro` com mensagem clara em qualquer falha `[Média]`
- [x] Prévias e miniaturas montadas a partir das chaves com `R2_URL_PUBLICA`, sem o otimizador da Vercel; `public/logo.png` incluída nas funções do painel para a marca d'água
- [x] Download real: redireciona para a URL assinada de 15 minutos do original, com `Content-Disposition` de anexo `[R-alta]`
- [x] Produção nunca cria itens de exemplo: sem R2, o envio responde "Armazenamento de fotos não configurado"; fora da produção, sem R2, segue o envio simulado
- [x] Saque em produção pelo Payouts: `X-signature` Ed25519 sobre os bytes exatos do corpo (chave em `MP_PAYOUTS_PRIVATE_KEY`, pública em `docs/mercadopago/`), headers por ambiente, status lido em `/v1/payouts/{id}/transactions` (`pago` só com `success` + `accredited`), descrições sem acento e trava `MP_PAYOUTS_HABILITADO=1`; saldo só volta com recusa clara no primeiro envio, e recusa ambígua, recusa em reenvio ou Pix devolvido ficam em `processando` com alerta `[R-alta]`
- [x] Produção nunca mostra o link de confirmação de e-mail na tela: se o e-mail não sair, a tela avisa que o envio está indisponível e o erro vai ao log, sem o token na URL nem no log; o link na tela fica só fora da produção `[R-alta]`
- [x] Correção: a busca por selfie falhava na Vercel porque lia `AWS_REGION`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`, nomes que a plataforma preenche com a região da função e credenciais que não valem na nossa conta. Agora lê só `REKOGNITION_REGIAO`, `REKOGNITION_ACCESS_KEY_ID` e `REKOGNITION_SECRET_ACCESS_KEY` e passa as chaves direto ao cliente; o log mostra só o nome do erro da AWS (nunca a selfie)
- [x] Correção: "Cadastrar rostos que faltam" contava como feita a foto em que o reconhecimento falhou. Agora mostra quantas entraram e quantas falharam, e com credencial recusada para na primeira foto e avisa o fotógrafo para conferir as credenciais
- [x] Correção: o painel mostrava sempre "0 fotos com rosto cadastrado" e o "Cadastrar rostos que faltam" mandava de novo ao Rekognition até as fotos que já tinham rosto (rosto repetido na coleção). A subconsulta comparava `rostos.foto_id` com `rostos.id`, porque o Drizzle escreve a coluna sem a tabela dentro do `sql`
- [x] Marca `fotos.rostos_indexados_em` (migração 0006): a foto que já passou pelo reconhecimento, mesmo sem nenhum rosto, não volta a ele no "Cadastrar rostos que faltam"; o quadro mostra quantas ainda não passaram. "Refazer o cadastro de todas", só para o dono do evento, apaga os rostos da coleção (com `rekognition:DeleteFaces`, opcional) e da tabela e cadastra o evento de novo
- [x] Exclusão de conta pelo próprio usuário (cliente e fotógrafo) em `/conta/excluir`, com senha (ou o e-mail, para quem só usa o Google): dados pessoais anonimizados e pedidos, lançamentos e saques mantidos para fins fiscais; fotógrafo só exclui sem saldo sacável, saque em `processando` ou pedido pendente; fotos com exclusão lógica (quem comprou continua baixando), rostos tirados do banco e do Rekognition; sessão derrubada em todos os aparelhos (`usuarios.excluido_em`, migração 0005)
- [x] Canal de remoção de fotos (LGPD) em `/remover-foto`: quem aparece na foto cola o link da foto ou do evento e o pedido entra na fila de denúncias com o motivo `privacidade`, com limite por IP no banco; o encarregado aparece pelo `NEXT_PUBLIC_EMAIL_PRIVACIDADE` quando existir. Correção: a política de privacidade apontava para `/denunciar` sem evento (página 404)
- [x] Termos de uso (`/termos`) e política de conteúdo (`/politica-de-conteudo`), rascunhos com as regras reais (Pix de 1 hora, comissão de 10%, antecipação com 1% a mais, saque só para o próprio CPF/CNPJ) e aviso de revisão jurídica no topo; linkados no rodapé e no cadastro
- [x] Central de ajuda (`/ajuda`) com artigos curtos para quem compra (achar fotos, selfie, pagar, baixar, reembolso, remoção, excluir conta) e para quem vende (começar, enviar, preços, divulgar, taxas com exemplo, saque, colaboradores, denúncias, excluir conta), no rodapé e no menu do celular
- [x] Fluxo de estorno e chargeback (Fase 13 e 14): reembolso total pelo gestor em `/admin/vendas` (confirmação digitando o valor, chave de idempotência fixa por pedido, downloads parados na hora, gateway simulado sem credenciais); webhook trata order reembolsada e chargeback lendo a order na API; `contestado` na disputa e `estornado` no fim; lançamento negativo por venda (`estorno_de` único), abatido do próximo saque sem tocar saque pago ou em processamento; contestação ganha restaurada pelo gestor só com a order paga na API; casos listados no admin `[Média]`
- [x] Rate limit persistente (tabela `tentativas`, sem migração nova) na busca facial, na senha do evento, na denúncia, no reenvio do e-mail de confirmação, na criação de pedidos e na geração de URLs assinadas de envio e de download; antes, a busca, a senha e a denúncia contavam só na memória de cada servidor
- [x] CSP completa de scripts com nonce em todas as páginas (`src/proxy.ts`, `src/lib/csp.ts`): Brick do Mercado Pago, Sentry e GA/GTM das lojas liberados; páginas renderizadas por requisição, sem a casca estática do Cache Components (o nonce não funciona com ela). Conferido com Playwright no `next start`: páginas públicas, loja (caminho e subdomínio), compra completa até o pedido pago, painel e gestão sem violação
- [x] Checklist da `vibe-code-security` rodado: corrigidos redirecionamento aberto no `?proximo=` (TAB), pagamento e saque simulados possíveis na produção sem credenciais, resposta do Mercado Pago (CPF/chave Pix) nos logs e id de evento sem validar; o resto virou tarefa na Fase 14
- [x] Revisão dos 10 riscos de prioridade alta, com o que falta em cada um ([riscos.md](riscos.md#revisão-dos-riscos-de-prioridade-alta-fase-14))
- [x] Webhook do Mercado Pago recusa assinatura com `ts` a mais de 5 minutos do relógio do servidor (passado ou futuro), contra repetição de notificação capturada
- [x] Uso do cupom somado na mesma transação que marca o pedido como `pago`, com `usos < usos_max` no UPDATE e idempotente (repetir o webhook não soma de novo); limite estourado entre a criação e o pagamento mantém o pedido pago, sem estorno automático, com alerta no log
- [x] App recusa subir na produção sem `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`: o build falha no `db:migrar` com o nome do que falta e o servidor recusa cair no pagamento simulado (`src/lib/ambiente-producao.ts`); conferido antes que as duas existem na Vercel
- [x] `REKOGNITION_REGIAO`, `REKOGNITION_ACCESS_KEY_ID` e `REKOGNITION_SECRET_ACCESS_KEY` cadastradas na Vercel (produção) e usadas pelo deploy atual
- [x] Job de revisão (`/api/jobs/revisao`, a cada 10 minutos pelo mesmo workflow do GitHub, com `CRON_SECRET`): confere no Mercado Pago os saques em `processando` com `conferirSaques` (ambíguos continuam em revisão manual, saldo nunca volta sem certeza) e revisa até 5 fotos presas em `processando` há mais de 30 minutos, conferindo o arquivo no R2 e reprocessando ou marcando `erro` com a mensagem mostrada no painel (migração 0007); sem Mercado Pago ou R2 configurados, não faz nada
- [x] "Sair" encerra a sessão no servidor (id da sessão do cookie em `sessoes_revogadas` até a hora em que venceria) e "Sair de todos os dispositivos" em Minhas compras e em Perfil e recebimento (`usuarios.versao_sessao`, migração 0008); a versão da sessão passa a incluir o hash da senha, então trocar a senha (inclusive a de gestor em `GESTORES`) derruba as outras sessões. A leitura da sessão continua uma consulta só por requisição
- [x] Troca de CPF/CNPJ do fotógrafo pede a senha atual de novo (ou, na conta só com o Google, login com o Google de menos de 10 minutos), volta a exigir a confirmação da chave Pix, avisa por e-mail, derruba as outras sessões e bloqueia saques por 72 horas, com a hora da liberação na tela de vendas (`fotografos.documento_trocado_em`, migração 0009) `[R-alta]`
- [x] Verificação em duas etapas (TOTP, app autenticador), opcional para fotógrafo e gestor em Perfil e recebimento: QR Code, 10 códigos de recuperação (só o HMAC no banco), segredo cifrado com AES-256-GCM (chave derivada do `APP_SECRET`); pedida no login com senha e com o Google, na troca de CPF/CNPJ e em cada saque; cada código vale uma vez e há limite de 6 tentativas em 15 minutos (migração 0010) `[R-alta]`
- [x] Limite de `/api/metricas` no banco (regra `metricas_ip`, 300 em 10 minutos por IP), sem o `Map` na memória de cada servidor que crescia sem limpeza
- [x] Login com Google loga só o nome do erro (a resposta do Google pode trazer o código ou o token)
- [x] Sessão de gestor com expiração absoluta de 12 horas desde o login (os outros papéis continuam com 30 dias)
- [x] Conexão com o banco confere o certificado do servidor quando `DATABASE_CA_CERT` existe (`src/db/conexao.ts`); sem ela, segue cifrada sem conferir
- [x] Validação de entrada com Zod em todas as Server Actions e rotas: varredura das 55 ações e 10 rotas; as últimas conferências manuais (domínio e imagens da loja, preço individual) passaram para schemas Zod
- [x] Limite de tentativas de pagamento com cartão (10 por IP por hora, contra teste de cartão roubado) e de QR Code Pix gerado de novo na página do pedido (30 por IP por hora)
- [x] `npm run db:migrar` dá ao papel `clicouai_app` (se existir) só SELECT/INSERT/UPDATE/DELETE e a política do RLS em todas as tabelas, inclusive as novas (`src/db/papel-app.ts`)
- [x] Auditoria do checklist de segurança de 19 itens ([seguranca.md](seguranca.md)), com `npm audit fix` sem mudança de versão maior
- [x] Envio sem limite de quantidade (eram 500 por envio) e mais rápido: 6 arquivos subindo ao mesmo tempo com nova tentativa por arquivo, URLs em lotes de 50 pedidas à frente, processamento fora do caminho do envio pela rota `/api/envios/processar` (4 ao mesmo tempo), Sharp com uma decodificação só e a marca d'água em memória (de ~520 para ~220 ms de CPU por foto de 24 MP), tela com progresso somado e só os erros, grade que se atualiza sozinha e job de revisão com 30 fotos por execução

## Em andamento

- [ ] **Colocar a produção em uso real** (`clickai-hazel.vercel.app`). O banco e o deploy já estão no ar; falta conferir e configurar:
  1. Conferir no site o login de um gestor e uma compra com Pix de teste, abrindo a página do pedido por mais de 10 segundos.
  2. Cadastrar e confirmar o webhook do Mercado Pago ([deploy.md](deploy.md), item 6; o prazo de liberação do cartão fica na Fase 13).
  3. Resend: verificar o domínio e cadastrar `RESEND_API_KEY` e `EMAIL_REMETENTE` (e `NEXT_PUBLIC_EMAIL_PRIVACIDADE`).
  4. Google OAuth: cadastrar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
  5. Sentry: cadastrar `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN`.
  6. Testar a busca por selfie com fotos reais.
  7. Conferir o CORS e o ciclo de vida dos buckets do R2.
  8. Conferir no GitHub os segredos `APP_URL` e `CRON_SECRET` do job de pedidos (Actions → Job de pedidos → Run workflow).
  9. Lembrar: o plano gratuito do Supabase pausa o projeto depois de 7 dias sem uso; antes do lançamento, passar para o Pro (backups diários).
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

Concluída (ver **Concluído**). A validação com Zod continua como regra para toda ação ou rota nova.

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
- [ ] Domínio próprio do site, com o curinga `*.` nos nameservers da Vercel
- [x] Variáveis de produção do Mercado Pago, do R2 e da AWS já cadastradas na Vercel
- [ ] Variáveis de produção do Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) e do Sentry (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`)
- [ ] Alertas de erro no Sentry

## Fase 11 — Banco e autenticação

- [x] Criar o Supabase e rodar as migrações no banco de produção
- [ ] Avaliar o Better Auth no lugar da sessão em cookie assinado, mantendo o login com Google e os quatro papéis (com sessões revogáveis no banco)

## Fase 12 — Upload, processamento e reconhecimento

- [x] Variáveis `R2_*` (6) cadastradas na Vercel
- [ ] Conferir nos buckets da Cloudflare o CORS, o acesso público e o ciclo de vida de `envios/` ([deploy.md](deploy.md), item 7); depois, enviar uma foto de teste e comprar para conferir o download
- [ ] Levar o processamento da foto (hoje na rota `/api/envios/processar`, chamada pelo navegador, com o job de revisão como rede de segurança) para um job no Inngest, com nova tentativa automática
- [ ] Medir em produção um envio grande (ex.: 1.000 fotos): tempo por foto na rota de processamento, erros 429 do Rekognition e custo de R2 e Rekognition
- [ ] Conferir o tipo real e limitar o tamanho dos vídeos (MP4/MOV até 500 MB e 5 minutos)
- [x] Indexar os rostos de cada foto no Rekognition ao concluir o envio e gravar em `rostos` (com a posição do rosto, para a prévia ampliada); botão no evento para cadastrar os que faltam
- [ ] Testar a busca por selfie com fotos reais; ajustar `REKOGNITION_SEMELHANCA` se aparecer foto de outra pessoa ou faltar foto certa
- [x] Banner e logo da página do fotógrafo em Minha loja (valem no link /fotografo/<endereço> e na loja)
- [ ] Anexos da denúncia no bucket privado, por URL assinada
- [ ] Envio de vídeos no painel, com upload multipart e retomada
- [ ] Worker de vídeo com FFmpeg: prévia 720p com marca d'água, miniatura e quadros para o reconhecimento (testar com vídeos reais)
- [ ] Indexar rostos e números no job (fotos e quadros de vídeo)
- [ ] Rota de busca facial real: selfie só em memória, sem log, rate limit `[R-alta]`
- [ ] Domínio de imagens na CDN da Cloudflare
- [ ] Conferir que o token do R2 tem só **Object Read & Write** nos buckets `fotos-originais` e `fotos-publicas` ([seguranca.md](seguranca.md), item 18)

## Fase 13 — Pagamento, e-mail e WhatsApp

- [x] Gateway Asaas (Pix, cartão na página do Asaas, reembolso, saque por transferência Pix com validação de saque por webhook), escolhido por `ASAAS_API_KEY`; o Mercado Pago fica como alternativa
- [ ] Criar a conta Asaas, cadastrar `ASAAS_*` na Vercel, configurar os webhooks e a validação de saque e testar Pix, cartão e saque de R$ 1,00 ([deploy.md](deploy.md), "Asaas")
- [ ] Mercado Pago registrar a chave pública do Payouts (`docs/mercadopago/payouts-chave-publica.pem`) e liberar o Payouts Pix em produção; depois ligar `MP_PAYOUTS_HABILITADO=1` `[R-alta]`
- [ ] Primeiro saque real de R$ 1,00 em produção para validar `[R-alta]`
- [ ] Conferir no Mercado Pago o prazo de liberação do dinheiro do cartão (afeta o saque antecipado); o cadastro do webhook está em **Em andamento**
- [x] E-mails pelo Resend: confirmação de conta, entrega com o link de downloads, lembrete do Pix e aviso de venda ao fotógrafo
- [ ] Verificar o domínio no Resend e cadastrar `RESEND_API_KEY` e `EMAIL_REMETENTE` na Vercel
- [ ] Entrega por WhatsApp e lembrete de carrinho abandonado pela API real (hoje simulados em `src/servicos/mensagens.ts`)
- [ ] Convite de colaborador por e-mail para quem ainda não tem conta
- [ ] Liberação agendada e aviso aos colaboradores por e-mail

## Fase 14 — Antes do lançamento

- [ ] Remover SAQUE_SEM_PRAZO_EMAILS da produção depois do teste de saque
- [x] Limite de tentativas em login e cadastro (tabela `tentativas`)
- [ ] Conferir a CSP com o Card Payment Brick de verdade (preview com as credenciais de teste do Mercado Pago), inclusive o desafio 3DS, e com o Sentry ligado
- [ ] Alertas de cobrança na Vercel, R2, Inngest, banco, provedor de reconhecimento e WhatsApp
- [x] Política de privacidade (com selfie), página Como funciona
- [ ] Revisão jurídica da política de privacidade, dos termos de uso e da política de conteúdo (rascunhos no ar, com aviso no topo), inclusive do prazo de 7 dias para problemas com a compra
- [ ] E-mail do encarregado de dados: criar a caixa e cadastrar `NEXT_PUBLIC_EMAIL_PRIVACIDADE` na Vercel
- [ ] Remover da Vercel o domínio próprio da loja quando o fotógrafo exclui a conta (hoje sai só do banco)
- [ ] Cadastrar `DATABASE_CA_CERT` (certificado raiz do Supabase, em base64) em Production e conferir que o deploy sobe ([deploy.md](deploy.md), item 3)
- [ ] Menor privilégio no banco: criar o papel `clicouai_app` no Supabase e trocar a `DATABASE_URL` da Vercel para ele, deixando o `postgres` só na `DATABASE_URL_DIRETA` (passo a passo em [seguranca.md](seguranca.md), item 18)
- [ ] Backup do banco com recuperação para um ponto no tempo; testar uma restauração num projeto separado ([seguranca.md](seguranca.md), item 15)
- [ ] Monitor de disponibilidade (UptimeRobot ou Better Stack) na página inicial, com aviso por e-mail
- [ ] Atualizar vitest (5) e drizzle-kit, que trazem as vulnerabilidades restantes do `npm audit` (só desenvolvimento e testes), e acompanhar o `braces` do CLI do shadcn
- [ ] Tornar a verificação em duas etapas obrigatória para gestor (hoje é opcional para fotógrafo e gestor)
- [ ] Recuperação de conta de quem perdeu o celular e os códigos de recuperação: hoje só pelo suporte, que confere a identidade e apaga `mfa_segredo`, `mfa_ativado_em` e os códigos no banco
- [ ] Conferir que as respostas ao e-mail do pedido (`EMAIL_REMETENTE`) chegam a uma caixa lida pela equipe: a central de ajuda manda o comprador responder o e-mail da compra
