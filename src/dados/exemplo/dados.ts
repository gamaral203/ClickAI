// Dados de exemplo para desenvolver as telas antes do banco (docs/tarefas.md, Parte A).
// As prévias e miniaturas ficam em public/exemplo/, já com a marca d'água gravada, geradas por
// `npm run exemplos:gerar` com a mesma função do processamento real (src/servicos/imagens.ts).
// Na Fase 12 passam a ser as prévias do R2 servidas pela CDN.
//
// Cada evento existe para exercitar uma regra da arquitetura; o comentário ao lado diz qual.
// Nomes, CPFs e contas são fictícios.

import { createHash } from "node:crypto";

import type {
  Categoria,
  Colaborador,
  Cupom,
  Evento,
  FaixaDesconto,
  Foto,
  FotografoConta,
  Loja,
  NumeroEncontrado,
  Pacote,
  Pasta,
} from "../tipos";
import imagens from "./imagens.json";

function uuid(prefixo: string, n: number) {
  return `${prefixo}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// ---------------------------------------------------------------- Fotógrafos e categorias

export const fotografos: FotografoConta[] = [
  {
    id: uuid("f1a7c0de", 1),
    usuarioId: uuid("05e70000", 1),
    nomePublico: "Lia Ramos Fotografia",
    slug: "lia-ramos",
    bio: "Corridas de rua e provas de endurance em São Paulo e no Rio.",
    fotoPerfil: null,
    capa: null,
    redesSociais: { instagram: "liaramos.foto" },
    cpfCnpj: "00.000.000/0001-00",
    contaRecebimentoId: "conta-exemplo-1",
    comissaoPct: 10,
    frequenciaRepasse: "semanal",
    diaRepasse: 5,
  },
  {
    id: uuid("f1a7c0de", 2),
    usuarioId: uuid("05e70000", 2),
    nomePublico: "Pedro Kenji",
    slug: "pedro-kenji",
    bio: "Formaturas, festas e eventos sociais.",
    fotoPerfil: null,
    capa: null,
    redesSociais: { site: "https://exemplo.com.br" },
    cpfCnpj: "000.000.000-00",
    contaRecebimentoId: "conta-exemplo-2",
    comissaoPct: 10,
    frequenciaRepasse: "mensal",
    diaRepasse: 10,
  },
  {
    id: uuid("f1a7c0de", 3),
    usuarioId: uuid("05e70000", 3),
    nomePublico: "Clique Esportes",
    slug: "clique-esportes",
    bio: null,
    fotoPerfil: null,
    capa: null,
    redesSociais: {},
    cpfCnpj: "00.000.000/0002-00",
    // Sem conta de recebimento: não pode publicar evento novo (docs/riscos.md).
    contaRecebimentoId: null,
    comissaoPct: 10,
    frequenciaRepasse: "diaria",
    diaRepasse: null,
  },
];

const [lia, pedro, clique] = fotografos;

export const categorias: Categoria[] = [
  { id: uuid("ca7e0000", 1), nome: "Corrida", slug: "corrida" },
  { id: uuid("ca7e0000", 2), nome: "Formatura", slug: "formatura" },
  { id: uuid("ca7e0000", 3), nome: "Esportes", slug: "esportes" },
  { id: uuid("ca7e0000", 4), nome: "Festas", slug: "festas" },
  { id: uuid("ca7e0000", 5), nome: "Esportes aquáticos", slug: "esportes-aquaticos" },
];

const [corrida, formatura, esportes, festas, aquaticos] = categorias;

// ---------------------------------------------------------------- Eventos

/** Valores padrão de um evento público, com liberação automática. */
const padrao = {
  capa: null,
  status: "publicado",
  visibilidade: "publico",
  listado: true,
  fotosSoAposBusca: false,
  liberacao: "automatica",
  liberadoEm: null,
  filtroHorario: false,
  listarNaoIdentificadas: false,
  ordenacao: "captura",
} as const satisfies Partial<Evento>;

type EventoBase = Omit<Evento, "id"> & { quantidadeFotos: number };

const eventosBase: EventoBase[] = [
  {
    // Evento completo: pastas, colaborador, números de peito, filtro por horário,
    // não identificadas, preço individual, faixas de desconto e pacote.
    ...padrao,
    fotografoId: lia.id,
    categoriaId: corrida.id,
    titulo: "Corrida de Rua Parque Ibirapuera 10K",
    slug: "corrida-ibirapuera-10k-2026",
    inicioEm: "2026-09-27T07:00:00-03:00",
    fimEm: "2026-09-27T10:00:00-03:00",
    local: "Parque Ibirapuera, portão 3",
    cidade: "São Paulo",
    estado: "SP",
    precoFotoCentavos: 1990,
    precoVideoCentavos: 3990,
    filtroHorario: true,
    listarNaoIdentificadas: true,
    quantidadeFotos: 180,
  },
  {
    // Liberação agendada que já passou: as fotos aparecem.
    ...padrao,
    fotografoId: pedro.id,
    categoriaId: formatura.id,
    titulo: "Formatura Medicina UFMG 2026",
    slug: "formatura-medicina-ufmg-2026",
    inicioEm: "2026-09-20T20:00:00-03:00",
    fimEm: "2026-09-21T02:00:00-03:00",
    local: "Mineirinho",
    cidade: "Belo Horizonte",
    estado: "MG",
    precoFotoCentavos: 2990,
    precoVideoCentavos: 4990,
    liberacao: "agendada",
    liberadoEm: "2026-09-25T12:00:00-03:00",
    ordenacao: "envio",
    quantidadeFotos: 96,
  },
  {
    ...padrao,
    fotografoId: clique.id,
    categoriaId: esportes.id,
    titulo: "Copa Regional de Futsal Sub-17",
    slug: "copa-futsal-sub17-2026",
    inicioEm: "2026-09-13T09:00:00-03:00",
    fimEm: "2026-09-13T18:00:00-03:00",
    local: "Ginásio do Tarumã",
    cidade: "Curitiba",
    estado: "PR",
    precoFotoCentavos: 1490,
    precoVideoCentavos: 2990,
    quantidadeFotos: 72,
  },
  {
    // Números de peito e pacote com preço por foto.
    ...padrao,
    fotografoId: lia.id,
    categoriaId: corrida.id,
    titulo: "Meia Maratona do Rio",
    slug: "meia-maratona-rio-2026",
    inicioEm: "2026-08-30T06:30:00-03:00",
    fimEm: "2026-08-30T10:30:00-03:00",
    local: "Aterro do Flamengo",
    cidade: "Rio de Janeiro",
    estado: "RJ",
    precoFotoCentavos: 2490,
    precoVideoCentavos: 4990,
    quantidadeFotos: 240,
  },
  {
    // Não listado: fora da lista de eventos, mas abre pelo link.
    ...padrao,
    fotografoId: pedro.id,
    categoriaId: festas.id,
    titulo: "Festa Junina Colégio Horizonte",
    slug: "festa-junina-colegio-horizonte-2026",
    inicioEm: "2026-06-21T15:00:00-03:00",
    fimEm: "2026-06-21T21:00:00-03:00",
    local: "Colégio Horizonte",
    cidade: "Campinas",
    estado: "SP",
    precoFotoCentavos: 990,
    precoVideoCentavos: 1990,
    visibilidade: "nao_listado",
    listado: false,
    quantidadeFotos: 48,
  },
  {
    // Rascunho: não aparece em lugar nenhum.
    ...padrao,
    fotografoId: clique.id,
    categoriaId: aquaticos.id,
    titulo: "Travessia a Nado Lagoa da Conceição",
    slug: "travessia-lagoa-conceicao-2026",
    inicioEm: "2026-10-18T08:00:00-03:00",
    fimEm: "2026-10-18T12:00:00-03:00",
    local: "Lagoa da Conceição",
    cidade: "Florianópolis",
    estado: "SC",
    precoFotoCentavos: 1990,
    precoVideoCentavos: 3990,
    status: "rascunho",
    quantidadeFotos: 0,
  },
  {
    // Fotos só após a busca: a galeria aberta fica vazia.
    ...padrao,
    fotografoId: lia.id,
    categoriaId: corrida.id,
    titulo: "Corrida Noturna Porto Alegre 5K",
    slug: "corrida-noturna-poa-5k-2026",
    inicioEm: "2026-09-05T19:30:00-03:00",
    fimEm: "2026-09-05T22:00:00-03:00",
    local: "Orla do Guaíba",
    cidade: "Porto Alegre",
    estado: "RS",
    precoFotoCentavos: 1790,
    precoVideoCentavos: 3490,
    fotosSoAposBusca: true,
    quantidadeFotos: 60,
  },
  {
    // Com senha (senha de exemplo: formatura2026).
    ...padrao,
    fotografoId: pedro.id,
    categoriaId: formatura.id,
    titulo: "Formatura Direito PUC-Rio 2026",
    slug: "formatura-direito-puc-rio-2026",
    inicioEm: "2026-08-15T21:00:00-03:00",
    fimEm: "2026-08-16T03:00:00-03:00",
    local: "Jockey Club Brasileiro",
    cidade: "Rio de Janeiro",
    estado: "RJ",
    precoFotoCentavos: 3490,
    precoVideoCentavos: 5990,
    visibilidade: "senha",
    quantidadeFotos: 36,
  },
  {
    // Liberação agendada no futuro: mostra a contagem regressiva.
    ...padrao,
    fotografoId: clique.id,
    categoriaId: aquaticos.id,
    titulo: "Campeonato de Surf Praia Mole",
    slug: "campeonato-surf-praia-mole-2026",
    inicioEm: "2026-10-03T07:00:00-03:00",
    fimEm: "2026-10-04T17:00:00-03:00",
    local: "Praia Mole",
    cidade: "Florianópolis",
    estado: "SC",
    precoFotoCentavos: 2490,
    precoVideoCentavos: 4490,
    liberacao: "agendada",
    liberadoEm: "2026-12-12T18:00:00-03:00",
    quantidadeFotos: 24,
  },
  {
    // Liberação manual ainda não feita: as fotos não aparecem.
    ...padrao,
    fotografoId: pedro.id,
    categoriaId: festas.id,
    titulo: "Casamento Ana e Rafael",
    slug: "casamento-ana-rafael-2026",
    inicioEm: "2026-10-03T16:00:00-03:00",
    fimEm: "2026-10-04T01:00:00-03:00",
    local: "Fazenda Santa Bárbara",
    cidade: "Itu",
    estado: "SP",
    precoFotoCentavos: 2990,
    precoVideoCentavos: 5990,
    liberacao: "manual",
    quantidadeFotos: 24,
  },
];

export const eventos: Evento[] = eventosBase.map(({ quantidadeFotos, ...evento }, i) => {
  void quantidadeFotos;
  return { id: uuid("e7e70000", i + 1), ...evento };
});

function eventoPorSlug(slug: string) {
  const evento = eventos.find((e) => e.slug === slug);
  if (!evento) throw new Error(`Evento de exemplo ${slug} não existe`);
  return evento;
}

const ibirapuera = eventoPorSlug("corrida-ibirapuera-10k-2026");
const meiaRio = eventoPorSlug("meia-maratona-rio-2026");
const noturnaPoa = eventoPorSlug("corrida-noturna-poa-5k-2026");

/**
 * Hash das senhas dos eventos com visibilidade "senha", fora do tipo público `Evento`.
 * O banco usará um hash de senha de verdade (argon2/bcrypt) na Fase 11.
 */
export const senhasEventos = new Map<string, string>([
  [
    eventoPorSlug("formatura-direito-puc-rio-2026").id,
    createHash("sha256").update("formatura2026").digest("hex"),
  ],
]);

// ---------------------------------------------------------------- Pastas e colaboradores

export const pastas: Pasta[] = [
  { id: uuid("ba57a000", 1), eventoId: ibirapuera.id, nome: "Largada", ordem: 1 },
  { id: uuid("ba57a000", 2), eventoId: ibirapuera.id, nome: "Percurso", ordem: 2 },
  { id: uuid("ba57a000", 3), eventoId: ibirapuera.id, nome: "Chegada", ordem: 3 },
];

export const colaboradores: Colaborador[] = [
  {
    id: uuid("c01ab000", 1),
    eventoId: ibirapuera.id,
    fotografoId: pedro.id,
    comissaoDonoPct: 30,
    nota: "Cobre o km 5 e a chegada",
  },
];

// ---------------------------------------------------------------- Fotos

function gerarFotos(): Foto[] {
  const fotos: Foto[] = [];
  let contador = 0;
  eventosBase.forEach((base, i) => {
    const evento = eventos[i];
    const inicio = new Date(evento.inicioEm).getTime();
    const duracao = new Date(evento.fimEm).getTime() - inicio;
    for (let n = 0; n < base.quantidadeFotos; n++) {
      contador++;
      // Cada evento começa num ponto diferente do ciclo de imagens, para não parecerem iguais.
      const imagem = (n + i * 5) % imagens.length;
      const { largura, altura } = imagens[imagem];
      const ehIbirapuera = evento.id === ibirapuera.id;
      // No Ibirapuera, o colaborador enviou as fotos da chegada (último terço).
      const terco = Math.floor((n * 3) / base.quantidadeFotos);
      fotos.push({
        id: uuid("f0700000", contador),
        eventoId: evento.id,
        pastaId: ehIbirapuera ? pastas[terco].id : null,
        enviadaPor: ehIbirapuera && terco === 2 ? pedro.id : evento.fotografoId,
        tipo: "foto",
        urlPrevia: `/exemplo/previas/${imagem}.webp`,
        urlMiniatura: `/exemplo/miniaturas/${imagem}.webp`,
        nomeArquivo: `IMG_${String(4000 + n).padStart(4, "0")}.jpg`,
        largura,
        altura,
        duracaoS: null,
        // Capturas espalhadas ao longo do evento, em ordem.
        capturadaEm: new Date(
          inicio + Math.round((duracao * n) / Math.max(1, base.quantidadeFotos)),
        ).toISOString(),
        precoCentavos: null,
        ordem: n + 1,
        status: "pronta",
        // Envio estável e posterior ao evento.
        criadoEm: new Date(Date.UTC(2026, 9, 1, 0, 0, contador)).toISOString(),
        excluidaEm: null,
      });
    }
  });
  // Casos que a galeria precisa tratar.
  fotos[3].excluidaEm = "2026-10-01T12:00:00.000Z";
  fotos[5].status = "processando";
  fotos[9].precoCentavos = 2990; // preço individual acima do preço do evento
  return fotos;
}

export const fotos: Foto[] = gerarFotos();

/**
 * Original de cada foto de exemplo: a mesma imagem do picsum usada por
 * scripts/gerar-exemplos.ts, sem marca d'água e em 2400 px. Faz o papel do bucket privado
 * de originais; na Fase 12 vira a URL assinada do R2.
 */
export function urlOriginalDeExemplo(foto: Foto) {
  const indice = Number(foto.urlPrevia.match(/(\d+)\.webp$/)?.[1]);
  const vertical = indice % 4 === 3;
  const [largura, altura] = vertical ? [1600, 2400] : [2400, 1600];
  return `https://picsum.photos/seed/clicouai-exemplo-${indice}/${largura}/${altura}.jpg`;
}

