/** WhatsApp do suporte do ClicouAí (com DDI 55 e DDD 74). */
export const WHATSAPP_SUPORTE = "5574999188851";

/** Link que abre o WhatsApp do suporte com a mensagem já escrita. */
export function linkWhatsappSuporte(mensagem = "Olá, ClicouAi! Preciso de suporte") {
  return `https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(mensagem)}`;
}
