# Marca — ClicouAí

![ClicouAí](logo.png)

## Arquivos

| Arquivo | Tamanho | Uso |
|---|---|---|
| [logo.png](logo.png) | 544 × 160, fundo transparente | Cabeçalho do site, e-mails, README |
| [logo-quadrada.png](logo-quadrada.png) | 800 × 800, fundo transparente | Base para avatar de redes sociais e imagem de compartilhamento |

Ainda faltam: versão em SVG, ícone só com a câmera (favicon e app) e versão para fundo escuro.

## Cores

| Nome | Hex | Uso |
|---|---|---|
| Azul ClicouAí | `#2362FE` | Cor principal: botões, links, destaques |
| Limão ClicouAí | `#BCFA34` | Cor de apoio: selos, detalhes, fundo de destaque com texto escuro |

**Contraste (acessibilidade):**

- Azul sobre branco: 4,9:1. Serve para texto e botões (passa no WCAG AA).
- Limão sobre branco: 1,3:1. **Não usar para texto** sobre fundo claro; só em detalhes decorativos ou como fundo com texto escuro.
- Texto preto sobre limão: 16,8:1. Bom para selos como "Novo" ou "Mais vendida".
- Limão sobre azul: 4,0:1. Só para texto grande (18 px ou mais em negrito), como no "AÍ" da logo.

## Uso no código

As cores estão em [`src/app/globals.css`](../../src/app/globals.css) como variáveis do tema do shadcn/Tailwind:

| Token | Valor | Classe Tailwind | Uso |
|---|---|---|---|
| `--primary` | azul `#2362FE`, texto branco | `bg-primary`, `text-primary` | Botões principais, links |
| `--highlight` | limão `#BCFA34`, texto `#14200A` | `bg-highlight text-highlight-foreground` | Selos e destaques |
| `--accent` | azul bem claro `#E8EFFF` | `bg-accent` | Hover de menus e botões (usado pelo shadcn) |

O limão não fica no `--accent` porque o shadcn usa esse token no hover de vários componentes, e a interface inteira ficaria verde. Nunca usar `text-highlight` sobre fundo claro.

Fonte: Plus Jakarta Sans (via `next/font`), geométrica e arredondada como a logo.
