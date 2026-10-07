# ClicouAí

![ClicouAí](docs/marca/logo.png)

Marketplace onde fotógrafos vendem fotos e vídeos de eventos e clientes encontram os seus por selfie ou número de peito e compram os originais. Pagamento por Pix e cartão, dados hospedados no Brasil.

## Status

O projeto está na **Parte A**: o produto inteiro sendo construído com dados de exemplo, atrás de uma camada de dados (`src/dados/`). As integrações (banco, login real, R2, processamento no servidor, reconhecimento facial e numérico, gateway de pagamento, e-mail e WhatsApp) ficam para a **Parte B**, quando formos testar com fotos reais. Na troca, só a camada de dados muda; as telas continuam iguais.

O que já funciona:

- Página inicial com carrossel (fotos horizontais no computador, verticais no celular) e os eventos recentes com busca; lista de eventos com busca por nome, cidade ou fotógrafo (sem diferenciar acentos) e filtro por data
- Busca por selfie e por número de peito na página do evento (Amazon Rekognition com credenciais da AWS; rostos de exemplo sem elas)
- Página do evento com galeria paginada por cursor e botão "Carregar mais fotos", e aviso quando a galeria está fechada (aguardando liberação, com senha ou só após a busca)
- Página da foto com a prévia grande, preço e navegação para a foto anterior e a próxima
- Prévias e miniaturas com a marca d'água gravada nos pixels, rotação do EXIF corrigida e metadados (GPS, câmera) removidos
- Carrinho e checkout com Mercado Pago (Pix e cartão dentro do site, webhook e conferência na API) ou pagamento simulado sem credenciais; download do original só para pedido pago
- Vendas e saques do fotógrafo: saldo bruto, saque normal (30 dias, 10%) e antecipado (1 dia, 11%) por Pix para o CPF/CNPJ, simulado sem credenciais
- Cadastro e login com Google ou com e-mail e senha, confirmação de e-mail, Minhas compras e perfil do fotógrafo
- Painel de gestão (`/admin`) para gestores: entradas, saídas, receita, vendas, saques e usuários com troca de papel
- Headers de segurança e validação com Zod de tudo que vem do navegador

O andamento completo, fase por fase, está em [docs/tarefas.md](docs/tarefas.md).

**Contas de exemplo** (senha `clicouai123`): `ana@exemplo.com` (cliente), `lia@exemplo.com` e `pedro@exemplo.com` (fotógrafos) e `admin@exemplo.com` (gestor); esta última só fora da produção, onde a equipe entra pelas contas de `GESTORES` (ver `.env.example`). Sem `DATABASE_URL`, o app usa o PGlite: um Postgres em memória, com as mesmas migrações e esses dados de exemplo, recriado a cada início do servidor. Com `DATABASE_URL` ou `POSTGRES_URL` (Supabase), os dados ficam no banco; `npm run db:migrar` aplica as migrações e grava os exemplos num banco vazio.

## Como rodar

Requisitos: Node.js 20.9 ou mais novo e npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Não há banco para configurar na Parte A.

**Mercado Pago (opcional):** sem credenciais, o pagamento e o saque são simulados. Para testar com o Mercado Pago, copie `.env.example` para `.env.local` e preencha as credenciais de **teste** da aplicação. Com elas:

- o checkout gera o QR Code Pix de verdade e o cartão usa o formulário do Mercado Pago (cartões de teste em Suas integrações > Cartões de teste);
- a página do pedido confere o pagamento na API a cada 5 segundos, então funciona em `localhost` mesmo sem o webhook;
- para receber o webhook na sua máquina, exponha a porta com um túnel (ex.: `ngrok http 3000`) e cadastre `https://<túnel>/api/webhooks/mercadopago` no evento "Order (Mercado Pago)".

**Login com Google e reconhecimento facial (opcionais):** também no `.env.local`. Com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `APP_URL`, aparece o botão "Continuar com Google" (URI de redirecionamento no Google Cloud: `{APP_URL}/api/auth/google/callback`); e-mails em `ADMIN_EMAILS` entram como gestores. Com as credenciais da AWS, a busca por selfie usa o Amazon Rekognition. Detalhes em `.env.example`.

