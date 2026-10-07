# Riscos e Erros Possíveis — Plataforma de Venda de Fotos

Oct 6, 2026 · @gabriel

Seis erros de prioridade alta quebram o sistema em produção ou expõem o original que se vende; todos devem estar resolvidos antes do lançamento.

Arquitetura completa: [Arquitetura — Plataforma de Venda de Fotos](arquitetura.md).

| Área | Problema | Como evitar | Prioridade |
|---|---|---|---|
| Banco | Funções serverless abrem conexões demais e o Postgres recusa novas | Usar a URL com pooler do Supabase ou Neon | Alta |
| Pagamento | Webhook duplicado, fora de ordem ou que nunca chega | Webhook idempotente (índice único em `pedidos.gateway_id` e só passar de `pendente` para `pago`) + job que consulta no gateway os pedidos pendentes há muito tempo | Alta |
| Segurança | Cliente baixa foto que não comprou trocando o ID na URL | Conferir se o item pertence a um pedido pago do próprio cliente | Alta |
| Pagamento | Preço alterado no navegador antes do checkout | Servidor recalcula o total a partir do banco | Alta |
| Infra | Funções rodando nos EUA (padrão da Vercel) com banco em São Paulo | Configurar a região `gru1` na Vercel | Alta |
| Upload | Upload passando pelo servidor e estourando o limite de tamanho da requisição | Upload sempre direto ao R2 por URL assinada | Alta |
| Upload | Foto presa em "processando" porque o aviso ao servidor falhou | Job que revisa fotos paradas e confere se o arquivo existe no R2 | Média |
| Upload | Arquivos órfãos ocupando espaço pago no R2 | Upload numa pasta temporária com regra de ciclo de vida; mover para `originais/` só após confirmar | Média |
| Upload | RAW grande falha no meio do envio | Upload multipart, com retomada das partes | Média |
| Processamento | RAW de câmera ainda não suportada pelo LibRaw | Status `erro` com aviso ao fotógrafo; usar a prévia JPG embutida no RAW | Média |
| Processamento | Função estoura memória ou tempo ao converter RAW | Testar cedo com arquivos reais; worker separado se necessário | Média |
| Processamento | Prévia girada ou com cores lavadas | Aplicar a rotação do EXIF e converter para sRGB | Média |
| Privacidade | GPS e dados da câmera expostos nas prévias públicas | Remover metadados EXIF das prévias e miniaturas | Média |
| Pagamento | Estorno ou chargeback depois do download | Registrar o caso, descontar do repasse e bloquear reincidentes | Média |
| Pagamento | Fotógrafo sem conta de recebimento configurada para o split | Só permitir publicar evento com conta validada | Média |
| Dados | Fotógrafo apaga foto já vendida e o comprador perde o acesso | Exclusão lógica (`fotos.excluida_em`); manter originais com venda | Média |
| Operação | Jobs e webhooks falham sem ninguém perceber | Sentry e alertas de job com falha desde o primeiro deploy | Média |
| Banco | Galeria lenta em eventos com milhares de fotos | Paginação por cursor e índices nas tabelas de fotos e eventos | Baixa |
| Custos | Conta alta por usar `next/image` da Vercel em milhares de fotos | Servir as prévias já otimizadas pela CDN da Cloudflare | Baixa |
| Segurança | Marca d'água removida com ferramentas de IA | A proteção real é a prévia em baixa resolução | Baixa |
