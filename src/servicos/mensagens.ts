import "server-only";

import {
  marcarLotesLiberadosParaAviso,
  registrarMensagem,
  vendasDoPedidoPorFotografo,
  type PedidoInterno,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import { emailConfigurado, enviarEmail, type Email } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { enviarPush } from "@/lib/push";

// Mensagens ao comprador (docs/arquitetura.md, "Compra e pagamento" e "Carrinho abandonado").
// O e-mail é sempre o canal principal; o WhatsApp só vai com o consentimento dado no checkout
// (docs/riscos.md: número bloqueado). Na Parte A o envio é simulado: a mensagem fica na caixa
// de saída que a equipe vê em /admin/mensagens; com o Resend configurado, o e-mail também sai de
// verdade (src/lib/email.ts). O WhatsApp real entra depois.

/** O link da mensagem vale por 1 ano (a decisão do prazo de acesso está em aberto). */
const VALIDADE_LINK_PEDIDO_MS = 365 * 24 * 60 * 60 * 1000;
const VALIDADE_LINK_RECUPERAR_MS = 30 * 24 * 60 * 60 * 1000;
const PROPOSITO_PEDIDO = "acesso-pedido";
const PROPOSITO_RECUPERAR = "recuperar-carrinho";

/**
 * Link para a página do pedido, assinado pelo servidor. O pedido guarda só o hash do token
 * original, então a mensagem leva um link próprio, que a página aceita no lugar do token.
 */
export function linkDoPedido(pedidoId: string) {
  const token = assinar(PROPOSITO_PEDIDO, { p: pedidoId }, VALIDADE_LINK_PEDIDO_MS);
  return urlDoSite(`/pedidos/${pedidoId}?token=${token}`);
}

/** O token é um link de mensagem válido para este pedido? */
export function linkDoPedidoConfere(pedidoId: string, token: string) {
  const dados = conferirAssinatura(PROPOSITO_PEDIDO, token) as { p?: unknown } | null;
  return dados?.p === pedidoId;
}

/** Link que remonta o carrinho de um pedido que expirou sem pagamento. */
export function linkParaRecuperar(pedidoId: string) {
  const token = assinar(PROPOSITO_RECUPERAR, { p: pedidoId }, VALIDADE_LINK_RECUPERAR_MS);
  return urlDoSite(`/carrinho/recuperar?token=${token}`);
}

/** Pedido do link de recuperação, ou `null` se o link foi alterado ou venceu. */
export function pedidoDoLinkParaRecuperar(token: string): string | null {
  const dados = conferirAssinatura(PROPOSITO_RECUPERAR, token) as { p?: unknown } | null;
  return typeof dados?.p === "string" ? dados.p : null;
}

/**
 * Registra a mensagem na caixa de saída (/admin/mensagens) e, com o Resend configurado, envia o
 * e-mail de verdade. O WhatsApp só vai com o consentimento dado no checkout (e, até a API real,
 * fica só registrado).
 */
async function enviar(
  pedido: PedidoInterno,
  tipo: "entrega" | "lembrete" | "lembrete_pix",
  assunto: string,
  paragrafos: string[],
  botao: { texto: string; url: string },
) {
  const texto = [...paragrafos, `${botao.texto}: ${botao.url}`].join(" ");
  await registrarMensagem({
    pedidoId: pedido.id,
    canal: "email",
    tipo,
    para: pedido.emailComprador,
    assunto,
    texto,
  });
  await enviarEmail({ para: pedido.emailComprador, assunto, paragrafos, botao });
  if (pedido.aceitaWhatsapp && pedido.whatsapp) {
    await registrarMensagem({
      pedidoId: pedido.id,
      canal: "whatsapp",
      tipo,
      para: pedido.whatsapp,
      assunto,
      texto,
    });
  }
}

/** Depois do pagamento: o link para baixar os originais. */
export async function enviarEntrega(pedido: PedidoInterno) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  await enviar(
    pedido,
    "entrega",
    "Suas fotos estão prontas para baixar",
    [
      `Olá, ${primeiroNome}! Recebemos o pagamento de ${formatarPreco(pedido.totalCentavos)}.`,
      "Suas fotos já estão liberadas em alta resolução, sem marca d'água. Guarde este e-mail: o link é o seu acesso às fotos compradas.",
    ],
    { texto: "Baixar minhas fotos", url: linkDoPedido(pedido.id) },
  );
}

