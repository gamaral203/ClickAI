# Skills — ClicouAí

Skills são instruções que o Claude Code carrega sozinho quando a tarefa combina com a descrição delas. As skills do projeto ficam em [`.claude/skills/`](../.claude/skills/) e valem para qualquer pessoa que clonar o repositório e usar o Claude Code.

## Skills do projeto

| Skill | O que faz | Quando é usada |
|---|---|---|
| [vibe-code-security](../.claude/skills/vibe-code-security/SKILL.md) | Checklist de segurança contra vazamento de segredos e vulnerabilidades comuns em código gerado por IA | Ao criar ou revisar rotas, upload, login, checkout, integrações com chaves de API e antes de qualquer deploy |

### vibe-code-security

Arquivos:

- [SKILL.md](../.claude/skills/vibe-code-security/SKILL.md): regras por categoria
- [references/checklist.md](../.claude/skills/vibe-code-security/references/checklist.md): checklist antes do deploy
- [references/patterns.md](../.claude/skills/vibe-code-security/references/patterns.md): exemplos de código certo e errado

**Como ela se aplica ao ClicouAí.** A skill é genérica; algumas seções valem direto, outras mudam por causa da nossa stack:

| Seção da skill | No ClicouAí |
|---|---|
| Secrets e `.gitignore` | Vale direto. Chaves do R2, do gateway, do banco e do Resend só em variáveis de ambiente da Vercel. |
| Preços e pagamento | Vale direto (já é regra do projeto). Onde a skill fala de Stripe, leia Asaas ou Mercado Pago: preço vem do banco, webhook com assinatura validada. |
| Tokens de auth | O Better Auth já usa cookie `HttpOnly`. Não guardar token em `localStorage`. |
| Upload | Vale direto: tipo real por magic bytes no job, limite de tamanho, reprocessar com Sharp, nome do arquivo é o UUID da foto. |
| Supabase / RLS | O banco só é acessado pelo servidor via Drizzle, sem chave pública no navegador, então RLS não é obrigatório. Se o Supabase for escolhido, nunca expor a `service_role` e nunca usar o cliente do Supabase no navegador para dados. |
| Rate limits | Vale para login, cadastro, envio de e-mail, geração de URL de upload e de download. |
| Budget caps (IA) | Não se aplica no MVP (sem chamadas de IA). Passa a valer se entrar busca por rosto. Configurar alertas de cobrança na Vercel, R2 e Inngest. |
| Injections | Drizzle já parametriza as queries. Validar toda entrada com Zod. Não usar `sql.raw` com dado do usuário. |
| Auth e autorização | Vale direto: cada rota e cada Server Action confere se o usuário pode mexer naquele evento, foto ou pedido. |
| Mobile | Fora do MVP. |
| Deployment | Security headers no `next.config`, `productionBrowserSourceMaps: false`, erros sem stack trace para o usuário. |

## Skills pessoais (fora do repositório)

Cada pessoa pode ter skills próprias na conta do Claude, que não entram no projeto. Exemplo: `js-especialista` (do @gabriel) explica JavaScript comparando com Java. Ela fica fora do repositório porque foi escrita para uma pessoa só.

## Como adicionar uma skill ao projeto

1. Crie a pasta `.claude/skills/<nome-da-skill>/` com um `SKILL.md` (frontmatter `name` e `description`) e, se precisar, uma pasta `references/`.
2. Adicione uma linha na tabela "Skills do projeto" desta página.
3. Faça commits separados: `chore(claude): adiciona a skill <nome>` para a skill e `docs: ...` para esta página.
