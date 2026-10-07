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

## Em andamento

- [ ] Carrinho e checkout com pagamento simulado (Fase 3)

## Decisões de produto em aberto

Podem ser fechadas a qualquer momento; as de gateway, banco, reconhecimento, WhatsApp e worker de vídeo só são necessárias na Parte B. Entre parênteses, o que a Fotto fez.

- [ ] Gateway: Mercado Pago ou Asaas? Split automático ou repasse pela plataforma? (repasse automático diário, semanal ou mensal)
- [ ] Banco gerenciado: Supabase ou Neon?
- [ ] Comissão da plataforma: percentual fixo ou por plano do fotógrafo? (10% fixos)
- [ ] Tipo de foto: só eventos, ou também banco de imagens? (só eventos)
- [ ] Retenção: por quanto tempo os originais ficam disponíveis após o evento? (indeterminado)
- [ ] Acesso do cliente logado e do convidado: para sempre ou com prazo? (para sempre)
- [ ] Provedor de reconhecimento facial e numérico: serviço pronto ou modelo próprio?
- [ ] WhatsApp: Cloud API da Meta ou parceiro? Quem paga as mensagens?
- [ ] Worker de vídeo: Fly.io ou Railway?

# Parte A — Produto com dados de exemplo

## Fase 1 — Base do app

- [ ] Validação de entrada com Zod em todas as Server Actions e rotas (regra contínua; já aplicada na galeria)
- [ ] Atualizar os tipos e os dados de exemplo para o modelo novo da arquitetura (vídeo, pastas, visibilidade, liberação, colaboradores, cupons, descontos, pacote, loja, denúncia)

## Fase 2 — Galeria (cliente)

Concluída (ver **Concluído**).

## Fase 3 — Carrinho e checkout (pagamento simulado)

- [ ] Carrinho, com itens de vários eventos
- [ ] Servidor recalcula o total a partir dos dados, nunca do navegador `[R-alta]`
- [ ] Pedido criado como `pendente` e confirmação simulada (troca pelo gateway na Fase 13)
- [ ] Tela de confirmação do pedido

## Fase 4 — Minhas compras e download (simulado)

- [ ] Área "Minhas compras", com pedidos, fotos e carrinho pendente
- [ ] Download só de item de pedido pago do próprio cliente `[R-alta]`
- [ ] Acesso de convidado por token
- [ ] Registro em `downloads`

## Fase 5 — Contas (telas)

- [ ] Telas de cadastro e login de cliente e fotógrafo (sessão simulada até a Fase 11)
- [ ] Cadastro de fotógrafo: perfil público (foto, capa, bio, redes), CPF/CNPJ, conta de recebimento
- [ ] Vincular pedidos de convidado ao criar conta com o mesmo e-mail

## Fase 6 — Painel do fotógrafo

- [ ] Gestão de eventos (rascunho, publicado, revisão, arquivado)
- [ ] Tela de upload em lote de fotos e vídeos (envio simulado até a Fase 12)
- [ ] Gestão de fotos e vídeos com exclusão lógica (`excluida_em`) `[Média]`
- [ ] Vendas, saldo disponível, saldo a receber e extrato de repasses
- [ ] Frequência de repasse: diária, semanal ou mensal
- [ ] Só publicar evento com conta de recebimento validada `[Média]`

## Fase 7 — Busca e recursos do evento

- [ ] Vídeos na galeria e na página do item, com prévia e marca d'água
- [ ] Categorias de evento e filtros por cidade e categoria
- [ ] Tela de busca facial com aviso de consentimento (resultado simulado até a Fase 12)
- [ ] Busca por número de peito
- [ ] Filtro por horário (opcional por evento)
- [ ] Lista de fotos não identificadas (opcional por evento)
- [ ] Visibilidade do evento (público, não listado, com senha) e das fotos (todas ou só após a busca)
- [ ] Liberação automática, manual e agendada, com contagem regressiva
- [ ] Pastas: criar, renomear e mover itens
- [ ] Ordenação por envio, captura, nome do arquivo ou aleatória
- [ ] Link, QR Code e compartilhamento ao publicar

