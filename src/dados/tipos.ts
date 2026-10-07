// Tipos do domínio. Espelham as tabelas de docs/arquitetura.md ("Modelo de dados"), em
// camelCase. Dinheiro sempre em centavos (inteiro); datas em ISO 8601 com fuso.
//
// Campos sensíveis (senha do evento, CPF/CNPJ, conta de recebimento) ficam em tipos
// separados e nunca entram nos tipos públicos, que podem ir para o navegador.

// ---------------------------------------------------------------- Núcleo

export type Papel = "cliente" | "fotografo" | "admin";

export type RedesSociais = {
  instagram?: string;
  site?: string;
};

/** Perfil público do fotógrafo. */
export type Fotografo = {
  id: string;
  nomePublico: string;
  slug: string;
  bio: string | null;
  fotoPerfil: string | null;
  capa: string | null;
  redesSociais: RedesSociais;
};

export type FrequenciaRepasse = "diaria" | "semanal" | "mensal";

/** Dados privados do fotógrafo: só o próprio fotógrafo e a equipe veem. */
export type FotografoConta = Fotografo & {
  usuarioId: string;
  cpfCnpj: string;
  contaRecebimentoId: string | null;
  comissaoPct: number;
  frequenciaRepasse: FrequenciaRepasse;
  /** Dia da semana (1–7) ou do mês (1–31), conforme a frequência. */
  diaRepasse: number | null;
};

export type Categoria = {
  id: string;
  nome: string;
  slug: string;
};

export type StatusEvento = "rascunho" | "publicado" | "revisao" | "arquivado";
export type Visibilidade = "publico" | "nao_listado" | "senha";
export type Liberacao = "automatica" | "manual" | "agendada";
export type Ordenacao = "envio" | "captura" | "nome_arquivo" | "aleatoria";

export type Evento = {
  id: string;
  /** Dono do evento. */
  fotografoId: string;
  categoriaId: string;
  titulo: string;
  slug: string;
  inicioEm: string;
  fimEm: string;
  local: string;
  cidade: string;
  /** Sigla da UF. */
  estado: string;
  capa: string | null;
  precoFotoCentavos: number;
  precoVideoCentavos: number;
  status: StatusEvento;
  visibilidade: Visibilidade;
  /** Aparece nas listagens e no sitemap. */
  listado: boolean;
  /** A galeria aberta fica vazia; só os resultados da busca aparecem. */
  fotosSoAposBusca: boolean;
  liberacao: Liberacao;
  /** Quando os itens passam a aparecer (liberação manual ou agendada). */
  liberadoEm: string | null;
  filtroHorario: boolean;
  listarNaoIdentificadas: boolean;
  ordenacao: Ordenacao;
};

export type Pasta = {
  id: string;
  eventoId: string;
  nome: string;
  ordem: number;
};

export type TipoItem = "foto" | "video";
export type StatusFoto = "processando" | "pronta" | "erro";

/** Foto ou vídeo de um evento (a tabela `fotos` guarda os dois). */
export type Foto = {
  id: string;
  eventoId: string;
  pastaId: string | null;
  /** Fotógrafo que enviou: o dono do evento ou um colaborador. */
  enviadaPor: string;
  tipo: TipoItem;
  /** URL pública da prévia com marca d'água (foto ~1600 px; vídeo 720p). */
  urlPrevia: string;
  /** URL pública da miniatura (~400 px; no vídeo, um quadro de capa). */
  urlMiniatura: string;
  nomeArquivo: string;
  largura: number;
  altura: number;
  /** Só vídeo. */
  duracaoS: number | null;
  /** Data de captura lida do EXIF, quando houver. */
  capturadaEm: string | null;
  /** Preço individual; `null` usa o preço do evento para o tipo. */
  precoCentavos: number | null;
  ordem: number;
  status: StatusFoto;
  criadoEm: string;
  excluidaEm: string | null;
};

export type Colaborador = {
  id: string;
  eventoId: string;
  fotografoId: string;
  /** Parte do dono do evento sobre o que sobra depois da comissão da plataforma. */
  comissaoDonoPct: number;
  nota: string | null;
};

// ---------------------------------------------------------------- Busca

/** Número de peito encontrado numa foto pelo reconhecimento. */
export type NumeroEncontrado = {
  fotoId: string;
  numero: string;
};

// ---------------------------------------------------------------- Vendas

export type TipoCupom = "percentual" | "valor" | "fotos_gratis";
export type MinimoCupom = "nenhum" | "valor" | "quantidade";

export type Cupom = {
  id: string;
  fotografoId: string;
  codigo: string;
  tipo: TipoCupom;
  /** Percentual (0–100), valor em centavos ou quantidade de fotos, conforme o tipo. */
  valor: number;
  usosMax: number | null;
  usos: number;
  inicioEm: string;
  expiraEm: string | null;
  minimoTipo: MinimoCupom;
  /** Valor em centavos ou quantidade de itens, conforme `minimoTipo`. */
  minimoValor: number;
  todosEventos: boolean;
  /** Eventos em que vale, quando `todosEventos` é falso (tabela `cupons_eventos`). */
  eventoIds: string[];
  ativo: boolean;
};

