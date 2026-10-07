# ClicouAí — Plataforma de Venda de Fotos

Marketplace onde fotógrafos vendem fotos de eventos e clientes compram os originais. Mercado brasileiro (reais, Pix e cartão, dados no Brasil).

## Documentação

Ler antes de implementar qualquer parte do sistema:

- [arquitetura.md](arquitetura.md) — stack, armazenamento no R2, modelo de dados, fluxos (upload, galeria, compra, download), segurança/LGPD, estrutura de pastas e decisões em aberto.
- [marca/marca.md](marca/marca.md) — logo, cores (`#2362FE` azul, `#BCFA34` limão) e regras de contraste. Usar ao criar qualquer tela.
- [riscos.md](riscos.md) — 20 riscos com como evitar e prioridade. Os 6 de prioridade alta precisam estar resolvidos antes do lançamento.
- [skills.md](skills.md) — skills do projeto (em `.claude/skills/`) e como cada uma se aplica à nossa stack. Ao gerar ou revisar código de rotas, upload, auth, checkout ou deploy, aplicar a `vibe-code-security`.

Se uma decisão de código mudar algo descrito nesses documentos, atualize o documento junto.

## Tarefas

[tarefas.md](tarefas.md) é a lista única do que foi feito e do que falta. Antes de começar algo, confira a lista; ao terminar uma tarefa, marque `[x]` e mova para **Concluído** no mesmo commit da mudança. Tarefas novas que surgirem entram na fase certa.

## Regras que não podem ser quebradas

- Nenhum original fica acessível sem um pedido pago. Bucket de originais é privado; download só por URL assinada de ~15 min, depois de conferir que o item pertence a um pedido pago do próprio cliente.
- Pagamento só é confirmado pelo webhook do gateway (assinatura validada, idempotente por `pedidos.gateway_id` único), nunca pelo retorno do navegador.
- O servidor recalcula o total do pedido a partir do banco; preço vindo do navegador é ignorado.
- Upload vai direto do navegador ao R2 por URL assinada; arquivos nunca passam pelo Next.js.
- Dinheiro em centavos (inteiro); IDs em UUID.
- Fotos são excluídas de forma lógica (`fotos.excluida_em`); quem comprou continua baixando.
- Funções da Vercel na região `gru1`; banco acessado pela URL com pooler.

## Commits

Todo commit segue o padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

```
<tipo>(<escopo opcional>): <descrição>

<corpo opcional: o porquê da mudança>
```

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade para o usuário |
| `fix` | Correção de bug |
| `docs` | Só documentação (`docs/`, README, CLAUDE.md) |
| `refactor` | Mudança de código que não altera comportamento |
| `perf` | Melhoria de desempenho |
| `test` | Adiciona ou corrige testes |
| `style` | Formatação, sem mudança de lógica |
| `build` | Dependências, configuração de build ou deploy |
| `ci` | Pipelines de CI |
| `chore` | Tarefas de manutenção que não se encaixam acima |

Regras:

- Descrição em português, no presente, em minúsculas, sem ponto final, com até ~72 caracteres: `feat(upload): adiciona geração de URL assinada para o R2`.
- Escopo é a área afetada, de preferência uma destas: `upload`, `galeria`, `checkout`, `webhook`, `download`, `repasse`, `auth`, `db`, `jobs`, `ui`.
- Um commit por mudança lógica; não misturar `feat` com `refactor` ou formatação no mesmo commit.
- Mudança que quebra compatibilidade (schema, API, URL pública) leva `!` depois do tipo e um rodapé `BREAKING CHANGE: <o que muda>`.
- Use o corpo para explicar o porquê quando não for óbvio, principalmente em mudanças ligadas aos riscos de [riscos.md](riscos.md).

Exemplos:

```
feat(checkout): cria pedido pendente e cobrança Pix no gateway
fix(webhook): ignora notificação repetida do mesmo pagamento
docs: adiciona arquitetura e mapa de riscos
refactor(db)!: renomeia fotos.chave_previa para chave_preview

BREAKING CHANGE: exige rodar a migração 0004 antes do deploy
```

## Stack

Next.js (App Router) + TypeScript, PostgreSQL (Supabase ou Neon) com Drizzle, Cloudflare R2, Sharp + LibRaw, Inngest, Better Auth, Mercado Pago ou Asaas, Tailwind + shadcn/ui, Resend.
