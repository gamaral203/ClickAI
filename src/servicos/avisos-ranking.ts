import "server-only";

import {
  contatosDosFotografos,
  registrarMensagem,
  topCliquesDoEvento,
  vendidasDoPedidoPorEvento,
} from "@/dados";
import { enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/endereco";
import { enviarPush } from "@/lib/push";
import {
  avisosDoRanking,
  rotuloDoColega,
  type AvisoDeRanking,
  type Posicao,
} from "@/lib/ranking-avisos";

// Avisos do ranking da equipe do evento (Top Cliques), logo depois de uma venda paga: quem foi
// ultrapassado, quem assumiu o 1º lugar. Para incentivar a equipe a divulgar e vender mais. Vai
// por e-mail (registrado na caixa de saída) e por notificação, para quem ativou. Os colegas
// aparecem pelo nome público (ou "um colega", sem nome). Uma falha
// aqui nunca desfaz o pagamento (quem chama trata o erro).

function texto(aviso: AvisoDeRanking, ranking: Posicao[], evento: string) {
  if (aviso.tipo === "voce_lider") {
    return {
      titulo: "Você está em 1º lugar! 🏆",
      corpo: `Você assumiu o 1º lugar no ranking de ${evento}. Continue divulgando!`,
    };
  }
  const rotulo = rotuloDoColega(ranking, aviso.por);
  const colega = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
  if (aviso.tipo === "novo_lider") {
    return {
      titulo: "Novo 1º lugar no ranking 🏆",
      corpo: `${colega} assumiu o 1º lugar no ranking de ${evento}. Divulgue o link e busque a liderança!`,
    };
  }
  return {
    titulo: "Você foi ultrapassado no ranking 🏁",
    corpo: aviso.virouLider
      ? `${colega} passou você e assumiu o 1º lugar no ranking de ${evento}. Divulgue o link e recupere a posição!`
      : `${colega} ultrapassou você no ranking de ${evento}. Agora você está em ${aviso.posicao}º lugar.`,
  };
}

export async function avisarRanking(pedidoId: string) {
  for (const [eventoId, evento] of await vendidasDoPedidoPorEvento(pedidoId)) {
    const ranking = await topCliquesDoEvento(eventoId);
    const avisos = avisosDoRanking(ranking, evento.vendidas);
    if (avisos.length === 0) continue;
    const contatos = await contatosDosFotografos(avisos.map((a) => a.fotografoId));
    for (const aviso of avisos) {
      const contato = contatos.get(aviso.fotografoId);
      if (!contato) continue;
      const { titulo, corpo } = texto(aviso, ranking, evento.titulo);
      // O dono vê o ranking na página do evento; o colaborador, em Colaborações.
      const caminho =
        aviso.fotografoId === evento.dono
          ? `/painel/eventos/${eventoId}?secao=ranking`
          : `/painel/colaboracoes#colaboracao-${eventoId}`;
      const assunto = titulo.replace(/ [^\p{L}\p{N}!]+$/u, "");
      const paragrafos = [`Olá, ${contato.nome.split(" ")[0]}!`, corpo];
      const botao = { texto: "Ver o ranking", url: urlDoSite(caminho) };
      await registrarMensagem({
        pedidoId,
        canal: "email",
        tipo: "ranking",
        para: contato.email,
        assunto,
        texto: [...paragrafos, `${botao.texto}: ${botao.url}`].join(" "),
      });
      await enviarEmail({ para: contato.email, assunto, paragrafos, botao });
      await enviarPush([contato.usuarioId], { titulo, corpo, url: caminho });
    }
  }
}