export type FaixaDesconto = {
  id: string;
  fotografoId: string;
  /** `null` é a regra padrão do fotógrafo para todos os eventos. */
  eventoId: string | null;
  quantidadeMin: number;
  descontoPct: number;
};

export type Pacote = {
  id: string;
  eventoId: string;
  /** Preço fixo, ou preço por foto multiplicado pela quantidade encontrada. */
  tipoPreco: "fixo" | "por_foto";
  precoCentavos: number;
  /** Só oferece o pacote a partir desta quantidade de fotos encontradas. */
  mostrarAPartirDe: number | null;
  expiraEm: string | null;
  ativo: boolean;
};

export type MetodoPagamento = "pix" | "cartao";
export type StatusPedido = "pendente" | "pago" | "expirado" | "cancelado" | "estornado";

export type Pedido = {
  id: string;
  clienteId: string | null;
  emailComprador: string;
  nomeComprador: string;
  whatsapp: string | null;
  aceitaWhatsapp: boolean;
  cupomId: string | null;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  metodo: MetodoPagamento;
  status: StatusPedido;
  expiraEm: string;
  pagoEm: string | null;
  criadoEm: string;
};

/** Dados privados do pedido: acesso do convidado e ligação com o gateway. */
export type PedidoInterno = Pedido & {
  tokenAcessoHash: string | null;
  acessoExpiraEm: string | null;
  gatewayId: string | null;
  lembreteEnviadoEm: string | null;
};

export type ItemPedido = {
  id: string;
  pedidoId: string;
  fotoId: string;
  /** Quem recebe pela foto (o autor). */
  fotografoId: string;
  precoCentavos: number;
  descontoCentavos: number;
  valorFotografoCentavos: number;
  valorDonoEventoCentavos: number;
  valorPlataformaCentavos: number;
  viaPacote: boolean;
};

export type Download = {
  id: string;
  itemPedidoId: string;
  baixadoEm: string;
  ip: string | null;
};

// ---------------------------------------------------------------- Dinheiro do fotógrafo

export type Lancamento = {
  id: string;
  fotografoId: string;
  itemPedidoId: string;
  /** Negativo em estorno. */
  valorCentavos: number;
  disponivelEm: string;
  repasseId: string | null;
};

export type Repasse = {
  id: string;
  fotografoId: string;
  valorCentavos: number;
  status: "previsto" | "pago" | "falhou";
  pagoEm: string | null;
};

// ---------------------------------------------------------------- Loja e moderação

export type Loja = {
  id: string;
  fotografoId: string;
  nome: string;
  descricao: string | null;
  logo: string | null;
  corPrimaria: string;
  corSecundaria: string;
  subdominio: string;
  dominioProprio: string | null;
  dominioVerificado: boolean;
  /** Só o ID (G-…), nunca HTML (docs/riscos.md). */
  gaId: string | null;
  /** Só o ID (GTM-…), nunca HTML. */
  gtmId: string | null;
  ativa: boolean;
};

export type StatusDenuncia = "recebida" | "em_analise" | "procedente" | "improcedente";

export type Denuncia = {
  id: string;
  alvoTipo: "evento" | "foto";
  eventoId: string;
  fotoId: string | null;
  motivo: string;
  descricao: string;
  contatoEmail: string;
  contatoTelefone: string | null;
  razaoSocial: string | null;
  cnpj: string | null;
  status: StatusDenuncia;
  decididaPor: string | null;
  criadoEm: string;
};

// ---------------------------------------------------------------- Formatos usados pelas telas

/** Evento com o que a listagem e a página pública precisam. */
export type EventoResumo = Evento & {
  fotografo: Fotografo;
  categoria: Categoria;
  /** Itens visíveis na galeria agora (prontos, liberados e não excluídos). */
  totalItens: number;
  totalFotos: number;
  totalVideos: number;
  capaMiniatura: Pick<Foto, "urlMiniatura" | "largura" | "altura"> | null;
  situacaoGaleria: SituacaoGaleria;
};

/**
 * Se a galeria aberta mostra os itens e, se não mostra, por quê. A tela usa isto para
 * escolher a mensagem; a camada de dados usa para não entregar fotos que não deveria.
 */
export type SituacaoGaleria =
  | { tipo: "aberta" }
  | { tipo: "aguardando_liberacao"; liberaEm: string | null }
  | { tipo: "so_apos_busca" }
  | { tipo: "senha" };

export type PaginaDeFotos = {
  fotos: Foto[];
  /** Passar para a próxima chamada; `null` quando não há mais fotos. */
  proximoCursor: string | null;
};