| Comando                  | O que faz                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Servidor de desenvolvimento                                                                                       |
| `npm run build`          | Build de produção (também confere os tipos)                                                                       |
| `npm run start`          | Sobe o build de produção                                                                                          |
| `npm run lint`           | ESLint                                                                                                            |
| `npm run test`           | Testes (Vitest) das regras de dinheiro e da validação                                                             |
| `npm run typecheck`      | Gera os tipos de rota do Next e confere os tipos                                                                  |
| `npm run format`         | Formata o código com Prettier                                                                                     |
| `npm run format:check`   | Confere a formatação sem alterar arquivos                                                                         |
| `npm run exemplos:gerar` | Baixa 24 fotos do picsum.photos e gera as prévias e miniaturas de exemplo, com marca d'água, em `public/exemplo/` |

As imagens de exemplo já estão no repositório; só é preciso rodar `exemplos:gerar` de novo se a marca d'água mudar.

## Dados de exemplo

Ficam em [`src/dados/exemplo/`](src/dados/exemplo/): 3 fotógrafos, 5 categorias, 10 eventos e 780 fotos, além de pastas, colaborador, números de peito, cupons, faixas de desconto, pacotes e uma loja. Cada evento exercita uma regra: não listado, com senha (senha de exemplo `formatura2026`), fotos só após a busca, liberação agendada no passado e no futuro, liberação manual e rascunho. Há também uma foto excluída, uma em processamento e uma com preço individual. As telas nunca importam esses arquivos direto: tudo passa por [`src/dados/index.ts`](src/dados/index.ts), que tem as mesmas assinaturas que a implementação com o banco terá e concentra as regras de quem vê o quê.

## Stack

Next.js 16 (App Router, Cache Components) + TypeScript, Tailwind CSS 4 + shadcn/ui (Base UI), Zod, Sharp e Mercado Pago (Orders e Payouts). Na Parte B entram PostgreSQL com Drizzle, Cloudflare R2, FFmpeg (worker de vídeo), reconhecimento facial e numérico, Inngest, Better Auth, Resend e a API oficial do WhatsApp. Detalhes e motivos em [docs/arquitetura.md](docs/arquitetura.md).

## Estrutura

```
src/
  app/
    (publico)/          # página inicial, eventos, página do evento, página da foto
  components/
    galeria/            # cartão de evento, grade de fotos
    site/               # cabeçalho e rodapé
    ui/                 # componentes do shadcn/ui
  dados/                # camada de dados usada pelas telas
    exemplo/            #   implementação com dados de exemplo (Parte A)
  lib/                  # formatação, validação com Zod, utilitários
  servicos/
    imagens.ts          # prévia e miniatura com marca d'água (Sharp)
scripts/
  gerar-exemplos.ts     # gera as imagens de exemplo
public/exemplo/         # prévias e miniaturas de exemplo
docs/                   # arquitetura, riscos, tarefas, marca, skills
.claude/skills/         # skills do Claude Code usadas no projeto
```

A estrutura completa planejada, com cliente, painel do fotógrafo, admin, loja própria e API, está em [docs/arquitetura.md](docs/arquitetura.md#estrutura-de-pastas).

## Documentação

- [Arquitetura](docs/arquitetura.md): stack, armazenamento, modelo de dados, fluxos, segurança e decisões em aberto
- [Referência de produto: Fotto](docs/referencias/fotto.md): como funciona a plataforma que usamos de referência
- [Riscos e erros possíveis](docs/riscos.md): 35 riscos mapeados, com prioridade e como evitar
- [Tarefas](docs/tarefas.md): o que já foi feito e o que falta, por fase
- [Deploy e contas](docs/deploy.md): contas a criar, variáveis de produção, domínio, lojas e Sentry
- [Marca](docs/marca/marca.md): logo, cores e regras de contraste
- [Skills](docs/skills.md): skills do Claude Code usadas no projeto
- [Instruções para contribuir](docs/CLAUDE.md): regras do projeto e padrão de commits

## Como contribuir

- Leia [docs/CLAUDE.md](docs/CLAUDE.md) antes de começar. Ele lista as regras que o código não pode quebrar (por exemplo: nenhum original acessível sem pedido pago, preço sempre recalculado no servidor, selfie nunca gravada).
- Commits seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), em português: `feat(galeria): cria a página da foto`. Um commit por mudança lógica.
- Ao concluir uma tarefa, marque `[x]` em [docs/tarefas.md](docs/tarefas.md) no mesmo commit.
- Antes de abrir um PR: `npm run lint`, `npm run test`, `npm run format:check` e `npm run build` sem erros.
- Quem usa o Claude Code recebe essas regras automaticamente: o `CLAUDE.md` da raiz importa o `docs/CLAUDE.md`.
