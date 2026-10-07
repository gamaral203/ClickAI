# ClicouAí

![ClicouAí](docs/marca/logo.png)

Marketplace onde fotógrafos vendem fotos e vídeos de eventos e clientes encontram os seus por selfie ou número de peito e compram os originais. Pagamento por Pix e cartão, dados hospedados no Brasil.

## Documentação

- [Arquitetura](docs/arquitetura.md): stack, armazenamento, modelo de dados, fluxos, segurança e decisões em aberto
- [Referência de produto: Fotto](docs/referencias/fotto.md): como funciona a plataforma que usamos de referência
- [Riscos e erros possíveis](docs/riscos.md): 30 riscos mapeados, com prioridade e como evitar
- [Tarefas](docs/tarefas.md): o que já foi feito e o que falta, por fase
- [Marca](docs/marca/marca.md): logo, cores e regras de contraste
- [Skills](docs/skills.md): skills do Claude Code usadas no projeto
- [Instruções para contribuir](docs/CLAUDE.md): regras do projeto e padrão de commits (Conventional Commits)

## Stack

Next.js + TypeScript, PostgreSQL com Drizzle, Cloudflare R2, Sharp e FFmpeg, reconhecimento facial e numérico, Inngest, Better Auth, Mercado Pago ou Asaas, Tailwind + shadcn/ui.
