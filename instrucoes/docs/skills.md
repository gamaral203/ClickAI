# Skills — ClicouAí

Skills são instruções que o Claude Code carrega sozinho quando a tarefa combina com a descrição delas. As skills do projeto ficam em [`.claude/skills/`](../.claude/skills/) e valem para qualquer pessoa que clonar o repositório e usar o Claude Code.

## Skills do projeto

| Skill | O que faz | Quando é usada |
|---|---|---|
| [vibe-code-security](../.claude/skills/vibe-code-security/SKILL.md) | Checklist de segurança contra vazamento de segredos e vulnerabilidades comuns em código gerado por IA | Ao criar ou revisar rotas, upload, login, checkout, integrações com chaves de API e antes de qualquer deploy |
| [ui-ux-pro-max](../.claude/skills/ui-ux-pro-max/SKILL.md) | Base de regras de UI/UX (acessibilidade, layout, tipografia, cor, formulários, navegação) com busca local de estilos, paletas e boas práticas por stack | Ao criar ou revisar telas e componentes |
| [motion-framer](../.claude/skills/motion-framer/SKILL.md) | Guia da biblioteca Motion (antiga Framer Motion) para animações em React | Ao criar micro-interações, transições e animações de lista ou galeria |

Origem e licença: `vibe-code-security` veio de um arquivo `.skill`; `ui-ux-pro-max` de [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT); `motion-framer` de [freshtechbro/claudedesignskills](https://github.com/freshtechbro/claudedesignskills) (MIT). As licenças estão dentro de cada pasta.

### vibe-code-security

Arquivos:

- [SKILL.md](../.claude/skills/vibe-code-security/SKILL.md): regras por categoria
- [references/checklist.md](../.claude/skills/vibe-code-security/references/checklist.md): checklist antes do deploy
- [references/patterns.md](../.claude/skills/vibe-code-security/references/patterns.md): exemplos de código certo e errado

**Como ela se aplica ao ClicouAí.** A skill é genérica; algumas seções valem direto, outras mudam por causa da nossa stack:

| Seção da skill | No ClicouAí |
|---|---|
| Secrets e `.gitignore` | Vale direto. Chaves do R2, do gateway, do banco e do Resend só em variáveis de ambiente da Vercel. |
| Preços e pagamento | Vale direto (já é regra do projeto). Onde a skill fala de Stripe, leia Mercado Pago: preço vem do banco, webhook com assinatura validada. |
| Tokens de auth | O Better Auth já usa cookie `HttpOnly`. Não guardar token em `localStorage`. |
| Upload | Vale direto: tipo real por magic bytes no job, limite de tamanho, reprocessar com Sharp, nome do arquivo é o UUID da foto. |
| Supabase / RLS | O banco só é acessado pelo servidor via Drizzle, sem chave pública no navegador, então RLS não é obrigatório. Se o Supabase for escolhido, nunca expor a `service_role` e nunca usar o cliente do Supabase no navegador para dados. |
| Rate limits | Vale para login, cadastro, envio de e-mail, busca facial, geração de URL de upload e de download. Contados no banco por `src/servicos/limites.ts` (nunca em memória: cada requisição pode cair num servidor diferente). |
| Budget caps (IA) | Não se aplica no MVP (sem chamadas de IA). Passa a valer se entrar busca por rosto. Configurar alertas de cobrança na Vercel, R2 e Inngest. |
| Injections | Drizzle já parametriza as queries. Validar toda entrada com Zod. Não usar `sql.raw` com dado do usuário. |
| Auth e autorização | Vale direto: cada rota e cada Server Action confere se o usuário pode mexer naquele evento, foto ou pedido. |
| Mobile | Fora do MVP. |
| Deployment | Security headers no `next.config`, `productionBrowserSourceMaps: false`, erros sem stack trace para o usuário. |

### ui-ux-pro-max

**Como ela se aplica ao ClicouAí:**

- A identidade visual já existe: a marca ([marca/marca.md](marca/marca.md)) vence qualquer paleta ou fonte sugerida pela skill. Use a skill para regras de UX, acessibilidade e layout, não para trocar as cores.
- Stack para as buscas: `nextjs` e `shadcn`.
- Ela traz um script de busca em Python (`scripts/search.py`), rodado a partir da raiz do projeto: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<busca>" --domain ux`. No modo automático do Claude Code, a execução desse script pode ser bloqueada por ser código baixado de fora; nesse caso, libere a permissão ou use só os arquivos de `references/`, que não precisam do script.
- Mudança feita no original: o caminho `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/` virou `.claude/skills/ui-ux-pro-max/`, porque essa variável só existe quando a skill é instalada como plugin.

### motion-framer

**Como ela se aplica ao ClicouAí:**

- A skill usa o pacote antigo `framer-motion`. Aqui, ao instalar, use o pacote `motion` e importe de `motion/react` (a API é a mesma).
- Todo componente animado é Client Component (`"use client"`); páginas da galeria continuam renderizadas no servidor.
- Respeitar `useReducedMotion` em toda animação.
- Na galeria com milhares de fotos, evitar `layout` em cada miniatura (custo alto); animar só opacidade e transform.
- A pasta `assets/starter_motion` (app de exemplo em Vite com React 18) foi removida por não servir para este projeto.

## Skills pessoais (fora do repositório)

Cada pessoa pode ter skills próprias na conta do Claude, que não entram no projeto. Exemplo: `js-especialista` (do @gabriel) explica JavaScript comparando com Java. Ela fica fora do repositório porque foi escrita para uma pessoa só.

## Como adicionar uma skill ao projeto

1. Crie a pasta `.claude/skills/<nome-da-skill>/` com um `SKILL.md` (frontmatter `name` e `description`) e, se precisar, uma pasta `references/`.
2. Adicione uma linha na tabela "Skills do projeto" desta página.
3. Faça commits separados: `chore(claude): adiciona a skill <nome>` para a skill e `docs: ...` para esta página.
