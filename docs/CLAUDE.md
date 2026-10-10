# ClicouAí — Plataforma de Venda de Fotos

Marketplace onde fotógrafos vendem fotos e vídeos de eventos e clientes encontram os seus por selfie ou número de peito e compram os originais. Mercado brasileiro (reais, Pix e cartão, dados no Brasil).

## Documentação

Ler antes de implementar qualquer parte do sistema:

- [arquitetura.md](arquitetura.md) — stack, armazenamento no R2, modelo de dados, fluxos (upload, busca, galeria, compra, descontos, download, repasse, loja, denúncia), segurança/LGPD, estrutura de pastas e decisões em aberto.
- [referencias/fotto.md](referencias/fotto.md) — como funciona a Fotto, nossa referência de produto. Consultar ao desenhar um fluxo ou tela; ela orienta, mas quem decide é a arquitetura. Nunca copiar textos, telas ou visual da Fotto.
- [marca/marca.md](marca/marca.md) — logo, cores (`#2362FE` azul, `#B8FF32` limão) e regras de contraste. Usar ao criar qualquer tela.
- [riscos.md](riscos.md) — 35 riscos com como evitar e prioridade. Os 10 de prioridade alta precisam estar resolvidos antes do lançamento.
- [seguranca.md](seguranca.md) — checklist de segurança de 19 itens (HTTPS, senhas, MFA, limites, validação, sessão, segredos, backups, menor privilégio, monitoramento…) com o estado de cada um, onde está no código e os passos que dependem de configuração.
- [skills.md](skills.md) — skills do projeto (em `.claude/skills/`) e como cada uma se aplica à nossa stack. Ao gerar ou revisar código de rotas, upload, auth, checkout ou deploy, aplicar a `vibe-code-security`; ao criar telas, a `ui-ux-pro-max` (a marca vence as paletas sugeridas por ela); ao animar, a `motion-framer` (usando o pacote `motion`).

Se uma decisão de código mudar algo descrito nesses documentos, atualize o documento junto.

## Tarefas

[tarefas.md](tarefas.md) é a lista única do que foi feito e do que falta. Antes de começar algo, confira a lista; ao terminar uma tarefa, marque `[x]` e mova para **Concluído** no mesmo commit da mudança. Tarefas novas que surgirem entram na fase certa.

## Regras que não podem ser quebradas

- Nenhum original fica acessível sem um pedido pago. Bucket de originais é privado; download só por URL assinada de ~15 min, depois de conferir que o item pertence a um pedido pago do próprio cliente.
- Pagamento só é confirmado depois que o servidor lê a order na API do Mercado Pago e confere a referência e o valor (pelo webhook com assinatura validada ou pela conferência do servidor), de forma idempotente por `pedidos.gateway_id` único; nunca pelo retorno do navegador nem pelo corpo do webhook.
- Saque só vai para a chave Pix do próprio CPF/CNPJ do fotógrafo, com valor calculado no servidor e idempotência pelo id do saque. Saque sem resposta fica em `processando`; nunca devolver o saldo sem ter certeza de que o Pix não saiu.
- O servidor recalcula o total do pedido a partir do banco; preço vindo do navegador é ignorado.
- Upload vai direto do navegador ao R2 por URL assinada; arquivos nunca passam pelo Next.js.
- A selfie da busca facial nunca é gravada: nem no banco, nem no R2, nem em logs. Só vai ao provedor de reconhecimento, durante a busca.
- A loja própria do fotógrafo não aceita HTML nem script; Google Analytics e Tag Manager entram só pelo ID.
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
- Escopo é a área afetada, de preferência uma destas: `upload`, `video`, `busca`, `galeria`, `checkout`, `descontos`, `webhook`, `download`, `whatsapp`, `repasse`, `loja`, `denuncia`, `auth`, `admin`, `db`, `jobs`, `ui`.
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

Next.js (App Router) + TypeScript, PostgreSQL (Supabase, região São Paulo, só como banco; PGlite em memória no desenvolvimento local e nos testes) com Drizzle, Cloudflare R2, Sharp, FFmpeg (worker de vídeo), provedor de reconhecimento facial e numérico (a decidir), Inngest, Better Auth, Mercado Pago (Orders e Payouts), Tailwind + shadcn/ui, Resend, API oficial do WhatsApp.