## Fase 8 — Recursos de venda

- [ ] Preço por foto e por vídeo, com preço individual opcional
- [ ] Desconto progressivo por evento e regra padrão do fotógrafo
- [ ] Pacote "todas as minhas fotos", mostrado depois da busca
- [ ] Cupons: percentual, valor e fotos grátis, com limites de uso, datas, eventos e mínimo
- [ ] Regra de combinação dos descontos no servidor `[Média]`
- [ ] Colaboradores: convidar por e-mail ou usuário, comissão do dono e notas
- [ ] Divisão da venda entre plataforma, dono do evento e colaborador `[Média]`
- [ ] WhatsApp opcional no checkout, com consentimento (envio simulado até a Fase 13)
- [ ] Pedido expirado e lembrete de carrinho abandonado (envio simulado até a Fase 13)

## Fase 9 — Loja própria e moderação

- [ ] Loja própria: nome, descrição, logo, cores e subdomínio
- [ ] Google Analytics e Tag Manager só por ID `[R-alta]`
- [ ] Denúncia de evento e de foto, com motivo, anexos e contato
- [ ] Painel de admin: analisar denúncias, status `revisao` e avisos às partes

# Parte B — Integrações (por último)

## Fase 10 — Contas e infraestrutura

- [ ] Criar contas: Vercel, banco (região São Paulo), Cloudflare R2, gateway, provedor de reconhecimento e WhatsApp
- [ ] Configurar a região `gru1` na Vercel `[R-alta]`
- [ ] Criar `.env.example` com todas as variáveis necessárias
- [ ] Configurar Sentry e alertas de erro desde o primeiro deploy
- [ ] Domínio próprio das lojas verificado pela API da Vercel e resolvido no `proxy.ts`

## Fase 11 — Banco e autenticação

- [ ] Escrever o `schema.ts` com as tabelas e os índices iniciais de [arquitetura.md](arquitetura.md#modelo-de-dados)
- [ ] Conectar o Drizzle ao banco pela URL com pooler `[R-alta]`
- [ ] Rodar a primeira migração
- [ ] Implementação da camada de dados com o banco, no lugar da de exemplo
- [ ] Better Auth com papéis (cliente, fotógrafo, admin), no lugar da sessão simulada

## Fase 12 — Upload, processamento e reconhecimento

- [ ] Rota que gera URL assinada de upload e cria o item como `processando`
- [ ] Upload direto do navegador ao R2, em lote `[R-alta]`
- [ ] Upload multipart com retomada para vídeos
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

- [ ] Cobrança Pix (expira em 1 hora) ou cartão, com split no gateway
- [ ] Webhook com assinatura validada e idempotente, somando o uso do cupom na mesma transação `[R-alta]`
- [ ] Job que expira pedidos pendentes e confere no gateway antes
- [ ] E-mail de confirmação com o link de downloads (Resend)
- [ ] Entrega por WhatsApp e lembrete de carrinho abandonado
- [ ] Liberação agendada e aviso aos colaboradores por e-mail
- [ ] Repasse automático diário, semanal ou mensal (se não houver split)

## Fase 14 — Antes do lançamento

- [ ] Revisar os 8 riscos de prioridade alta
- [ ] CSP completa de scripts (com nonce), depois de definir os scripts do gateway, do Sentry e do Google Analytics/Tag Manager das lojas
- [ ] Rodar o checklist da `vibe-code-security` ([skills.md](skills.md))
- [ ] Rate limit em login, cadastro, busca facial, envio de e-mail e geração de URLs assinadas
- [ ] Alertas de cobrança na Vercel, R2, Inngest, banco, provedor de reconhecimento e WhatsApp
- [ ] Política de privacidade (com selfie e DPO), termos de uso, política de conteúdo, exclusão de conta e canal de remoção de fotos (LGPD)
- [ ] Backup do banco com recuperação para um ponto no tempo
- [ ] Fluxo de estorno e chargeback
- [ ] Central de ajuda com artigos para comprador e fotógrafo
