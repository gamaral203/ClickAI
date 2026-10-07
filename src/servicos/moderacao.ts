import "server-only";

import {
  buscarDenuncia,
  excluirFotoPelaEquipe,
  listarDenuncias,
  mudarStatusDenuncia,
  mudarStatusEventoPelaEquipe,
  registrarMensagem,
  type DenunciaDoAdmin,
} from "@/dados";
import { rotuloDoMotivo } from "@/lib/denuncias";

// Moderação das denúncias (docs/arquitetura.md, "Denúncia"). Só a equipe põe e tira um evento
// de `revisao`. Cada decisão avisa as partes por e-mail (simulado até a Fase 13); o fotógrafo
// nunca recebe o contato de quem denunciou.

export type ResultadoModeracao = { ok: true } | { ok: false; erro: string };

const JA_DECIDIDA: ResultadoModeracao = {
  ok: false,
  erro: "Esta denúncia já foi decidida por outra pessoa. Atualize a página.",
};

function protocolo(d: DenunciaDoAdmin) {
  return d.id.slice(0, 8).toUpperCase();
}

async function avisar(para: string | null, assunto: string, texto: string) {
  if (!para) return;
  await registrarMensagem({
    pedidoId: null,
    canal: "email",
    tipo: "denuncia",
    para,
    assunto,
    texto,
  });
}

/** Começa a análise; opcionalmente já tira o evento do ar enquanto isso. */
export async function iniciarAnalise(
  id: string,
  usuarioId: string,
  tirarDoAr: boolean,
): Promise<ResultadoModeracao> {
  const denuncia = await buscarDenuncia(id);
  if (!denuncia) return { ok: false, erro: "Denúncia não encontrada." };
  if (!(await mudarStatusDenuncia(id, ["recebida"], "em_analise", usuarioId))) return JA_DECIDIDA;
  if (tirarDoAr && (await mudarStatusEventoPelaEquipe(denuncia.eventoId, "publicado", "revisao"))) {
    await avisar(
      denuncia.donoEmail,
      `Seu evento "${denuncia.evento.titulo}" está em revisão`,
      `Recebemos uma denúncia sobre o evento "${denuncia.evento.titulo}" (motivo: ${rotuloDoMotivo(denuncia.motivo)}). ` +
        "Enquanto analisamos, ele fica fora do ar. Quem já comprou continua baixando. Respondemos assim que terminarmos.",
    );
  }
  return { ok: true };
}

/**
 * Denúncia procedente: a foto denunciada sai da galeria, ou o evento fica em `revisao` (fora
 * do ar até a equipe liberar). Quem já comprou continua baixando nos dois casos.
 */
export async function marcarProcedente(id: string, usuarioId: string): Promise<ResultadoModeracao> {
  const denuncia = await buscarDenuncia(id);
  if (!denuncia) return { ok: false, erro: "Denúncia não encontrada." };
  if (!(await mudarStatusDenuncia(id, ["recebida", "em_analise"], "procedente", usuarioId))) {
    return JA_DECIDIDA;
  }
  let consequencia: string;
  if (denuncia.alvoTipo === "foto" && denuncia.fotoId) {
    await excluirFotoPelaEquipe(denuncia.fotoId);
    consequencia = "A foto foi retirada da galeria.";
  } else {
    await mudarStatusEventoPelaEquipe(denuncia.eventoId, "publicado", "revisao");
    consequencia = "O evento ficou fora do ar.";
  }
  const motivo = rotuloDoMotivo(denuncia.motivo);
  await avisar(
    denuncia.contatoEmail,
    `Sua denúncia foi aceita (protocolo ${protocolo(denuncia)})`,
    `Analisamos sua denúncia sobre "${denuncia.evento.titulo}" e ela procede. ${consequencia}`,
  );
  const textoFotografo =
    `Recebemos uma denúncia sobre "${denuncia.evento.titulo}" (motivo: ${motivo}) e, depois da análise, ` +
    `ela foi aceita. ${consequencia} Se discordar, responda este e-mail.`;
  await avisar(
    denuncia.donoEmail,
    `Denúncia aceita em "${denuncia.evento.titulo}"`,
    textoFotografo,
  );
  // Foto enviada por colaborador: ele também é avisado.
  await avisar(
    denuncia.foto?.autorEmail ?? null,
    `Denúncia aceita em "${denuncia.evento.titulo}"`,
    textoFotografo,
  );
  return { ok: true };
}

/**
 * Denúncia improcedente: nada sai do ar. Se o evento estava em revisão e não há outra denúncia
 * aberta ou aceita sobre ele, volta a ficar publicado.
 */
export async function marcarImprocedente(
  id: string,
  usuarioId: string,
): Promise<ResultadoModeracao> {
  const denuncia = await buscarDenuncia(id);
  if (!denuncia) return { ok: false, erro: "Denúncia não encontrada." };
  if (!(await mudarStatusDenuncia(id, ["recebida", "em_analise"], "improcedente", usuarioId))) {
    return JA_DECIDIDA;
  }
  await avisar(
    denuncia.contatoEmail,
    `Resultado da sua denúncia (protocolo ${protocolo(denuncia)})`,
    `Analisamos sua denúncia sobre "${denuncia.evento.titulo}" e não encontramos motivo para retirar o conteúdo. ` +
      "Se tiver mais informações, responda este e-mail.",
  );
  const outras = (await listarDenuncias()).filter(
    (d) =>
      d.id !== id &&
      d.eventoId === denuncia.eventoId &&
      d.alvoTipo === "evento" &&
      d.status !== "improcedente",
  );
  if (
    denuncia.evento.status === "revisao" &&
    outras.length === 0 &&
    (await mudarStatusEventoPelaEquipe(denuncia.eventoId, "revisao", "publicado"))
  ) {
    await avisar(
      denuncia.donoEmail,
      `Seu evento "${denuncia.evento.titulo}" voltou ao ar`,
      `Terminamos a análise da denúncia sobre "${denuncia.evento.titulo}" e não encontramos problema. O evento já está no ar de novo.`,
    );
  }
  return { ok: true };
}
