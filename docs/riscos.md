# Riscos e Erros Possíveis — Plataforma de Venda de Fotos

Oct 6, 2026 · @gabriel

Dez erros de prioridade alta quebram o sistema em produção, expõem o original que se vende, vazam dado pessoal sensível ou fazem dinheiro sair da conta da plataforma por engano; todos devem estar resolvidos antes do lançamento.

Arquitetura completa: [Arquitetura — Plataforma de Venda de Fotos](arquitetura.md).

| Área | Problema | Como evitar | Prioridade |
|---|---|---|---|
| Banco | Funções serverless abrem conexões demais e o Postgres recusa novas | Usar a URL do pooler do Supabase em modo transaction (porta 6543), node-postgres (sem prepared statements com nome e com uma consulta por vez em cada conexão, porque o pooler trava com consultas enfileiradas na mesma conexão) e poucas conexões por instância | Alta |
| Pagamento | Webhook duplicado, fora de ordem, falsificado ou que nunca chega | Assinatura `x-signature` conferida; status lido na API do Mercado Pago, nunca do corpo; webhook idempotente (índice único em `pedidos.gateway_id` e só passar de `pendente` para `pago`); a página do pedido e um job conferem na API os pedidos pendentes | Alta |
| Segurança | Cliente baixa foto que não comprou trocando o ID na URL | Conferir se o item pertence a um pedido pago do próprio cliente | Alta |
| Segurança | Colaborador, gestor ou outro fotógrafo baixa os originais de um evento pela opção "Baixar originais" do dono (ou troca o id do evento ou das fotos no pedido do lote) | Só o dono (`eventos.fotografo_id` = conta do usuário logado) conferido no WHERE de cada lote; ids e cursor sempre filtrados pelo evento e pela opção; liberação assinada presa ao usuário e ao evento, com o código do MFA se ligado; limite de 120 lotes em 10 minutos por usuário; cada lote registrado em `downloads_do_dono`; assinatura das URLs fora do Sentry (`src/servicos/originais-do-dono.ts`) | Alta |
| Pagamento | Preço ou desconto alterado no navegador antes do checkout | Servidor recalcula o total, os descontos e o cupom a partir do banco | Alta |
| Infra | Funções rodando nos EUA (padrão da Vercel) com banco em São Paulo | Configurar a região `gru1` na Vercel | Alta |
| Upload | Upload passando pelo servidor e estourando o limite de tamanho da requisição | Upload sempre direto ao R2 por URL assinada | Alta |
| Privacidade | Selfie da busca facial (dado biométrico) gravada no banco, no R2, em logs ou retida pelo provedor | Selfie só na memória da requisição; não logar o corpo da rota de busca; provedor contratado como operador, sem retenção; consentimento explícito antes da captura | Alta |
| Segurança | Script colocado pelo fotógrafo na loja própria rouba sessão ou dados de clientes | Aceitar só o ID do Google Analytics e do Tag Manager, validado por formato, nunca HTML livre; cookies de sessão presos ao domínio principal | Alta |
| Saque | Saque enviado para a chave Pix de outra pessoa (conta do fotógrafo invadida) | A chave é sempre o CPF/CNPJ do cadastro, nunca digitada; volta a exigir confirmação se o CPF/CNPJ mudar | Alta |
| Saque | Mesmo saldo sacado duas vezes (clique duplo, timeout, reenvio) | Lançamentos presos ao saque numa transação; um saque por vez; idempotência pelo id do saque no Payouts; timeout fica em `processando` em vez de liberar o saldo; o saldo só volta com recusa clara no primeiro envio ou status `error`/`rejected`/`canceled` lido na API; recusa ambígua, recusa em reenvio e Pix devolvido ficam em `processando` com alerta para revisão manual | Alta |
| Segurança | Conta criada com o e-mail de outra pessoa (sem confirmar) e tomada quando a dona entra com o Google | Ao ligar a conta Google a uma conta nunca confirmada, apagar a senha e as sessões dela; Google só com e-mail verificado; `state` e PKCE no login | Média |
| Upload | Foto ou vídeo preso em "processando" porque o aviso ao servidor falhou | Job que revisa itens parados e confere se o arquivo existe no R2 | Média |
| Upload | Arquivos órfãos ocupando espaço pago no R2 | Upload numa pasta temporária com regra de ciclo de vida; mover para `originais/` só após confirmar | Média |
| Upload | Vídeo grande (até 500 MB) falha no meio do envio | Upload multipart, com retomada das partes | Média |
| Upload | Fotógrafo envia RAW, HEIC ou PNG renomeado como JPEG | Conferir o tipo real pelos bytes no navegador e no servidor (`src/lib/tipos-imagem.ts`): RAW recusado com mensagem pedindo a exportação; HEIC convertido em JPEG no navegador; PNG renomeado é tratado e guardado como PNG; arquivo diferente do formato informado vira `erro` | Média |
| Processamento | Worker estoura memória ou tempo ao processar vídeo | Testar cedo com vídeos reais de 500 MB; limitar duração a 5 minutos; fila com concorrência controlada | Média |
| Processamento | Prévia girada ou com cores lavadas | Aplicar a rotação do EXIF e converter para sRGB | Média |
| Privacidade | GPS e dados da câmera expostos nas prévias públicas | Remover metadados EXIF das prévias e miniaturas | Média |
| Privacidade | Busca facial mostra fotos de outra pessoa (falso positivo), inclusive em eventos com fotos visíveis só após a busca | Limiar de similaridade alto; rate limit por IP na busca; canal de remoção | Média |
| Custos | Provedor de reconhecimento cobra por foto indexada e por busca, e a conta cresce com eventos grandes | Indexar cada foto uma vez só no job; não reindexar ao mover de pasta; alerta de gasto no provedor | Média |
| Busca | Filtro por horário errado porque a câmera estava com hora errada ou o EXIF não tem fuso | Assumir horário de Brasília e avisar o fotógrafo para sincronizar as câmeras; filtro desligado por padrão | Média |
| Pagamento | Cupom com limite de usos usado além do limite em compras simultâneas | Somar o uso no webhook, na mesma transação do `pago`, com `usos < usos_max` na condição | Média |
| Pagamento | Pacote combinado com cupom ou desconto progressivo, dando desconto em dobro | Regra de combinação aplicada só no servidor, na ordem definida em [arquitetura.md](arquitetura.md) | Média |
| Pagamento | Divisão entre dono do evento e colaborador, ou taxa do saque, perde ou sobra centavos | Calcular em centavos inteiros; sobra da divisão vai para o autor da foto; taxa arredondada para baixo; conferir que a soma dá o preço do item | Média |
| Pagamento | Estorno ou chargeback depois do download ou do saque | Registrar o caso, lançar valor negativo no extrato do fotógrafo (descontado do próximo saque) e bloquear reincidentes | Média |
| Saque | Saque antecipado de venda no cartão antes de o Mercado Pago liberar esse dinheiro na conta da plataforma: o saque falha por falta de saldo, ou a plataforma adianta e toma o chargeback | Conferir o prazo de liberação do cartão escolhido no Mercado Pago; manter saldo de reserva; avaliar limitar o antecipado a vendas no Pix | Média |
| Saque | Saque em produção sem a assinatura exigida pelo Payouts, ou com a chave privada vazada | `X-signature` Ed25519 sobre os bytes exatos do corpo, com a chave privada só na Vercel (`MP_PAYOUTS_PRIVATE_KEY`); saque real só com `MP_PAYOUTS_HABILITADO=1`, ligado depois que o Mercado Pago confirmar a chave pública; rotação descrita em deploy.md | Média |
| Pagamento | Fotógrafo sem chave Pix confirmada | Só permitir publicar evento e sacar com a chave confirmada | Média |
| Entrega | WhatsApp bloqueia o número ou a mensagem não chega | API oficial com modelo de mensagem aprovado; só enviar com consentimento; e-mail sempre como canal principal | Média |
| Dados | Fotógrafo apaga foto já vendida e o comprador perde o acesso | Exclusão lógica (`fotos.excluida_em`); manter originais com venda | Média |
| Operação | Jobs e webhooks falham sem ninguém perceber | Sentry e alertas de job com falha desde o primeiro deploy | Média |
| Banco | Galeria lenta em eventos com milhares de fotos | Paginação por cursor e índices nas tabelas de fotos e eventos | Baixa |
| Custos | Conta alta por usar `next/image` da Vercel em milhares de fotos | Servir as prévias já otimizadas pela CDN da Cloudflare | Baixa |
| Segurança | Marca d'água removida com ferramentas de IA | A proteção real é a prévia em baixa resolução | Baixa |
| Moderação | Denúncia falsa usada para derrubar o evento de um concorrente | Só a equipe muda o status para `revisao`, depois de analisar; avisar o fotógrafo e ouvir o outro lado | Baixa |

