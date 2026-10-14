import "server-only";

import {
  gestoresParaAviso,
  reservarAvisosDeVencimento,
  soltarAvisosDeVencimento,
  type AvisoDeVencimento,
} from "@/dados";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";
import {
  diasParaVencer,
  formatarDia,
  formatarMoeda,
  ROTULO_CICLO,
  textoDoVencimento,
} from "@/lib/painel-de-uso";

// Aviso de vencimento das assinaturas da plataforma (Painel de uso, /admin/uso). Roda no job de
// pedidos (a cada 10 minutos): cada assinatura ativa gera um aviso quando falta 7 dias e outro
// quando falta 1 dia. Todos os avisos da execução vão num e-mail só, com todos os gestores como
// destinatários, para economizar a cota do Resend. A reserva é atômica no banco (idempotente);
// se o Resend recusar, a reserva é desfeita e a próxima execução tenta de novo.

function linha(a: AvisoDeVencimento, agora: number) {
  const plano = a.plano ? ` (${a.plano})` : "";
  const pagamento = a.formaPagamento ? `, ${a.formaPagamento}` : "";
  return `${a.nome}${plano}: ${textoDoVencimento(diasParaVencer(a.renovaEm, agora))} (${formatarDia(a.renovaEm)}), ${formatarMoeda(a.valorCentavos, a.moeda)} ${ROTULO_CICLO[a.ciclo]}${pagamento}.`;
}

/** Envia o aviso do que vence em breve. Devolve quantas assinaturas entraram no e-mail. */
export async function avisarVencimentosDeAssinaturas(agora: number = Date.now()) {
  const avisos = await reservarAvisosDeVencimento(agora);
  if (avisos.length === 0) return 0;
  const gestores = await gestoresParaAviso();
  if (gestores.length === 0) return avisos.length;

  const ordenados = [...avisos].sort((a, b) => a.renovaEm.localeCompare(b.renovaEm));
  const assunto =
    ordenados.length === 1
      ? `Assinatura ${ordenados[0].nome} ${textoDoVencimento(diasParaVencer(ordenados[0].renovaEm, agora))}`
      : `${ordenados.length} assinaturas vencem em breve`;
  const enviado = await enviarEmail({
    para: gestores.map((g) => g.email),
    assunto,
    paragrafos: [
      "Estas assinaturas da plataforma renovam em breve. Confira se o cartão tem limite ou cancele o que não for mais usado:",
      ...ordenados.map((a) => linha(a, agora)),
    ],
    botao: { texto: "Abrir o Painel de uso", url: urlDoSite("/admin/uso") },
  });
  // Com o Resend configurado e o envio recusado, devolve a reserva; sem o Resend (desenvolvimento),
  // o aviso fica como dado, como os outros e-mails simulados.
  if (!enviado && emailConfigurado()) {
    await soltarAvisosDeVencimento(avisos);
    return 0;
  }
  return avisos.length;
}