/** Pedido que expirou sem pagamento: convida a refazer a compra. */
export async function enviarLembrete(pedido: PedidoInterno) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  await enviar(
    pedido,
    "lembrete",
    "Suas fotos ainda estão esperando por você",
    [
      `Olá, ${primeiroNome}! O pagamento do seu pedido não chegou e ele expirou.`,
      "As fotos continuam disponíveis: é só refazer a compra.",
    ],
    { texto: "Refazer a compra", url: linkParaRecuperar(pedido.id) },
  );
}

/** Pix gerado e ainda não pago: avisa quanto tempo falta antes de o código vencer. */
export async function enviarLembretePix(pedido: PedidoInterno, agora = Date.now()) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  const minutos = Math.max(1, Math.round((new Date(pedido.expiraEm).getTime() - agora) / 60_000));
  await enviar(
    pedido,
    "lembrete_pix",
    `Seu Pix vence em ${minutos} minutos`,
    [
      `Olá, ${primeiroNome}! Suas fotos estão reservadas, mas o Pix de ${formatarPreco(pedido.totalCentavos)} ainda não foi pago.`,
      `O código vence em ${minutos} minutos. Depois disso, é preciso refazer o pedido.`,
    ],
    { texto: "Pagar com Pix agora", url: linkDoPedido(pedido.id) },
  );
}

/**
 * Avisa cada fotógrafo que teve parte num pedido pago: quanto vendeu e em qual evento. O valor é
 * bruto: a taxa da plataforma sai no saque.
 */
export async function avisarVenda(pedidoId: string) {
  for (const venda of await vendasDoPedidoPorFotografo(pedidoId)) {
    const assunto = `Você vendeu ${formatarPreco(venda.valorCentavos)} no ClicouAí`;
    const paragrafos = [
      `Boa, ${venda.nome}! Uma venda acabou de ser paga: ${venda.itens} ${venda.itens === 1 ? "item" : "itens"} em ${venda.eventos.join(", ")}.`,
      `A sua parte é de ${formatarPreco(venda.valorCentavos)} (valor bruto; a taxa da plataforma sai no saque).`,
    ];
    const botao = { texto: "Ver no painel", url: urlDoSite("/painel/vendas") };
    await registrarMensagem({
      pedidoId,
      canal: "email",
      tipo: "venda",
      para: venda.email,
      assunto,
      texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
    });
    await enviarEmail({ para: venda.email, assunto, paragrafos, botao });
    // Notificação no celular/computador, para quem ativou.
    await enviarPush([venda.usuarioId], {
      titulo: "Você vendeu! 📸",
      corpo: `${formatarPreco(venda.valorCentavos)} em ${venda.eventos.join(", ")}`,
      url: "/painel/vendas",
    });
  }
}

/**
 * Aviso de lote agendado liberado, ao dono e aos colaboradores do evento: uma mensagem por evento
 * e por pessoa, de cada lote. A marcação (`fotos.aviso_liberacao_em`) é feita antes do envio, no
 * mesmo UPDATE que escolhe os lotes: repetir o job não repete o aviso. Devolve quantos e-mails
 * foram registrados.
 */
export async function avisarLotesLiberados(agora = Date.now()) {
  let enviados = 0;
  for (const aviso of await marcarLotesLiberadosParaAviso(agora)) {
    const assunto = `Suas fotos de ${aviso.titulo} foram liberadas`;
    const fotos = `${aviso.fotos} ${aviso.fotos === 1 ? "foto agendada já está" : "fotos agendadas já estão"}`;
    const botao = { texto: "Ver o evento", url: urlDoSite(`/eventos/${aviso.slug}`) };
    for (const pessoa of aviso.destinatarios) {
      const paragrafos = [
        `Olá, ${primeiroNome(pessoa.nome)}! Chegou o horário agendado: ${fotos} à venda em ${aviso.titulo}.`,
        "É uma boa hora para divulgar o link do evento.",
      ];
      await registrarMensagem({
        pedidoId: null,
        canal: "email",
        tipo: "liberacao",
        para: pessoa.email,
        assunto,
        texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
      });
      await enviarEmail({ para: pessoa.email, assunto, paragrafos, botao });
      enviados++;
    }
  }
  return enviados;
}

