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
| Azul elétrico | `#315CFF` | Cor principal: botões, links, destaques, início do gradiente do hero |
| Limão ClicouAí | `#B8FF32` | Cor de apoio: selos, detalhes, botão principal da busca, fundo de destaque com texto escuro |
| Azul profundo | `#061A42` | Fim do gradiente do hero, faixa dos fotógrafos, rodapé do site |
| Grafite | `#101114` | Alternativa escura (fundos escuros fora da marca azul) |
| Fundo claro | `#F5F7FB` | Fundo das páginas (os cartões brancos se destacam) |
| Texto | `#11182E` | Texto principal |
| Branco | `#FFFFFF` | Cartões, cabeçalho, texto sobre azul |

**Contraste (acessibilidade):**

- Azul elétrico sobre branco: 5,1:1; sobre o fundo claro `#F5F7FB`: 4,8:1. Serve para texto e botões (passa no WCAG AA). Branco sobre o azul elétrico: 5,1:1.
- Branco sobre o azul profundo: 17:1. Texto `#11182E` sobre branco: 17:1.
- Limão sobre branco: 1,2:1. **Não usar para texto** sobre fundo claro; só em detalhes decorativos ou como fundo com texto escuro. Também não serve sozinho para indicar estado (link ativo, progresso): o estado precisa vir junto em outra forma (cor do texto, ícone escuro, número).
- Texto preto sobre limão: 17,4:1; o texto escuro da marca (`#14200A`) sobre limão: 14,0:1. Bom para selos como "Novo", "Publicado" ou "Mais vendida".
- Limão sobre o azul elétrico: 4,2:1. Só para texto grande (18 px ou mais em negrito), como no "AÍ" da logo e no "a um clique." do título da inicial, ou para elementos que não são texto (barra de progresso no fundo azul).
- Limão sobre o azul profundo: 14:1. Serve para qualquer texto.
- Limão sobre o fundo escuro do tema escuro (`#0B1120`): 15,6:1.

O azul mudou de `#2362FE` para `#315CFF` (azul elétrico) em outubro de 2026, no redesenho da página inicial, junto com o azul profundo, o fundo `#F5F7FB`, o texto `#11182E` e a fonte Inter. A logo continua intacta (mesmo arquivo, cores e proporção). Ficaram com o azul antigo, gravado no código, os lugares que não usam os tokens: a cor padrão da loja própria do fotógrafo (quem salvou continua com a sua), os modelos de arte de divulgação (`src/lib/artes/`), o botão dos e-mails (`src/lib/email.ts`), o marcador do mapa e os avatares.

O limão mudou de `#BCFA34` para `#B8FF32` em outubro de 2026, para ficar mais vivo ao lado do azul. A logo (`logo.png` e derivados) e as imagens de exemplo com a marca d'água (`public/exemplo/`) continuam com o limão antigo gravado no arquivo: a diferença é pequena, a logo depende do arquivo vetorial e as imagens de exemplo não foram regeradas. Quem já salvou as cores da loja continua com o valor que escolheu; o novo limão é só o padrão.

## Uso no código

As cores estão em [`src/app/globals.css`](../../src/app/globals.css) como variáveis do tema do shadcn/Tailwind. Para trocar uma cor do site, troque só ali; os componentes usam as classes, nunca o hex:

| Token | Valor | Classe Tailwind | Uso |
|---|---|---|---|
| `--primary` | azul elétrico `#315CFF`, texto branco | `bg-primary`, `text-primary` | Botões principais, links |
| `--profundo` | azul profundo `#061A42` | `bg-profundo`, `to-profundo` | Gradiente do hero, faixa dos fotógrafos, rodapé |
| `--grafite` | `#101114` | `bg-grafite` | Fundo escuro alternativo |
| `--pagina` / `--foreground` | `#F5F7FB` / `#11182E` | `bg-pagina`, `text-foreground` | Fundo da página e texto |
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
| Selos positivos ("Publicado", "Pago", "Em construção", contagem do carrinho) | `bg-highlight text-highlight-foreground` (14:1) | Status bom em destaque |
| Barra do cartão da meta | Preenchimento do azul para o limão sobre o trilho azul-claro | O azul no começo garante contraste com o trilho; o limão marca o avanço |
| Passo concluído (checklist do painel) e fim do envio de fotos | Círculo limão com check escuro | Conclusão comemorada, com o check legível |
| Busca da inicial ("Encontrar meu evento") e "Quero ser fotógrafo" | Botão limão em pílula com texto e seta escuros | Chama para a ação principal |
| Título da inicial | "a um clique." em limão sobre o azul (texto grande) | Assinatura da marca no hero |
| Selo "Em destaque" e número dos passos de Como funciona | `bg-highlight text-highlight-foreground` | Destaque com texto escuro |
| Botões secundários (contorno) | Borda limão no hover; o foco continua com o anel azul | Resposta ao passar o mouse; o foco precisa de contraste |
| Rodapé (azul profundo) | Ponto limão antes do © | Fecha a página com a cor de apoio |
| Pedido pago | Onda limão atrás do check azul | Comemoração da compra |

Fonte: Inter (via `next/font/google`, em `src/app/layout.tsx`), em todo o site e no painel. Títulos grandes em 800 (`font-extrabold`) com `tracking-tight`; texto em 400/500. Até outubro de 2026 era a Plus Jakarta Sans.

## Página inicial

As fotos do hero (mosaico do computador e colagem do celular) e dos cartões de categoria ficam num arquivo só, [`src/lib/vitrine-inicio.ts`](../../src/lib/vitrine-inicio.ts): para trocar ou acrescentar uma foto, mexa ali. Só imagens reais e autorizadas, sem metadados, em duas versões geradas com `sharp` (inteira até 1600 px e reduzida de 720 a 800 px), em `public/inicio/` e `public/vitrine/`. Categoria sem foto mostra o fundo azul com o ícone em limão (hoje, Formaturas).

## Avatares

Quem não envia foto de perfil aparece com um avatar: 12 ilustrações em SVG, feitas para o ClicouAí, em [`public/avatares/`](../../public/avatares/) (`avatar-01.svg` a `avatar-12.svg`). O catálogo, com o nome de cada um (texto alternativo e rótulo do botão), fica em [`src/lib/avatares.ts`](../../src/lib/avatares.ts). A conta de fotógrafo já nasce com um avatar gravado (o padrão tirado do id da conta), que aparece marcado em Perfil e recebimento; o fotógrafo troca quando quiser. Contas antigas sem avatar gravado recebem o mesmo padrão na hora. A foto enviada sempre tem prioridade: ela é enviada em Perfil e recebimento (botão "Enviar minha foto") ou em Minha loja, pelo mesmo fluxo.

Estilo: ilustração plana, de busto, viewBox `0 0 120 120` com o fundo ocupando o quadrado todo (o site recorta em círculo), sem texto e sem traço fino, para ler bem em 28 a 36 px. Fundos: azul `#2362FE`, azul claro `#E8EFFF`, limão `#B8FF32` (só com desenho escuro), creme `#F5EBDD`, pêssego `#FFDCCB` e lilás `#E9E3FF`.

Para adicionar um avatar: crie o SVG seguindo o estilo acima, sem metadados, como `avatar-13.svg`; inclua o nome no fim da lista `NOMES` de `src/lib/avatares.ts` (o id vem da posição) e ajuste a contagem em `src/lib/avatares.test.ts`. Não reordene nem apague avatares: o id fica gravado em `fotografos.avatar`, e o avatar padrão de cada conta depende do tamanho da lista (aumentar a lista muda o padrão de quem nunca escolheu).
