// Dados de exemplo para desenvolver as telas antes do banco (docs/tarefas.md, Parte A).
// As imagens vêm do picsum.photos; na Fase 12 passam a ser as prévias do R2 via CDN.

import type { Evento, Foto, Fotografo } from "../tipos";

export const fotografos: Fotografo[] = [
  {
    id: "f1a7c0de-0000-4000-8000-000000000001",
    nomePublico: "Lia Ramos Fotografia",
    slug: "lia-ramos",
  },
  { id: "f1a7c0de-0000-4000-8000-000000000002", nomePublico: "Pedro Kenji", slug: "pedro-kenji" },
  {
    id: "f1a7c0de-0000-4000-8000-000000000003",
    nomePublico: "Clique Esportes",
    slug: "clique-esportes",
  },
];

type EventoBase = Omit<Evento, "id"> & { quantidadeFotos: number };

const eventosBase: EventoBase[] = [
  {
    fotografoId: fotografos[0].id,
    titulo: "Corrida de Rua Parque Ibirapuera 10K",
    slug: "corrida-ibirapuera-10k-2026",
    data: "2026-09-27",
    cidade: "São Paulo, SP",
    precoPadraoCentavos: 1990,
    status: "publicado",
    quantidadeFotos: 180,
  },
  {
    fotografoId: fotografos[1].id,
    titulo: "Formatura Medicina UFMG 2026",
    slug: "formatura-medicina-ufmg-2026",
    data: "2026-09-20",
    cidade: "Belo Horizonte, MG",
    precoPadraoCentavos: 2990,
    status: "publicado",
    quantidadeFotos: 96,
  },
  {
    fotografoId: fotografos[2].id,
    titulo: "Copa Regional de Futsal Sub-17",
    slug: "copa-futsal-sub17-2026",
    data: "2026-09-13",
    cidade: "Curitiba, PR",
    precoPadraoCentavos: 1490,
    status: "publicado",
    quantidadeFotos: 72,
  },
  {
    fotografoId: fotografos[0].id,
    titulo: "Meia Maratona do Rio",
    slug: "meia-maratona-rio-2026",
    data: "2026-08-30",
    cidade: "Rio de Janeiro, RJ",
    precoPadraoCentavos: 2490,
    status: "publicado",
    quantidadeFotos: 240,
  },
  {
    fotografoId: fotografos[1].id,
    titulo: "Festa Junina Colégio Horizonte",
    slug: "festa-junina-colegio-horizonte-2026",
    data: "2026-06-21",
    cidade: "Campinas, SP",
    precoPadraoCentavos: 990,
    status: "publicado",
    quantidadeFotos: 48,
  },
  {
    fotografoId: fotografos[2].id,
    titulo: "Travessia a Nado Lagoa da Conceição",
    slug: "travessia-lagoa-conceicao-2026",
    data: "2026-10-18",
    cidade: "Florianópolis, SC",
    precoPadraoCentavos: 1990,
    status: "rascunho",
    quantidadeFotos: 0,
  },
];

function uuidDeExemplo(prefixo: string, n: number) {
  return `${prefixo}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const eventos: Evento[] = eventosBase.map((base, i) => ({
  id: uuidDeExemplo("e7e70000", i + 1),
  fotografoId: base.fotografoId,
  titulo: base.titulo,
  slug: base.slug,
  data: base.data,
  cidade: base.cidade,
  precoPadraoCentavos: base.precoPadraoCentavos,
  status: base.status,
}));

function gerarFotos(): Foto[] {
  const fotos: Foto[] = [];
  let contador = 0;
  eventosBase.forEach((base, i) => {
    const evento = eventos[i];
    for (let n = 0; n < base.quantidadeFotos; n++) {
      contador++;
      // Uma em cada quatro fotos é vertical, como acontece num evento real.
      const vertical = n % 4 === 3;
      const [largura, altura] = vertical ? [1067, 1600] : [1600, 1067];
      const seed = `clicouai-${evento.slug}-${n}`;
      fotos.push({
        id: uuidDeExemplo("f0700000", contador),
        eventoId: evento.id,
        urlPrevia: `https://picsum.photos/seed/${seed}/${largura}/${altura}`,
        urlMiniatura: `https://picsum.photos/seed/${seed}/${Math.round(largura / 4)}/${Math.round(altura / 4)}`,
        largura,
        altura,
        precoCentavos: evento.precoPadraoCentavos,
        status: "pronta",
        // Ordem estável: fotos mais antigas primeiro, como saem da câmera.
        criadoEm: new Date(Date.UTC(2026, 0, 1, 0, 0, contador)).toISOString(),
        excluidaEm: null,
      });
    }
  });
  // Casos que a galeria precisa esconder.
  fotos[3].excluidaEm = "2026-10-01T12:00:00.000Z";
  fotos[5].status = "processando";
  return fotos;
}

export const fotos: Foto[] = gerarFotos();