/**
 * Envia um e-mail que leva um segredo (código de confirmação, link de redefinição de senha). Não
 * vai para a caixa de saída: quem lê a caixa não pode entrar na conta de ninguém. Sem o Resend,
 * fora da produção (desenvolvimento local e testes), o segredo aparece só no log do servidor, para
 * dar para testar; na produção, nunca: o envio falha e o log registra só o assunto.
 */
async function enviarComSegredo(email: Email, segredo: string): Promise<boolean> {
  if (emailConfigurado()) return enviarEmail(email);
  if (emProducao()) {
    console.error(`[email] não enviado, envio de e-mail indisponível: ${email.assunto}`);
    return false;
  }
  console.info(`[desenvolvimento] ${email.assunto} (${email.para}): ${segredo}`);
  return true;
}

/** Código de 6 dígitos que confirma o e-mail do cadastro. Devolve se o e-mail saiu. */
export async function enviarCodigoDeConfirmacao(para: string, nome: string, codigo: string) {
  return enviarComSegredo(
    {
      para,
      assunto: "Seu código de confirmação do ClicouAí",
      paragrafos: [
        `Olá, ${primeiroNome(nome)}! Para confirmar seu e-mail e liberar sua conta, digite este código na tela do ClicouAí. Ele vale por 15 minutos.`,
        "Não passe o código para ninguém: a equipe do ClicouAí nunca pede. Se você não tentou criar ou acessar uma conta, ignore este e-mail.",
      ],
      destaque: codigo,
    },
    `código ${codigo}`,
  );
}

/**
 * Código de 6 dígitos da segunda etapa do login do gestor (src/servicos/codigo-login.ts). Como
 * todo segredo, não vai para a caixa de saída. Devolve se o e-mail saiu.
 */
export async function enviarCodigoDeAcessoDoGestor(para: string, nome: string, codigo: string) {
  return enviarComSegredo(
    {
      para,
      assunto: "Seu código de acesso à gestão do ClicouAí",
      paragrafos: [
        `Olá, ${primeiroNome(nome)}! Para terminar de entrar na gestão do ClicouAí, digite este código na tela de verificação. Ele vale por 10 minutos e funciona uma vez só.`,
        "Não passe o código para ninguém: a equipe do ClicouAí nunca pede.",
        "Se não foi você que tentou entrar, alguém sabe a sua senha: troque sua senha agora e avise a equipe.",
      ],
      destaque: codigo,
    },
    `código ${codigo}`,
  );
}

/** Link de "Esqueci a senha". O token vai depois do #: não chega ao servidor nem aos logs. */
export async function enviarLinkDeRedefinicao(para: string, nome: string, token: string) {
  const url = urlDoSite(`/entrar/nova-senha#token=${token}`);
  return enviarComSegredo(
    {
      para,
      assunto: "Redefina sua senha do ClicouAí",
      paragrafos: [
        `Olá, ${primeiroNome(nome)}! Recebemos um pedido para redefinir a senha da sua conta no ClicouAí.`,
        "O link vale por 30 minutos e funciona uma vez só. Se você não pediu, ignore este e-mail: sua senha continua a mesma.",
      ],
      botao: { texto: "Criar uma nova senha", url },
    },
    url,
  );
}

/** "Esqueci a senha" de quem só entra com o Google: não há senha para redefinir. */
export async function avisarContaSoComGoogle(para: string, nome: string) {
  return enviarEmail({
    para,
    assunto: "Sua conta do ClicouAí entra com o Google",
    paragrafos: [
      `Olá, ${primeiroNome(nome)}! Recebemos um pedido para redefinir a senha da sua conta, mas ela não tem senha: você entra com o botão "Entrar com Google", usando este mesmo e-mail.`,
      "Se quiser também uma senha, entre com o Google e crie uma em Senha e segurança. Se você não pediu, ignore este e-mail.",
    ],
    botao: { texto: "Entrar no ClicouAí", url: urlDoSite("/entrar") },
  });
}

