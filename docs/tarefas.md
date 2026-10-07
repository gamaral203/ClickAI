# Tarefas — ClicouAí

Lista única do que já foi feito, do que está em andamento e do que falta. Ao concluir uma tarefa, marque `[x]` e mova para **Concluído** no mesmo commit da mudança. Os códigos entre colchetes (ex.: `[R-alta]`) apontam riscos de [riscos.md](riscos.md) que a tarefa resolve.

## Concluído

- [x] Documento de arquitetura ([arquitetura.md](arquitetura.md))
- [x] Mapa de riscos ([riscos.md](riscos.md))
- [x] Regras do projeto e padrão de commits ([CLAUDE.md](CLAUDE.md))
- [x] Repositório no GitHub
- [x] Logo e paleta de cores ([marca/marca.md](marca/marca.md))
- [x] Lista de tarefas (este arquivo)
- [x] Skill de segurança `vibe-code-security` e página de skills ([skills.md](skills.md))
- [x] Skills de interface `ui-ux-pro-max` e `motion-framer`
- [x] Iniciar o projeto Next.js com TypeScript, Tailwind, shadcn/ui, ESLint e Prettier (Next.js 16)
- [x] Aplicar as cores e a logo da marca no tema
- [x] `.gitignore` com `.env*`, source maps e chaves privadas, antes do primeiro segredo existir
- [x] Security headers no `next.config` e `productionBrowserSourceMaps: false`

## Em andamento

- [ ] Fechar as decisões em aberto (Fase 0)
- [ ] Fundação do projeto (Fase 1)

## Fase 0 — Decisões de produto

Bloqueiam a criação das contas e partes do schema.

- [ ] Gateway: Mercado Pago ou Asaas? Split automático ou repasse manual?
- [ ] Banco gerenciado: Supabase ou Neon?
- [ ] Comissão da plataforma: percentual fixo ou por plano do fotógrafo?
- [ ] Tipo de foto: só eventos, ou também banco de imagens?
- [ ] Retenção: por quanto tempo os originais ficam disponíveis após o evento?
- [ ] RAW: o cliente recebe o RAW, o JPG convertido ou os dois?
- [ ] Acesso do cliente logado: para sempre ou com prazo (ex.: 2 anos)?

## Fase 1 — Fundação

- [ ] Criar contas: Vercel, banco (região São Paulo), Cloudflare R2 e gateway
- [ ] Configurar a região `gru1` na Vercel `[R-alta]`
- [ ] Conectar o Drizzle ao banco pela URL com pooler `[R-alta]`
- [ ] Criar `.env.example` com todas as variáveis necessárias
- [ ] Validação de entrada com Zod em todas as rotas e Server Actions
- [ ] Configurar Sentry e alertas de erro desde o primeiro deploy

## Fase 2 — Dados e autenticação

- [ ] Escrever o `schema.ts` com as 8 tabelas e os índices iniciais
- [ ] Rodar a primeira migração
- [ ] Configurar o Better Auth com papéis (cliente, fotógrafo, admin)
- [ ] Cadastro de fotógrafo (perfil público, CPF/CNPJ, conta de recebimento)

## Fase 3 — Upload e processamento

- [ ] Rota que gera URL assinada de upload e cria a foto como `processando`
- [ ] Upload direto do navegador ao R2, em lote `[R-alta]`
- [ ] Upload multipart com retomada para arquivos grandes
- [ ] Pasta temporária com regra de ciclo de vida no R2 (evita órfãos)
- [ ] Job no Inngest: prévia com marca d'água e miniatura com Sharp
- [ ] Conversão de RAW com LibRaw e JPG de entrega (testar cedo com arquivos reais)
- [ ] Aplicar rotação do EXIF, converter para sRGB e remover metadados das prévias
- [ ] Conferir o tipo real do arquivo e limitar o tamanho
- [ ] Job que revisa fotos presas em `processando`

## Fase 4 — Galeria

- [ ] Página pública do evento, renderizada no servidor
- [ ] Paginação por cursor
- [ ] Domínio de imagens na CDN da Cloudflare (sem `next/image` da Vercel)
- [ ] Página da foto e busca por nome ou data

## Fase 5 — Checkout e pagamento

- [ ] Carrinho
- [ ] Servidor recalcula o total a partir do banco `[R-alta]`
- [ ] Criar pedido `pendente` e cobrança Pix/cartão com split
- [ ] Webhook com assinatura validada e idempotente `[R-alta]`
- [ ] Job que consulta no gateway os pedidos pendentes há muito tempo
- [ ] E-mail de confirmação com o link de downloads (Resend)
- [ ] Só publicar evento com conta de recebimento validada

## Fase 6 — Download e acesso

- [ ] Rota de download: confere se o item é de um pedido pago do cliente `[R-alta]`
- [ ] URL assinada de 15 minutos e registro em `downloads`
- [ ] Acesso de convidado por token com prazo
- [ ] Vincular pedidos de convidado ao criar conta com o mesmo e-mail

## Fase 7 — Painel do fotógrafo

- [ ] Gestão de eventos e fotos
- [ ] Exclusão lógica de fotos (`excluida_em`)
- [ ] Vendas, saldo e extrato de repasses
- [ ] Job de repasse mensal (se não houver split)

## Fase 8 — Antes do lançamento

- [ ] Revisar os 6 riscos de prioridade alta
- [ ] CSP completa de scripts (com nonce), depois de definir os scripts do gateway e do Sentry
- [ ] Rodar o checklist da `vibe-code-security` ([skills.md](skills.md))
- [ ] Rate limit em login, cadastro, envio de e-mail e geração de URLs assinadas
- [ ] Alertas de cobrança na Vercel, R2, Inngest e banco
- [ ] Política de privacidade, exclusão de conta e canal de remoção de fotos (LGPD)
- [ ] Backup do banco com recuperação para um ponto no tempo
- [ ] Fluxo de estorno e chargeback
