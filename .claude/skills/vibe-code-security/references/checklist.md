# Checklist Final — Antes do Deploy

Rode esta lista antes de considerar qualquer site/app gerado por IA pronto para produção.

## Basics
- [ ] Código gerado por IA revisado por humano
- [ ] `.gitignore` inclui `.env`, source maps, chaves privadas
- [ ] Nenhum segredo hardcoded no código
- [ ] Preços definidos apenas no servidor
- [ ] Tokens de auth em cookies `HttpOnly` (não `localStorage`)

## Upload
- [ ] Validação de tipo por magic bytes (não apenas extensão)
- [ ] Limite de tamanho de arquivo
- [ ] Imagens reprocessadas com sharp/pillow
- [ ] Nomes de arquivo sanitizados (UUID gerado no servidor)

## Supabase / Banco de dados
- [ ] RLS habilitado em todas as tabelas públicas
- [ ] Policies `USING` e `WITH CHECK` corretas
- [ ] Sem policies `USING(true)` não intencionais
- [ ] Dados sensíveis em tabelas separadas
- [ ] Service Role key nunca no frontend

## Auth & Authorization
- [ ] `jwt.verify()`, nunca `jwt.decode()` sem verificar
- [ ] Autorização verificada em cada endpoint (não só autenticação)
- [ ] Server Actions (Next.js) protegidos
- [ ] Tokens em cookies `HttpOnly`

## Rate limits
- [ ] Endpoints de login/signup limitados
- [ ] Endpoints de AI limitados
- [ ] Endpoints de email limitados
- [ ] Contadores de rate limit no servidor (nunca no cliente)

## Budget caps
- [ ] Alertas de billing configurados em todos os provedores
- [ ] `max_tokens` definido em todas as chamadas de AI
- [ ] Tracking de uso por usuário implementado

## Injections
- [ ] Nenhuma query SQL construída por concatenação de strings
- [ ] Sem `$queryRawUnsafe` (Prisma) com input de usuário
- [ ] Input de usuário validado com Zod/Yup antes de usar em queries
- [ ] Proteção básica contra prompt injection
- [ ] Output de AI sanitizado antes de renderizar como HTML

## Payments
- [ ] Preços determinados pelo servidor
- [ ] Webhook do Stripe verificando assinatura
- [ ] Subscription status atualizado via webhook

## Mobile
- [ ] Sem API keys no bundle JS
- [ ] Tokens em `SecureStore` (não `AsyncStorage`)
- [ ] Deep links validados, não executam ações automaticamente

## Deployment
- [ ] Stack traces não expostos em produção
- [ ] Source maps desabilitados em produção
- [ ] Security headers configurados (helmet/next.config.js)
- [ ] Pasta `.git` não acessível via HTTP
- [ ] Variáveis de ambiente em serviço seguro (não no código)

---

## Recursos para aprofundar
- Vibe Security Skill — https://github.com/raroque/vibe-security-skill/tree/main
- OWASP Top 10 — https://owasp.org/Top10/
- OWASP Top 10 for LLMs — https://genai.owasp.org/llm-top-10/
- Supabase RLS Docs — https://supabase.com/docs/guides/database/postgres/row-level-security
- HackTricks — https://book.hacktricks.xyz
