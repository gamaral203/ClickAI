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
| Limão ClicouAí | `#B8FF32` | Cor de apoio: selos, detalhes, fundo de destaque com texto escuro |

**Contraste (acessibilidade):**

- Azul sobre branco: 4,9:1. Serve para texto e botões (passa no WCAG AA).
- Limão sobre branco: 1,2:1. **Não usar para texto** sobre fundo claro; só em detalhes decorativos ou como fundo com texto escuro. Também não serve sozinho para indicar estado (link ativo, progresso): o estado precisa vir junto em outra forma (cor do texto, ícone escuro, número).
- Texto preto sobre limão: 17,4:1; o texto escuro da marca (`#14200A`) sobre limão: 14,0:1. Bom para selos como "Novo", "Publicado" ou "Mais vendida".
- Limão sobre azul: 4,1:1. Só para texto grande (18 px ou mais em negrito), como no "AÍ" da logo, ou para elementos que não são texto (barra de progresso no fundo azul).
- Limão sobre o fundo escuro do tema escuro (`#0B1120`): 15,6:1.

O limão mudou de `#BCFA34` para `#B8FF32` em outubro de 2026, para ficar mais vivo ao lado do azul. A logo (`logo.png` e derivados) e as imagens de exemplo com a marca d'água (`public/exemplo/`) continuam com o limão antigo gravado no arquivo: a diferença é pequena, a logo depende do arquivo vetorial e as imagens de exemplo não foram regeradas. Quem já salvou as cores da loja continua com o valor que escolheu; o novo limão é só o padrão.

## Uso no código

As cores estão em [`src/app/globals.css`](../../src/app/globals.css) como variáveis do tema do shadcn/Tailwind:

| Token | Valor | Classe Tailwind | Uso |
|---|---|---|---|
| `--primary` | azul `#2362FE`, texto branco | `bg-primary`, `text-primary` | Botões principais, links |
| `--highlight` | limão `#B8FF32`, texto `#14200A` | `bg-highlight text-highlight-foreground` | Selos e detalhes |
| `--accent` | azul bem claro `#E8EFFF` | `bg-accent` | Hover de menus e botões (usado pelo shadcn) |

O limão não fica no `--accent` porque o shadcn usa esse token no hover de vários componentes, e a interface inteira ficaria verde. Nunca usar `text-highlight` sobre fundo claro.

### Onde o limão aparece

Proporção 60/30/10: branco (fundo), azul (cor principal) e limão só como detalhe. O limão nunca é a única pista de um estado; o azul, o texto ou um ícone escuro dizem a mesma coisa.

| Lugar | Como | Por quê |
|---|---|---|
| Link ativo do cabeçalho do site e atalhos do painel | Traço limão de 3 px embaixo; o texto fica azul | Marca a página atual sem pesar no cabeçalho |
| Menu lateral do painel e menu do celular | Barra limão à esquerda do item atual; ponto limão no menu do celular | Mesma linguagem do cabeçalho |
| Faixa do topo do cabeçalho do painel | Gradiente do azul para o limão | Assinatura da marca em toda página do painel |
| Selos positivos ("Publicado", "Pago", "Em construção", top da semana, contagem do carrinho) | `bg-highlight text-highlight-foreground` (14:1) | Status bom em destaque |
| Barra do cartão da meta | Preenchimento do azul para o limão sobre o trilho azul-claro | O azul no começo garante contraste com o trilho; o limão marca o avanço |
| Passo concluído (checklist do painel) e fim do envio de fotos | Círculo limão com check escuro | Conclusão comemorada, com o check legível |
| Botão "Encontrar meu evento" da inicial | Pastilha limão com a seta escura | Chama para a ação principal |
| Botões secundários (contorno) | Borda limão no hover; o foco continua com o anel azul | Resposta ao passar o mouse; o foco precisa de contraste |
| Rodapé | Ponto limão antes do © | Fecha a página com a cor de apoio |
| Pedido pago | Onda limão atrás do check azul | Comemoração da compra |

Fonte: Plus Jakarta Sans (via `next/font`), geométrica e arredondada como a logo.

## Avatares

Quem não envia foto de perfil aparece com um avatar: 12 ilustrações em SVG, feitas para o ClicouAí, em [`public/avatares/`](../../public/avatares/) (`avatar-01.svg` a `avatar-12.svg`). O catálogo, com o nome de cada um (texto alternativo e rótulo do botão), fica em [`src/lib/avatares.ts`](../../src/lib/avatares.ts). A conta de fotógrafo já nasce com um avatar gravado (o padrão tirado do id da conta), que aparece marcado em Perfil e recebimento; o fotógrafo troca quando quiser. Contas antigas sem avatar gravado recebem o mesmo padrão na hora. A foto enviada sempre tem prioridade: ela é enviada em Perfil e recebimento (botão "Enviar minha foto") ou em Minha loja, pelo mesmo fluxo.

Estilo: ilustração plana, de busto, viewBox `0 0 120 120` com o fundo ocupando o quadrado todo (o site recorta em círculo), sem texto e sem traço fino, para ler bem em 28 a 36 px. Fundos: azul `#2362FE`, azul claro `#E8EFFF`, limão `#B8FF32` (só com desenho escuro), creme `#F5EBDD`, pêssego `#FFDCCB` e lilás `#E9E3FF`.

Para adicionar um avatar: crie o SVG seguindo o estilo acima, sem metadados, como `avatar-13.svg`; inclua o nome no fim da lista `NOMES` de `src/lib/avatares.ts` (o id vem da posição) e ajuste a contagem em `src/lib/avatares.test.ts`. Não reordene nem apague avatares: o id fica gravado em `fotografos.avatar`, e o avatar padrão de cada conta depende do tamanho da lista (aumentar a lista muda o padrão de quem nunca escolheu).
