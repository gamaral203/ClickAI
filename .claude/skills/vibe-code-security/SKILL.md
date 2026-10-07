---
name: vibe-code-security
description: Aplica um checklist de segurança contra vazamentos e vulnerabilidades comuns sempre que Claude gera, revisa ou faz deploy de código para um site/app — especialmente em contextos de "vibe coding" (Cursor, Lovable, Bolt, v0, ou qualquer código gerado por IA em resposta a um pedido rápido). Use isso SEMPRE que o usuário pedir para criar um site, app, API, formulário de login, checkout, upload de arquivo, integração com Supabase/Firebase, endpoint de IA, ou qualquer funcionalidade que toque em auth, pagamento, dados de usuário ou chaves de API — mesmo que o usuário não peça "segurança" explicitamente. Também use ao revisar código existente ("dá uma olhada nesse código", "isso tá pronto pra produção?") ou antes de qualquer deploy.
---

# Vibe Code Security

Guia de referência rápida para não vazar segredos e não deployar vulnerabilidades óbvias em código gerado por IA. Baseado em problemas reais e recorrentes de apps "vibe coded".

## Princípio central

Código gerado por IA (inclusive por mim) funciona no caminho feliz, mas não conhece o contexto de produção, quem são os usuários, nem os riscos do negócio. **"Funciona" ≠ "seguro"**. Toda vez que eu gerar uma rota, endpoint, upload, checkout ou integração, devo aplicar as regras abaixo por padrão — não esperar o usuário pedir.

## Como usar esta skill

1. Ao gerar qualquer código que toque uma das áreas abaixo, aplique a versão "CERTO" diretamente — não gere a versão insegura "pra simplificar" e deixe o aviso pro usuário.
2. Ao revisar código (próprio ou do usuário), rode mentalmente o checklist de `references/checklist.md` e aponte qualquer item que falhe, com o trecho exato do problema.
3. Antes de qualquer deploy, apresente o checklist final e peça confirmação de cada item que não pôde ser verificado automaticamente (ex: alertas de billing configurados no provedor).
4. Para padrões de código detalhados (certo/errado) por categoria, consulte `references/patterns.md` — carregue a seção relevante conforme o que está sendo construído (ex: só a seção de Payments se o pedido for um checkout).

## Categorias cobertas (visão geral)

| Categoria | Regra de ouro |
|---|---|
| Secrets & .gitignore | Nunca hardcode chave/senha/token. `.env` sempre no `.gitignore`. Nunca commitar. |
| Preços/Pagamento | Preço e valor de cobrança SEMPRE decididos no servidor, nunca aceitos do cliente. |
| Tokens de auth | Nunca em `localStorage`/`sessionStorage`. Usar cookie `HttpOnly` + `Secure` + `SameSite`, ou `SecureStore`/Keychain no mobile. |
| Upload de arquivo | Validar tipo por magic bytes (não extensão), limitar tamanho, reprocessar imagem, gerar nome de arquivo no servidor (UUID). |
| Supabase/Postgres | RLS habilitado em toda tabela pública. Nunca `USING(true)` sem querer. Service Role key nunca no frontend. |
| Rate limits | Login, signup, endpoints de IA e de email sempre limitados — contador no servidor, nunca no cliente. |
| Budget caps (IA) | `max_tokens` obrigatório em toda chamada de IA. Alertas de billing configurados. Tracking de uso por usuário. |
| Injections | Nunca concatenar string em query SQL (usar query parametrizada/ORM). Validar input com Zod/Yup. Sanitizar output de IA antes de renderizar como HTML. Ter proteção básica contra prompt injection. |
| Auth & Authorization | `jwt.verify()`, nunca `jwt.decode()` sem verificar assinatura. Autorização checada em CADA endpoint, não só autenticação. |
| Mobile | Nenhuma API key no bundle JS — tudo passa por um BFF (backend próprio). Deep links só navegam, nunca executam ação sensível direto. |
| Deployment | Debug mode e stack traces desligados em produção. Source maps desabilitados. Security headers (helmet). Pasta `.git` bloqueada no servidor web. |

Detalhes e exemplos de código (certo vs. errado) de cada linha dessa tabela: ver `references/patterns.md`.
Checklist completo para rodar antes de deploy: ver `references/checklist.md`.
