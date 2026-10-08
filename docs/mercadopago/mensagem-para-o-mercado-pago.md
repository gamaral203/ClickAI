# Mensagem para o Mercado Pago (Integrações / suporte)

Texto pronto para enviar à equipe de Integrações do Mercado Pago (pelo suporte do painel de desenvolvedores ou pelo contato comercial). Complete os campos entre colchetes antes de enviar. A chave abaixo é a **pública** (pode ser compartilhada); a privada nunca sai da Vercel.

---

**Assunto:** Cadastro de chave pública (X-signature) e habilitação do Payouts Pix em produção — aplicação [ID da aplicação]

Olá, equipe de Integrações do Mercado Pago,

Somos a ClicouAí ([razão social], CNPJ [CNPJ]), um marketplace de fotos de eventos. Os clientes pagam na nossa conta Mercado Pago (Checkout Transparente via Orders) e repassamos o valor aos fotógrafos por Pix, pela API de Payouts (`POST /v1/payouts`), sempre para a chave Pix do próprio CPF/CNPJ do fotógrafo.

Já integramos o Payouts no ambiente de teste e implementamos a assinatura `X-signature` para produção. Pedimos:

1. O cadastro da chave pública abaixo para a nossa aplicação, usada para validar o header `X-signature` dos payouts;
2. A habilitação do Payouts por Pix em produção para a nossa conta.

Dados da integração:

- ID da aplicação (Application ID): [ID da aplicação]
- Nome da aplicação: [nome da aplicação no painel]
- User ID da conta Mercado Pago: [User ID]
- E-mail da conta: [e-mail da conta Mercado Pago]
- Responsável técnico: [nome, telefone, e-mail]

Chave pública (Ed25519, formato PEM SPKI):

```
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAb2qXcqHVAAC/ogbaiBx2IYXtUiIufSL2qQoy/ZF4JNs=
-----END PUBLIC KEY-----
```

Como geramos a assinatura: Ed25519 sobre os bytes UTF-8 exatos do corpo JSON enviado no `POST /v1/payouts`, codificada em base64 padrão no header `X-signature`. O corpo é serializado uma única vez e enviado exatamente como foi assinado. Em produção enviamos `Authorization: Bearer <access token>`, `Content-Type: application/json`, `X-Idempotency-Key: <id único do saque>`, `X-enforce-signature: true` e `X-signature`, sem `X-test-token`.

Gostaríamos de confirmar alguns pontos:

1. **Chave:** a chave pública fica vinculada à aplicação ou à conta? Por qual canal devemos enviar uma chave nova em caso de rotação, quanto tempo leva para valer e é possível ter duas chaves ativas durante a troca?
2. **Habilitação:** o que falta para liberar o Payouts Pix em produção na nossa conta (contrato, KYC, aprovação comercial)? Há limite inicial por dia ou por mês?
3. **Headers em produção:** confirmam que em produção devemos enviar `X-enforce-signature: true` e omitir `X-test-token`?
4. **Assinatura:** confirmam que a assinatura é calculada sobre os bytes UTF-8 exatos do corpo enviado, em base64 padrão (não base64url), e que o formato PEM SPKI acima é aceito?
5. **Teste da assinatura:** é possível validar a assinatura no ambiente de teste (com `X-test-token: true` e `X-enforce-signature: true`) usando a chave registrada, antes do primeiro payout real?
6. **Valor:** `transactions[].amount.value` aceita centavos (ex.: `1.5` ou `12.34`)? Qual o valor mínimo por payout Pix (entendemos que é R$ 1,00)?
7. **Idempotência:** ao repetir o `POST` com a mesma `X-Idempotency-Key` (por exemplo, depois de um timeout), a API devolve o mesmo payout sem pagar de novo? Por quanto tempo a chave vale? E se o `external_reference` se repetir com outra chave de idempotência, qual é a resposta (código de erro)?
8. **Tarifa e limites:** qual a tarifa por payout Pix e os limites por transação, por dia e por mês?
9. **Webhook:** o Payouts envia notificação de mudança de status? Ela tem assinatura (`x-signature`) como as notificações de Orders, ou há uma lista de IPs de origem para conferirmos?
10. **Saldo:** o payout usa apenas o saldo disponível da conta (sem o dinheiro a liberar de vendas no cartão)? O que acontece quando o saldo não basta: o payout é recusado na hora ou fica pendente?

Também gostaríamos de saber como consultar o status de uma transação: hoje usamos `GET /v1/payouts/{id}/transactions` e consideramos o Pix pago só com `status: success` e `status_detail: accredited`. Está correto?

Obrigado,

[Seu nome]
[Cargo] — ClicouAí
[Telefone] | [E-mail]