/** "Esqueci a senha" de um gestor de GESTORES: a senha vem da variável, não da tela. */
export async function avisarSenhaDeGestor(para: string, nome: string) {
  return enviarEmail({
    para,
    assunto: "A senha da sua conta de gestão do ClicouAí",
    paragrafos: [
      `Olá, ${primeiroNome(nome)}! Recebemos um pedido para redefinir a senha da sua conta, mas a senha das contas de gestão é definida pela equipe técnica (variável GESTORES) e não pode ser trocada pelo site.`,
      "Para trocar, gere outro hash com npm run senha:hash e atualize a variável. Se você não pediu, ignore este e-mail.",
    ],
  });
}

/** Aviso de segurança depois do "Esqueci a senha": a senha foi redefinida pelo link do e-mail. */
export async function avisarRedefinicaoDeSenha(para: string, nome: string, redefinidaEm: string) {
  const assunto = "A senha da sua conta no ClicouAí foi redefinida";
  const paragrafos = [
    `Olá, ${primeiroNome(nome)}! A senha da sua conta no ClicouAí foi redefinida pelo link de "Esqueci a senha" em ${formatarDataEHora(redefinidaEm)}. Todas as sessões abertas foram encerradas.`,
    "Se foi você, não precisa fazer nada.",
    "Se não foi você, responda este e-mail agora para bloquearmos a conta.",
  ];
  const botao = { texto: "Entrar no ClicouAí", url: urlDoSite("/entrar") };
  await registrarMensagem({
    pedidoId: null,
    canal: "email",
    tipo: "seguranca",
    para,
    assunto,
    texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
  });
  await enviarEmail({ para, assunto, paragrafos, botao });
}

function primeiroNome(nome: string) {
  return nome.split(" ")[0];
}

/**
 * Aviso de segurança: o CPF/CNPJ de recebimento (a chave Pix do saque) mudou. Vai para o e-mail
 * da conta e fica na caixa de saída; não leva o documento novo, só o que a pessoa precisa para
 * reagir se não foi ela.
 */
export async function avisarTrocaDeDocumento(
  para: string,
  nome: string,
  trocadoEm: string,
  saquesLiberadosEm: string,
) {
  const assunto = "O CPF/CNPJ de recebimento da sua conta foi alterado";
  const paragrafos = [
    `Olá, ${nome.split(" ")[0]}! O CPF/CNPJ que recebe os saques da sua conta no ClicouAí foi alterado em ${formatarDataEHora(trocadoEm)}.`,
    `Por segurança, os saques ficam bloqueados até ${formatarDataEHora(saquesLiberadosEm)}, e a chave Pix precisa ser confirmada de novo. As outras sessões da conta foram encerradas.`,
    "Se não foi você, responda este e-mail agora para bloquearmos a conta antes de qualquer saque, e troque a sua senha.",
  ];
  const botao = { texto: "Conferir meu perfil", url: urlDoSite("/painel/perfil") };
  await registrarMensagem({
    pedidoId: null,
    canal: "email",
    tipo: "seguranca",
    para,
    assunto,
    texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
  });
  await enviarEmail({ para, assunto, paragrafos, botao });
}

/**
 * Aviso de segurança: a senha da conta foi trocada (ou criada, na conta que só entrava com o
 * Google). Vai para o e-mail da conta e fica na caixa de saída; nunca leva a senha.
 */
export async function avisarTrocaDeSenha(
  para: string,
  nome: string,
  trocadaEm: string,
  criada: boolean,
) {
  const assunto = criada
    ? "Uma senha foi criada para a sua conta no ClicouAí"
    : "A senha da sua conta no ClicouAí foi trocada";
  const paragrafos = [
    `Olá, ${nome.split(" ")[0]}! ${
      criada ? "Uma senha foi criada para a sua conta" : "A senha da sua conta foi trocada"
    } no ClicouAí em ${formatarDataEHora(trocadaEm)}. As outras sessões da conta foram encerradas.`,
    "Se foi você, não precisa fazer nada.",
    "Se não foi você, responda este e-mail agora para bloquearmos a conta. Se ela também entra com o Google, entre com ele, troque a senha em Senha e segurança e saia de todos os dispositivos.",
  ];
  const botao = { texto: "Senha e segurança", url: urlDoSite("/conta/seguranca") };
  await registrarMensagem({
    pedidoId: null,
    canal: "email",
    tipo: "seguranca",
    para,
    assunto,
    texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
  });
  await enviarEmail({ para, assunto, paragrafos, botao });
}
