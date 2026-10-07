# Tarefas — ClicouAí

Lista única do que já foi feito, do que está em andamento e do que falta. Ao concluir uma tarefa, marque `[x]` e mova para **Concluído** no mesmo commit da mudança. Os códigos entre colchetes (ex.: `[R-alta]`) apontam riscos de [riscos.md](riscos.md) que a tarefa resolve.

**Ordem do projeto:** primeiro o produto inteiro com dados de exemplo, atrás de uma camada de dados (`src/dados/`). As integrações (banco, login real, R2, processamento de imagem, gateway, e-mail) ficam por último, quando formos testar com fotos reais; nesse momento a camada de dados de exemplo é trocada pela do banco, sem mexer nas telas.

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

- [ ] Base do app com dados de exemplo (Fase 1)

## Decisões de produto em aberto

Podem ser fechadas a qualquer momento; as de gateway e banco só são necessárias na Parte B.

- [ ] Gateway: Mercado Pago ou Asaas? Split automático ou repasse manual?
- [ ] Banco gerenciado: Supabase ou Neon?
- [ ] Comissão da plataforma: percentual fixo ou por plano do fotógrafo?
- [ ] Tipo de foto: só eventos, ou também banco de imagens?
- [ ] Retenção: por quanto tempo os originais ficam disponíveis após o evento?
- [ ] RAW: o cliente recebe o RAW, o JPG convertido ou os dois?
- [ ] Acesso do cliente logado: para sempre ou com prazo (ex.: 2 anos)?

# Parte A — Produto com dados de exemplo

## Fase 1 — Base do app

- [ ] Tipos do domínio (evento, foto, pedido…) espelhando o modelo de dados da arquitetura
- [ ] Camada de dados em `src/dados/` com implementação de exemplo (troca pelo banco na Fase 8)
- [ ] Layout comum: cabeçalho com logo e navegação, rodapé
- [ ] Validação de entrada com Zod em todas as Server Actions e rotas

## Fase 2 — Galeria (cliente)

- [ ] Lista de eventos com busca por nome ou data
- [ ] Página do evento, renderizada no servidor
- [ ] Paginação por cursor
- [ ] Página da foto
- [ ] Prévias servidas sem otimização da Vercel (`next/image` sem otimizador) — custo `[Baixa]`

## Fase 3 — Carrinho e checkout (pagamento simulado)

- [ ] Carrinho
- [ ] Servidor recalcula o total a partir dos dados, nunca do navegador `[R-alta]`
- [ ] Pedido criado como `pendente` e confirmação simulada (troca pelo gateway na Fase 10)
- [ ] Tela de confirmação do pedido

## Fase 4 — Minhas compras e download (simulado)

- [ ] Área "Minhas compras"
- [ ] Download só de item de pedido pago do próprio cliente `[R-alta]`
- [ ] Acesso de convidado por token com prazo
- [ ] Registro em `downloads`

## Fase 5 — Contas (telas)

- [ ] Telas de cadastro e login de cliente e fotógrafo (sessão simulada até a Fase 8)
- [ ] Cadastro de fotógrafo: perfil público, CPF/CNPJ, conta de recebimento
- [ ] Vincular pedidos de convidado ao criar conta com o mesmo e-mail

## Fase 6 — Painel do fotógrafo

- [ ] Gestão de eventos (rascunho, publicado, arquivado)
- [ ] Tela de upload em lote (envio simulado até a Fase 9)
- [ ] Gestão de fotos com exclusão lógica (`excluida_em`) `[Média]`
- [ ] Vendas, saldo e extrato de repasses
- [ ] Só publicar evento com conta de recebimento validada `[Média]`

# Parte B — Integrações (por último)

## Fase 7 — Contas e infraestrutura

- [ ] Criar contas: Vercel, banco (região São Paulo), Cloudflare R2 e gateway
- [ ] Configurar a região `gru1` na Vercel `[R-alta]`
- [ ] Criar `.env.example` com todas as variáveis necessárias
- [ ] Configurar Sentry e alertas de erro desde o primeiro deploy

## Fase 8 — Banco e autenticação

- [ ] Escrever o `schema.ts` com as 8 tabelas e os índices iniciais
- [ ] Conectar o Drizzle ao banco pela URL com pooler `[R-alta]`
- [ ] Rodar a primeira migração
- [ ] Implementação da camada de dados com o banco, no lugar da de exemplo
- [ ] Better Auth com papéis (cliente, fotógrafo, admin), no lugar da sessão simulada

## Fase 9 — Upload e processamento

- [ ] Rota que gera URL assinada de upload e cria a foto como `processando`
- [ ] Upload direto do navegador ao R2, em lote `[R-alta]`
- [ ] Upload multipart com retomada para arquivos grandes
- [ ] Pasta temporária com regra de ciclo de vida no R2 (evita órfãos)
- [ ] Job no Inngest: prévia com marca d'água e miniatura com Sharp
- [ ] Conversão de RAW com LibRaw e JPG de entrega (testar com arquivos reais)
- [ ] Aplicar rotação do EXIF, converter para sRGB e remover metadados das prévias
- [ ] Conferir o tipo real do arquivo e limitar o tamanho
- [ ] Job que revisa fotos presas em `processando`
- [ ] Domínio de imagens na CDN da Cloudflare
- [ ] Download real por URL assinada de 15 minutos

## Fase 10 — Pagamento e e-mail

- [ ] Cobrança Pix/cartão com split no gateway
- [ ] Webhook com assinatura validada e idempotente `[R-alta]`
- [ ] Job que consulta no gateway os pedidos pendentes há muito tempo
- [ ] E-mail de confirmação com o link de downloads (Resend)
- [ ] Job de repasse mensal (se não houver split)

## Fase 11 — Antes do lançamento

- [ ] Revisar os 6 riscos de prioridade alta
- [ ] CSP completa de scripts (com nonce), depois de definir os scripts do gateway e do Sentry
- [ ] Rodar o checklist da `vibe-code-security` ([skills.md](skills.md))
- [ ] Rate limit em login, cadastro, envio de e-mail e geração de URLs assinadas
- [ ] Alertas de cobrança na Vercel, R2, Inngest e banco
- [ ] Política de privacidade, exclusão de conta e canal de remoção de fotos (LGPD)
- [ ] Backup do banco com recuperação para um ponto no tempo
- [ ] Fluxo de estorno e chargeback
