# Referência de produto — Fotto

A Fotto (fotto.com.br, da Alboom) é a plataforma de venda de fotos de eventos que usamos como referência de produto. Este documento resume como ela funciona, com base no site e na Central de Ajuda (ajuda.fotto.com.br) consultados em 06/10/2026.

**Como usar esta referência:**

- Ela orienta, não decide. As decisões do ClicouAí ficam em [arquitetura.md](../arquitetura.md) e [tarefas.md](../tarefas.md); quando a Fotto já resolveu algo que está em aberto aqui, a decisão cita o que ela fez.
- Copiamos a estrutura e as regras de negócio, nunca textos, telas, nomes de recursos com marca ou identidade visual. Os textos da Fotto (termos, FAQ, depoimentos) e a marca pertencem à Alboom, e as diretrizes de marca deles proíbem esse uso. A nossa marca está em [marca/marca.md](../marca/marca.md).

## O que adotamos no MVP

Decidido em 06/10/2026:

- Busca por reconhecimento facial (selfie) e numérico (número de peito).
- Venda de vídeos, além de fotos.
- Só JPEG para fotos; RAW saiu do escopo.
- Os 12 recursos abaixo: cupons, desconto progressivo, pacote de fotos, liberação agendada, pastas, filtro por horário, visibilidade com senha, fotógrafos colaboradores, loja própria, entrega por WhatsApp, carrinho abandonado e denúncia.

Ficam fora do MVP, sem decisão: app para clientes e fotógrafos, plugin do Lightroom, presets de edição, upload em tempo real, desfoque contra print no celular, marca d'água personalizada, central de oportunidades, comunidades, ranking, editor de artes, "avise-me", comissão personalizada e parceiro comissionado.

## Modelo de negócio

| Item | Como a Fotto faz |
|---|---|
| Comissão | 10% fixos sobre cada venda (foto ou vídeo). Sem mensalidade, plano, taxa de upload, de saque ou de reconhecimento facial |
| Quem define o preço | O fotógrafo, por evento, com preço por foto e por vídeo, e preço individual opcional |
| Quem pode vender | Pessoa física maior de 18 anos ou pessoa jurídica, residente no Brasil, com conta em banco brasileiro suportado |
| Quem pode comprar | Qualquer pessoa, inclusive estrangeiros (cartão internacional) |
| Exclusividade | Não exige exclusividade do fotógrafo; respeita contratos de exclusividade de eventos |

## Comprador

**Encontrar o evento:** busca pelo nome (do mais recente ao mais antigo), navegação por categoria (mais de 100, de corrida a casamento), página "Encontrar fotos" com filtros de data, cidade e categoria, perfil do fotógrafo, e link direto ou QR Code divulgado no evento.

**Encontrar as próprias fotos dentro do evento:**

- Reconhecimento facial: o cliente tira uma selfie ou envia uma foto do rosto e vê só as fotos em que aparece. Usado em 97% dos eventos.
- Reconhecimento numérico: busca pelo número de peito.
- Filtro por horário (hora de início e fim), quando o fotógrafo ativa.
- Navegação pela galeria e por pastas.
- Fotos não identificadas: as fotos em que nenhum rosto ou número foi reconhecido aparecem numa lista à parte (ligado por padrão, desligado automaticamente em eventos grandes).

**Comprar:**

- Prévia ampliada com marca d'água antes da compra.
- Carrinho com fotos de vários eventos e fotógrafos, pago de uma vez. O carrinho fica salvo no navegador.
- Compra sem cadastro: só nome, e-mail e forma de pagamento.
- Pix (código vale cerca de 1 hora) ou cartão de crédito à vista, sem parcelamento.
- Descontos: desconto progressivo por evento, cupom (aplicado no fechamento) e pacote "todas as minhas fotos" (aparece só depois do reconhecimento facial ou numérico). Progressivo e cupom podem ser usados juntos; o pacote não se combina com nenhum dos dois.

**Receber e baixar:**

- Na tela de confirmação, logo depois do pagamento (todas de uma vez ou uma a uma).
- Pelo e-mail de confirmação ("Download das fotos está disponível").
- Opcionalmente, pelo WhatsApp, de forma automática.
- Na área do cliente ("Minhas fotos"), criada com o mesmo e-mail das compras: pedidos, fotos compradas, carrinho pendente e avaliação com estrelas.
- Arquivo original, sem marca d'água, na resolução enviada pelo fotógrafo. Disponível por tempo indeterminado e quantas vezes o cliente quiser.
- Uso pessoal: pode compartilhar, publicar e imprimir; não pode alterar, revender ou usar comercialmente.
- Cancelamento ou troca de foto: pelo atendimento.

## Fotógrafo

**Conta:** cadastro gratuito, validação de e-mail, perfil público (foto, capa, bio, redes sociais) e conta de pagamento com conta bancária de mesma titularidade.

