# ClicouAí

![ClicouAí](docs/marca/logo.png)

Marketplace onde fotógrafos vendem fotos e vídeos de eventos e clientes encontram os seus por selfie ou número de peito e compram os originais. Pagamento por Pix e cartão, dados hospedados no Brasil.

## Status

O projeto está na **Parte A**: o produto inteiro sendo construído com dados de exemplo, atrás de uma camada de dados (`src/dados/`). As integrações (banco, login real, R2, processamento no servidor, reconhecimento facial e numérico, gateway de pagamento, e-mail e WhatsApp) ficam para a **Parte B**, quando formos testar com fotos reais. Na troca, só a camada de dados muda; as telas continuam iguais.

O que já funciona:

- Página inicial e lista de eventos com busca por nome, cidade ou fotógrafo (sem diferenciar acentos) e filtro por data
- Página do evento com galeria paginada por cursor e botão "Carregar mais fotos", e aviso quando a galeria está fechada (aguardando liberação, com senha ou só após a busca)
- Página da foto com a prévia grande, preço e navegação para a foto anterior e a próxima
- Prévias e miniaturas com a marca d'água gravada nos pixels, rotação do EXIF corrigida e metadados (GPS, câmera) removidos
- Carrinho, checkout e pagamento simulado; download do original só para pedido pago
- Cadastro, login (sessão simulada), confirmação de e-mail, Minhas compras e perfil do fotógrafo
- Headers de segurança e validação com Zod de tudo que vem do navegador

O andamento completo, fase por fase, está em [docs/tarefas.md](docs/tarefas.md).

**Contas de exemplo** (senha `clicouai123`): `ana@exemplo.com` (cliente), `lia@exemplo.com` e `pedro@exemplo.com` (fotógrafos), `admin@exemplo.com`. Pedidos, contas criadas e alterações ficam na memória do servidor e somem quando ele reinicia.

## Como rodar

Requisitos: Node.js 20.9 ou mais novo e npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Não há variáveis de ambiente nem banco para configurar na Parte A.

| Comando                  | O que faz                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Servidor de desenvolvimento                                                                                       |
| `npm run build`          | Build de produção (também confere os tipos)                                                                       |
| `npm run start`          | Sobe o build de produção                                                                                          |
| `npm run lint`           | ESLint                                                                                                            |
| `npm run format`         | Formata o código com Prettier                                                                                     |
| `npm run format:check`   | Confere a formatação sem alterar arquivos                                                                         |
| `npm run exemplos:gerar` | Baixa 24 fotos do picsum.photos e gera as prévias e miniaturas de exemplo, com marca d'água, em `public/exemplo/` |

As imagens de exemplo já estão no repositório; só é preciso rodar `exemplos:gerar` de novo se a marca d'água mudar.

## Dados de exemplo

Ficam em [`src/dados/exemplo/`](src/dados/exemplo/): 3 fotógrafos, 5 categorias, 10 eventos e 780 fotos, além de pastas, colaborador, números de peito, cupons, faixas de desconto, pacotes e uma loja. Cada evento exercita uma regra: não listado, com senha (senha de exemplo `formatura2026`), fotos só após a busca, liberação agendada no passado e no futuro, liberação manual e rascunho. Há também uma foto excluída, uma em processamento e uma com preço individual. As telas nunca importam esses arquivos direto: tudo passa por [`src/dados/index.ts`](src/dados/index.ts), que tem as mesmas assinaturas que a implementação com o banco terá e concentra as regras de quem vê o quê.

## Stack

Next.js 16 (App Router, Cache Components) + TypeScript, Tailwind CSS 4 + shadcn/ui (Base UI), Zod e Sharp. Na Parte B entram PostgreSQL com Drizzle, Cloudflare R2, FFmpeg (worker de vídeo), reconhecimento facial e numérico, Inngest, Better Auth, Mercado Pago ou Asaas, Resend e a API oficial do WhatsApp. Detalhes e motivos em [docs/arquitetura.md](docs/arquitetura.md).

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
- [Riscos e erros possíveis](docs/riscos.md): 30 riscos mapeados, com prioridade e como evitar
- [Tarefas](docs/tarefas.md): o que já foi feito e o que falta, por fase
- [Marca](docs/marca/marca.md): logo, cores e regras de contraste
- [Skills](docs/skills.md): skills do Claude Code usadas no projeto
- [Instruções para contribuir](docs/CLAUDE.md): regras do projeto e padrão de commits

## Como contribuir

- Leia [docs/CLAUDE.md](docs/CLAUDE.md) antes de começar. Ele lista as regras que o código não pode quebrar (por exemplo: nenhum original acessível sem pedido pago, preço sempre recalculado no servidor, selfie nunca gravada).
- Commits seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), em português: `feat(galeria): cria a página da foto`. Um commit por mudança lógica.
- Ao concluir uma tarefa, marque `[x]` em [docs/tarefas.md](docs/tarefas.md) no mesmo commit.
- Antes de abrir um PR: `npm run lint`, `npm run format:check` e `npm run build` sem erros.
- Quem usa o Claude Code recebe essas regras automaticamente: o `CLAUDE.md` da raiz importa o `docs/CLAUDE.md`.