## Revisão dos riscos de prioridade alta (Fase 14)

Conferido contra o código em 8 out. 2026. "Resolvido" quer dizer que o código faz o que a coluna "Como evitar" pede; o que depende de configuração, contrato ou teste em produção está em "Falta".

| Risco | Situação | Onde | Falta |
|---|---|---|---|
| Conexões demais no Postgres | Resolvido | `src/db/conexao.ts`: node-postgres, até 5 conexões por instância, sem prepared statements com nome; produção exige `DATABASE_URL` (pooler, porta 6543) | — |
| Webhook duplicado, falsificado ou perdido | Resolvido | `src/app/api/webhooks/mercadopago/route.ts` e `src/lib/mercadopago.ts`: `x-signature` em tempo constante e com `ts` de no máximo 5 minutos de diferença (passado ou futuro), order relida na API com referência e valor conferidos, `pendente → pago` idempotente por `gateway_id` único; a página do pedido e o job (a cada 10 min, pelo GitHub Actions) conferem os pendentes | — |
| Baixar foto não comprada trocando o ID | Resolvido | `src/servicos/downloads.ts`: só item de pedido `pago` do próprio cliente (sessão) ou de quem tem o token do link, comparado em tempo constante; mesma resposta 404 para todo motivo; URL assinada de ~15 min; limite de downloads por IP no banco. Na produção, o pagamento simulado fica desligado mesmo sem as credenciais do gateway | — |
| Preço alterado no navegador | Resolvido | `src/servicos/pedidos.ts` (`criarPedido`): total, descontos, pacote e cupom recalculados do banco; o cartão é cobrado pelo total do pedido; o uso do cupom é somado na mesma transação do `pago`, com `usos < usos_max` na condição (`marcarPedidoPago` em `src/dados/index.ts`) | — |
| Funções fora de `gru1` | Resolvido | `vercel.json`: `"regions": ["gru1"]` | — |
| Upload passando pelo servidor | Resolvido | `src/servicos/envios.ts` e `src/lib/r2.ts`: PUT direto ao R2 por URL assinada, com tipo e tamanho na assinatura; o servidor só lê o arquivo depois, para gerar as prévias (rota `/api/envios/processar`, que só recebe o id da foto); sem limite de quantidade de fotos, mas com limite de lotes de URLs por fotógrafo no banco (15.000 fotos em 10 minutos) | Vídeo (multipart) ainda não existe |
| Selfie gravada ou logada | Resolvido no código | `src/app/api/busca-facial/route.ts`: selfie só na memória, zerada no fim, nunca logada; consentimento obrigatório; limite por IP no banco, sem olhar o conteúdo; o Sentry descarta corpo, cookies e tokens (`src/lib/sentry.ts`) | Contrato com o provedor (AWS Rekognition) como operador, sem retenção, e a região dos dados; revisão jurídica da política |
| Script na loja própria | Resolvido | GA/GTM só pelo ID validado (`src/lib/loja.ts`, `src/components/loja/pagina-loja.tsx`); cookies sem `Domain`; CSP com nonce e `'strict-dynamic'` em todas as páginas (`src/proxy.ts`, `src/lib/csp.ts`), que também bloqueia tag "HTML personalizado" do GTM | — |
| Saque para a chave Pix de outra pessoa | Resolvido no código | `src/servicos/saques.ts` e `src/servicos/troca-documento.ts`: a chave é sempre o CPF/CNPJ do cadastro e volta a exigir confirmação se ele mudar; trocar o documento pede a senha de novo (ou login com o Google de menos de 10 minutos), avisa por e-mail, derruba as outras sessões e bloqueia saques por 72 horas; com a verificação em duas etapas ligada, a troca e cada saque pedem também o código do app | Conferir que as respostas ao e-mail de aviso chegam a uma caixa lida pela equipe (Fase 14) |
| Mesmo saldo sacado duas vezes | Resolvido no código | `src/servicos/saques.ts`: lançamentos reservados ao saque numa transação, um saque por vez, idempotência pelo id no Payouts, timeout fica em `processando`, saldo só volta com recusa clara; na produção não há saque simulado | Primeiro saque real de R$ 1,00 em produção para validar (Fase 13) |