// ---------------------------------------------------------------- Números de peito

/**
 * Números encontrados pelo reconhecimento (tabela `numeros`). Cada foto das corridas tem um
 * ou dois números de uma lista de inscritos; uma em cada sete não tem nenhum, e entra em
 * "não identificadas".
 */
function gerarNumeros(): NumeroEncontrado[] {
  const resultado: NumeroEncontrado[] = [];
  for (const evento of [ibirapuera, meiaRio, noturnaPoa]) {
    const doEvento = fotos.filter((f) => f.eventoId === evento.id);
    doEvento.forEach((foto, n) => {
      if (n % 7 === 6) return;
      resultado.push({ fotoId: foto.id, numero: String(1000 + ((n * 37) % 60)) });
      if (n % 3 === 0) resultado.push({ fotoId: foto.id, numero: String(1000 + ((n * 11) % 60)) });
    });
  }
  return resultado;
}

export const numeros: NumeroEncontrado[] = gerarNumeros();

// ---------------------------------------------------------------- Descontos

export const faixasDesconto: FaixaDesconto[] = [
  // Regra padrão da Lia, para todos os eventos dela.
  {
    id: uuid("fa1a0000", 1),
    fotografoId: lia.id,
    eventoId: null,
    quantidadeMin: 3,
    descontoPct: 10,
  },
  {
    id: uuid("fa1a0000", 2),
    fotografoId: lia.id,
    eventoId: null,
    quantidadeMin: 5,
    descontoPct: 20,
  },
  // Regra própria do Ibirapuera, que substitui a padrão nesse evento.
  {
    id: uuid("fa1a0000", 3),
    fotografoId: lia.id,
    eventoId: ibirapuera.id,
    quantidadeMin: 2,
    descontoPct: 10,
  },
  {
    id: uuid("fa1a0000", 4),
    fotografoId: lia.id,
    eventoId: ibirapuera.id,
    quantidadeMin: 5,
    descontoPct: 25,
  },
];

