# ClicouAí

![ClicouAí](instrucoes/marca/logo.png)

Marketplace brasileiro onde fotógrafos vendem fotos e vídeos de eventos e clientes encontram os seus por selfie ou número de peito e compram os originais. Pagamento por Pix e cartão, em reais.

Site: [www.clicouai.com](https://www.clicouai.com) · Página para fotógrafos: [`/vender-fotos`](https://www.clicouai.com/vender-fotos)

## O que o produto faz

**Para quem compra**

- Lista de eventos com busca; dentro do evento, busca por selfie (a selfie nunca é gravada) e por número de peito
- Prévias sempre com a marca d'água gravada nos pixels; compra de fotos e vídeos com Pix ou cartão, sem precisar de cadastro
- Download do original só depois do pagamento conferido no servidor, com o link enviado por e-mail

**Para quem vende**

- Página pública com as condições e os recursos: `/vender-fotos`
- Painel com eventos, pastas, envio direto ao armazenamento, liberação automática, manual ou agendada
- Preço por foto e por vídeo, cupons, desconto por quantidade e pacotes
- Colaboradores no mesmo evento, com a divisão automática de cada venda
- Loja própria, escolha e ajuste do modelo da marca d'água, desempenho e relatório do evento, plugin do Lightroom Classic
- Financeiro com o extrato de cada venda e saque por Pix, só para a chave do próprio CPF/CNPJ

**Taxas** (regras em `src/servicos/financeiro.ts` e `src/lib/taxas.ts`): comissão de 8%, descontada no saque, sem mensalidade. Vendas no Pix ficam disponíveis em 1 dia, sem taxa extra. Vendas no cartão ficam em 30 dias, ou em 1 dia com a antecipação opcional, de 1,99%. A taxa do cartão é dividida entre o comprador e o fotógrafo.

**Para a equipe:** área de gestão (`/admin`) com eventos, finanças, saques, denúncias, usuários e painel de uso.

Ainda não está pronto: a entrega por WhatsApp é simulada, e o que falta está em [instrucoes/tarefas.md](instrucoes/tarefas.md).

## Como rodar

Requisitos: Node.js 20.9 ou mais novo e npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Sem `DATABASE_URL`, fora da produção, o app usa o PGlite: um Postgres em memória, com as mesmas migrações e dados de exemplo, recriado a cada início do servidor. Contas de exemplo, só nesse modo (senha `clicouai123`): `ana@exemplo.com` (cliente), `lia@exemplo.com` (fotógrafa) e `admin@exemplo.com` (gestão).

As integrações são configuradas por variáveis de ambiente, explicadas em [`.env.example`](.env.example): Mercado Pago, Google, Cloudflare R2, Amazon Rekognition e Resend. Sem credenciais, o que depende delas é simulado ou fica desligado.

> **Cuidado:** com `DATABASE_URL` no `.env.local`, `npm run dev` e `npm run build` usam esse banco, e o build roda as migrações. Se ele apontar para a produção, deixe as variáveis de banco vazias ao rodar na sua máquina.

| Comando                | O que faz                                              |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Servidor de desenvolvimento                            |
| `npm run build`        | Aplica as migrações e faz o build de produção          |
| `npm run start`        | Sobe o build de produção                               |
| `npm run lint`         | ESLint                                                 |
| `npm run test`         | Testes (Vitest)                                        |
| `npm run typecheck`    | Gera os tipos de rota do Next e confere os tipos       |
| `npm run format`       | Formata o código com Prettier                          |
| `npm run format:check` | Confere a formatação sem alterar arquivos              |
| `npm run db:gerar`     | Gera uma migração a partir de `src/db/schema.ts`       |
| `npm run db:migrar`    | Aplica as migrações no banco configurado               |

## Stack

Next.js 16 (App Router) e TypeScript, Tailwind CSS 4 e shadcn/ui (Base UI), Motion, PostgreSQL (Supabase; PGlite no desenvolvimento e nos testes) com Drizzle, Cloudflare R2, Sharp e FFmpeg, Amazon Rekognition, Mercado Pago, Resend, Sentry e Zod. Hospedagem na Vercel (região `gru1`), com os jobs agendados pelo GitHub Actions ([`.github/workflows/jobs.yml`](.github/workflows/jobs.yml)).

## Estrutura

```
src/
  proxy.ts      # CSP com nonce e host das lojas próprias
  app/
    (publico)/  # inicial, eventos, foto, ajuda, páginas legais, vender-fotos
    (acesso)/   # login
    (cliente)/  # carrinho, checkout, minhas compras, conta
    (fotografo)/painel/
    (admin)/    # área de gestão
    loja/       # lojas próprias
    api/        # busca facial, envios, downloads, webhooks, jobs, plugin
  components/   # interface
  dados/        # camada de dados usada pelas telas
  db/           # schema e migrações
  lib/          # utilitários e clientes de serviços
  servicos/     # regras de negócio
plugin-lightroom/  # plugin do Lightroom Classic
scripts/           # migração e ferramentas
instrucoes/        # documentação do projeto
```

## Documentação

- [Arquitetura](instrucoes/arquitetura.md): stack, armazenamento, modelo de dados e fluxos
- [Segurança](instrucoes/seguranca.md): checklist e estado de cada item
- [Riscos](instrucoes/riscos.md): riscos mapeados, com prioridade e como evitar
- [Tarefas](instrucoes/tarefas.md): o que foi feito e o que falta
- [Deploy](instrucoes/deploy.md): contas e variáveis de produção
- [Marca](instrucoes/marca/marca.md): logo, cores e regras de contraste
- [Skills](instrucoes/skills.md): skills do Claude Code usadas no projeto
- [Instruções do projeto](instrucoes/CLAUDE.md): regras que não podem ser quebradas e padrão de commits

## Como contribuir

- Leia [instrucoes/CLAUDE.md](instrucoes/CLAUDE.md) antes de começar.
- Commits seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), em português: `feat(galeria): cria a página da foto`.
- Ao concluir uma tarefa, marque em [instrucoes/tarefas.md](instrucoes/tarefas.md) no mesmo commit.
- Antes de abrir um PR: `npm run lint`, `npm run test`, `npm run format:check` e `npm run build`, sem erros.
