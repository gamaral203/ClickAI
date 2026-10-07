# Riscos e Erros Possíveis — Plataforma de Venda de Fotos

Oct 6, 2026 · @gabriel

Dez erros de prioridade alta quebram o sistema em produção, expõem o original que se vende, vazam dado pessoal sensível ou fazem dinheiro sair da conta da plataforma por engano; todos devem estar resolvidos antes do lançamento.

Arquitetura completa: [Arquitetura — Plataforma de Venda de Fotos](arquitetura.md).

| Área | Problema | Como evitar | Prioridade |
|---|---|---|---|
| Banco | Funções serverless abrem conexões demais e o Postgres recusa novas | Usar a URL com pooler do Neon (driver serverless) | Alta |
| Pagamento | Webhook duplicado, fora de ordem, falsificado ou que nunca chega | Assinatura `x-signature` conferida; status lido na API do Mercado Pago, nunca do corpo; webhook idempotente (índice único em `pedidos.gateway_id` e só passar de `pendente` para `pago`); a página do pedido e um job conferem na API os pedidos pendentes | Alta |
| Segurança | Cliente baixa foto que não comprou trocando o ID na URL | Conferir se o item pertence a um pedido pago do próprio cliente | Alta |
| Pagamento | Preço ou desconto alterado no navegador antes do checkout | Servidor recalcula o total, os descontos e o cupom a partir do banco | Alta |
| Infra | Funções rodando nos EUA (padrão da Vercel) com banco em São Paulo | Configurar a região `gru1` na Vercel | Alta |
| Upload | Upload passando pelo servidor e estourando o limite de tamanho da requisição | Upload sempre direto ao R2 por URL assinada | Alta |
| Privacidade | Selfie da busca facial (dado biométrico) gravada no banco, no R2, em logs ou retida pelo provedor | Selfie só na memória da requisição; não logar o corpo da rota de busca; provedor contratado como operador, sem retenção; consentimento explícito antes da captura | Alta |
| Segurança | Script colocado pelo fotógrafo na loja própria rouba sessão ou dados de clientes | Aceitar só o ID do Google Analytics e do Tag Manager, validado por formato, nunca HTML livre; cookies de sessão presos ao domínio principal | Alta |
| Saque | Saque enviado para a chave Pix de outra pessoa (conta do fotógrafo invadida) | A chave é sempre o CPF/CNPJ do cadastro, nunca digitada; volta a exigir confirmação se o CPF/CNPJ mudar | Alta |
| Saque | Mesmo saldo sacado duas vezes (clique duplo, timeout, reenvio) | Lançamentos presos ao saque numa transação; um saque por vez; idempotência pelo id do saque no Payouts; timeout fica em `processando` em vez de liberar o saldo | Alta |
| Segurança | Conta criada com o e-mail de outra pessoa (sem confirmar) e tomada quando a dona entra com o Google | Ao ligar a conta Google a uma conta nunca confirmada, apagar a senha e as sessões dela; Google só com e-mail verificado; `state` e PKCE no login | Média |
| Upload | Foto ou vídeo preso em "processando" porque o aviso ao servidor falhou | Job que revisa itens parados e confere se o arquivo existe no R2 | Média |
| Upload | Arquivos órfãos ocupando espaço pago no R2 | Upload numa pasta temporária com regra de ciclo de vida; mover para `originais/` só após confirmar | Média |
| Upload | Vídeo grande (até 500 MB) falha no meio do envio | Upload multipart, com retomada das partes | Média |
| Upload | Fotógrafo envia RAW, HEIC ou PNG renomeado como JPEG | Conferir o tipo real no job; status `erro` com mensagem clara pedindo o JPEG exportado | Média |
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
| Saque | Saque em produção sem a assinatura exigida pelo Payouts | Saque bloqueado em produção até implementar o `X-signature` com o Mercado Pago | Média |
| Pagamento | Fotógrafo sem chave Pix confirmada | Só permitir publicar evento e sacar com a chave confirmada | Média |
| Entrega | WhatsApp bloqueia o número ou a mensagem não chega | API oficial com modelo de mensagem aprovado; só enviar com consentimento; e-mail sempre como canal principal | Média |
| Dados | Fotógrafo apaga foto já vendida e o comprador perde o acesso | Exclusão lógica (`fotos.excluida_em`); manter originais com venda | Média |
| Operação | Jobs e webhooks falham sem ninguém perceber | Sentry e alertas de job com falha desde o primeiro deploy | Média |
| Banco | Galeria lenta em eventos com milhares de fotos | Paginação por cursor e índices nas tabelas de fotos e eventos | Baixa |
| Custos | Conta alta por usar `next/image` da Vercel em milhares de fotos | Servir as prévias já otimizadas pela CDN da Cloudflare | Baixa |
| Segurança | Marca d'água removida com ferramentas de IA | A proteção real é a prévia em baixa resolução | Baixa |
| Moderação | Denúncia falsa usada para derrubar o evento de um concorrente | Só a equipe muda o status para `revisao`, depois de analisar; avisar o fotógrafo e ouvir o outro lado | Baixa |
