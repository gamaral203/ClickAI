# Marca — ClicouAí

![ClicouAí](logo.png)

## Arquivos

| Arquivo | Tamanho | Uso |
|---|---|---|
| [logo.png](logo.png) | 544 × 160, fundo transparente | Cabeçalho do site, e-mails, README |
| [logo-quadrada.png](logo-quadrada.png) | 800 × 800, fundo transparente | Base para avatar de redes sociais e imagem de compartilhamento |
| [icone.png](icone.png) | 512 × 512, fundo transparente | Só a câmera, recortada da logo. É a base do favicon (`src/app/icon.png`) e do ícone da Apple (`src/app/apple-icon.png`, fundo branco) |

Ainda faltam: versão em SVG e versão para fundo escuro. O ícone foi recortado de um PNG de 800 px; para impressão ou tamanhos grandes, vale pedir o arquivo vetorial a quem fez a logo.

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

## Avatares

Quem não envia foto de perfil aparece com um avatar: 12 ilustrações em SVG, feitas para o ClicouAí, em [`public/avatares/`](../../public/avatares/) (`avatar-01.svg` a `avatar-12.svg`). O catálogo, com o nome de cada um (texto alternativo e rótulo do botão), fica em [`src/lib/avatares.ts`](../../src/lib/avatares.ts). O fotógrafo escolhe em Perfil e recebimento; sem escolha, recebe um padrão tirado do id da conta. A foto enviada sempre tem prioridade.

Estilo: ilustração plana, de busto, viewBox `0 0 120 120` com o fundo ocupando o quadrado todo (o site recorta em círculo), sem texto e sem traço fino, para ler bem em 28 a 36 px. Fundos: azul `#2362FE`, azul claro `#E8EFFF`, limão `#BCFA34` (só com desenho escuro), creme `#F5EBDD`, pêssego `#FFDCCB` e lilás `#E9E3FF`.

Para adicionar um avatar: crie o SVG seguindo o estilo acima, sem metadados, como `avatar-13.svg`; inclua o nome no fim da lista `NOMES` de `src/lib/avatares.ts` (o id vem da posição) e ajuste a contagem em `src/lib/avatares.test.ts`. Não reordene nem apague avatares: o id fica gravado em `fotografos.avatar`, e o avatar padrão de cada conta depende do tamanho da lista (aumentar a lista muda o padrão de quem nunca escolheu).