export const pacotes: Pacote[] = [
  {
    id: uuid("bac07e00", 1),
    eventoId: ibirapuera.id,
    tipoPreco: "fixo",
    precoCentavos: 8990,
    mostrarAPartirDe: 4,
    expiraEm: null,
    ativo: true,
  },
  {
    id: uuid("bac07e00", 2),
    eventoId: meiaRio.id,
    tipoPreco: "por_foto",
    precoCentavos: 990,
    mostrarAPartirDe: 3,
    expiraEm: "2026-12-31T23:59:59-03:00",
    ativo: true,
  },
];

export const cupons: Cupom[] = [
  {
    id: uuid("c0b00000", 1),
    fotografoId: lia.id,
    codigo: "BEMVINDO10",
    tipo: "percentual",
    valor: 10,
    usosMax: null,
    usos: 42,
    inicioEm: "2026-01-01T00:00:00-03:00",
    expiraEm: null,
    minimoTipo: "nenhum",
    minimoValor: 0,
    todosEventos: true,
    eventoIds: [],
    ativo: true,
  },
  {
    id: uuid("c0b00000", 2),
    fotografoId: lia.id,
    codigo: "IBIRA5",
    tipo: "valor",
    valor: 500,
    usosMax: 100,
    usos: 99,
    inicioEm: "2026-09-27T00:00:00-03:00",
    expiraEm: "2026-12-31T23:59:59-03:00",
    minimoTipo: "quantidade",
    minimoValor: 3,
    todosEventos: false,
    eventoIds: [ibirapuera.id],
    ativo: true,
  },
  {
    id: uuid("c0b00000", 3),
    fotografoId: pedro.id,
    codigo: "FORMATURA1GRATIS",
    tipo: "fotos_gratis",
    valor: 1,
    usosMax: null,
    usos: 3,
    inicioEm: "2026-09-01T00:00:00-03:00",
    expiraEm: null,
    minimoTipo: "valor",
    minimoValor: 10000,
    todosEventos: true,
    eventoIds: [],
    ativo: true,
  },
  {
    // Vencido: deve ser recusado.
    id: uuid("c0b00000", 4),
    fotografoId: lia.id,
    codigo: "VERAO2026",
    tipo: "percentual",
    valor: 15,
    usosMax: null,
    usos: 10,
    inicioEm: "2026-01-01T00:00:00-03:00",
    expiraEm: "2026-03-31T23:59:59-03:00",
    minimoTipo: "nenhum",
    minimoValor: 0,
    todosEventos: true,
    eventoIds: [],
    ativo: true,
  },
];

// ---------------------------------------------------------------- Loja

export const lojas: Loja[] = [
  {
    id: uuid("10ca0000", 1),
    fotografoId: lia.id,
    nome: "Lia Ramos Fotografia",
    descricao: "Suas fotos de corrida, do pelotão de elite ao último a cruzar a chegada.",
    logo: null,
    corPrimaria: "#E4572E",
    corSecundaria: "#1B1B1E",
    subdominio: "liaramos",
    dominioProprio: null,
    dominioVerificado: false,
    gaId: "G-EXEMPLO123",
    gtmId: null,
    ativa: true,
  },
];