**Evento:** é a galeria de fotos, com título, categoria, data e hora de início e fim, local (local, estado, cidade) e capa. Status: rascunho, publicado ou revisão (só a equipe tira desse status). Ao publicar, o fotógrafo recebe link, QR Code e botões de compartilhamento.

**Configurações do evento:**

| Recurso | Como funciona |
|---|---|
| Visibilidade do evento | Público; público não listado (só com o link); protegido por senha (mínimo 4 caracteres), listado ou não |
| Visibilidade das fotos | Visíveis para todos, ou só depois do reconhecimento facial ou numérico |
| Liberação das fotos | Automática (conforme sobem), manual, ou agendada com data e hora. Na agendada, a página mostra contagem regressiva. Opção de avisar os colaboradores por e-mail |
| Filtros | Liga e desliga o filtro por horário e a lista de fotos não identificadas |
| Pastas | Organizam a galeria; não afetam o reconhecimento. Arquivos podem ser movidos entre pastas |
| Ordenação | Por data de envio (padrão), data de captura, nome do arquivo ou aleatória. Fotos enviadas depois não seguem a ordem; é preciso aplicar de novo |
| Preço | Preço padrão por foto e por vídeo, com preço individual opcional |
| Pacote de fotos | Preço fixo pelo pacote ou por foto; mostrar sempre ou a partir de uma quantidade mínima; validade indeterminada ou com data. Só para fotos |
| Desconto progressivo | Faixas por quantidade, configuradas por evento ou como regra padrão para todos os eventos. Só para fotos |
| Colaboradores | Outros fotógrafos já cadastrados, adicionados por e-mail ou usuário. O dono define a própria comissão sobre as vendas dos colaboradores e pode deixar notas |

**Cupons:** criados no painel, valem para todos os eventos ou eventos escolhidos, e para fotos e vídeos. Tipos: percentual, valor fixo ou fotos grátis. Limites opcionais: número de usos, data de início, validade e valor ou quantidade mínima no carrinho. Podem ser editados, desativados ou excluídos.

**Arquivos:**

- Fotos: JPEG, até 30 MB (recomendado de 2 a 6 MB), pelo menos 2.800 px de largura, mínimo de 150 DPI (recomendado 200), em sRGB. Upload sem limite de quantidade.
- Vídeos: MP4 ou MOV (H.264 recomendado), até 500 MB e 5 minutos, também com marca d'água e reconhecimento facial e numérico.
- Identificação automática de arquivos duplicados.
- Upload recomendado pelo computador, não pelo celular.

**Loja própria:** loja com nome, descrição, logo, cores e domínio do fotógrafo, sem hospedagem nem código. Aceita a tag do Google Analytics no cabeçalho e o ID do Google Tag Manager.

**Recebimento:**

- Pix: o valor fica disponível na hora e é transferido no próximo dia útil.
- Cartão: o valor fica "a receber" e vira disponível 30 dias depois da venda.
- O saldo disponível é transferido automaticamente para a conta bancária, em dias úteis, com frequência diária (padrão), semanal ou mensal.
- O painel mostra saldo disponível e saldo a receber.

**Vendas extras:** entrega por WhatsApp sem custo para o fotógrafo e recuperação automática de carrinho abandonado.

## Confiança e segurança

- **Selfie do reconhecimento facial:** recurso opcional. A foto é enviada a um provedor terceiro que atua só como operador de dados; nem a selfie nem os vetores do rosto ficam guardados em banco, arquivo ou log. Tratada como dado pessoal sensível pela LGPD, com encarregado (DPO) indicado na política de privacidade.
- **Marca d'água:** só da plataforma, em prévias e vídeos. O fotógrafo não pode aplicar a própria no original vendido.
- **Política de autenticidade:** só fotos e vídeos reais, de eventos presenciais com data e local, feitos por quem publica ou com autorização. Proibidos conteúdo gerado por IA, banco de imagens, nudez, violência, discriminação e imagens constrangedoras. Usuários precisam ter mais de 18 anos.
- **Autorização:** o fotógrafo responde por ter autorização para fotografar e vender. Eventos privados, mesmo em local público, exigem autorização formal do organizador.
- **Denúncia:** menu ⋮ no evento ou na foto, com motivo, anexos (contratos, autorizações, prints) e contato (com razão social e CNPJ, se for empresa). Fluxo: confirmação por e-mail, análise pela equipe, aviso às partes (fotógrafo e dono do evento), e ação: remoção ou correção pelo fotógrafo, ou despublicação, status "revisão", advertência ou bloqueio pela equipe.
- **Pedido de remoção:** qualquer pessoa fotografada pode pedir a avaliação da remoção de uma imagem.

## Atendimento

Chat online no painel (dias úteis, 8h às 19h), WhatsApp, e-mail que abre chamado fora do horário, e Central de Ajuda com artigos separados para comprador e fotógrafo. Atendimento também para o cliente final, não só para o fotógrafo.
