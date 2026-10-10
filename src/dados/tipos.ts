// Tipos do domínio. Espelham as tabelas de docs/arquitetura.md ("Modelo de dados"), em
// camelCase. Dinheiro sempre em centavos (inteiro); datas em ISO 8601 com fuso.
//
// Campos sensíveis (senha do evento, CPF/CNPJ, chave Pix) ficam em tipos
// separados e nunca entram nos tipos públicos, que podem ir para o navegador.

// ---------------------------------------------------------------- Núcleo

/** Papéis: cliente compra; fotógrafo (vendedor) publica e vende; admin (gestor) vê tudo e muda papéis. */
export type Papel = "cliente" | "fotografo" | "admin";

/** Usuário como as telas e a sessão enxergam: sem hash de senha. */
export type Usuario = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: Papel;
  emailConfirmado: boolean;
  /** Entra com a conta Google (além ou no lugar da senha). */
  temGoogle: boolean;
  /** Verificação em duas etapas ligada (src/servicos/mfa.ts). */
  mfaAtivo: boolean;
  criadoEm: string;
};

/** Dados privados do usuário, que não saem da camada de dados. */
export type UsuarioInterno = Omit<Usuario, "emailConfirmado" | "temGoogle" | "mfaAtivo"> & {
  /** `null` para quem só entra com o Google. */
  senhaHash: string | null;
  /** Identificador da conta Google (`sub`), nunca muda mesmo se o e-mail mudar. */
  googleId: string | null;
  emailConfirmadoEm: string | null;
  /** Conta excluída pelo próprio usuário (dados anonimizados). */
  excluidoEm?: string | null;
  /** Contador que derruba todas as sessões quando muda (src/dados/index.ts, versaoDaSessao). */
  versaoSessao?: number;
  /** Segredo TOTP cifrado; nunca sai da camada de dados (src/dados/mfa.ts). */
  mfaSegredo?: string | null;
  mfaAtivadoEm?: string | null;
  mfaUltimoPasso?: number | null;
};

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

/** Dados privados do fotógrafo: só o próprio fotógrafo e a equipe veem. */
export type FotografoConta = Fotografo & {
  usuarioId: string;
  cpfCnpj: string;
  /**
   * Chave Pix confirmada para saque: o próprio CPF/CNPJ, só dígitos. Volta a `null` se o
   * CPF/CNPJ mudar, para o saque nunca ir para uma chave antiga.
   */
  chavePix: string | null;
  /** Última troca do CPF/CNPJ (ISO): saques bloqueados por 72 horas depois dela. */
  documentoTrocadoEm?: string | null;
  /** Comissão da plataforma, descontada no saque. */
  comissaoPct: number;
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
  /** Liberação padrão dos próximos envios ao evento (cada foto guarda a sua em `liberarEm`). */
  liberacao: Liberacao;
  /** Horário padrão da liberação agendada (só vale com `liberacao` agendada). */
  liberadoEm: string | null;
  filtroHorario: boolean;
  listarNaoIdentificadas: boolean;
  ordenacao: Ordenacao;
  /** `false`: as faixas de desconto progressivo não valem neste evento (sem o campo, valem). */
  descontoProgressivo?: boolean;
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
  /** Modo do lote em que a foto entrou (src/lib/liberacao.ts). */
  liberacao: Liberacao;
  /** A partir de quando aparece para o público; `null`: aguardando o "Liberar agora" do dono. */
  liberarEm: string | null;
};

// ---------------------------------------------------------------- Crescimento

/** Visita ou adição ao carrinho, sem nenhum dado de quem visitou (só o que e quando). */
export type TipoMetrica = "visita_evento" | "visita_foto" | "carrinho";

export type Metrica = {
  tipo: TipoMetrica;
  eventoId: string;
  fotoId: string | null;
  em: string;
};

/** Configuração reaproveitável de evento: o que se repete de um evento para o outro. */
export type ConfigModelo = Pick<
  Evento,
  | "categoriaId"
  | "local"
  | "cidade"
  | "estado"
  | "precoFotoCentavos"
  | "precoVideoCentavos"
  | "visibilidade"
  | "fotosSoAposBusca"
  | "liberacao"
  | "filtroHorario"
  | "listarNaoIdentificadas"
  | "ordenacao"
>;

export type ModeloEvento = {
  id: string;
  fotografoId: string;
  nome: string;
  config: ConfigModelo;
  criadoEm: string;
};

export type Colaborador = {
  id: string;
  eventoId: string;
  fotografoId: string;
  /** Parte do dono do evento sobre o que sobra depois da comissão da plataforma. */
  comissaoDonoPct: number;
  nota: string | null;
  /** Quando aceitou o convite; `null` enquanto o convite está pendente. */
  aceitoEm: string | null;
};

// ---------------------------------------------------------------- Busca

/**
 * Rosto encontrado numa foto pelo reconhecimento facial (tabela `rostos`). `rostoId` é o id
 * do rosto no provedor; a mesma pessoa aparece com o mesmo id só nos dados de exemplo.
 */
export type RostoEncontrado = {
  fotoId: string;
  rostoId: string;
};

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
export type StatusPedido =
  | "pendente"
  | "pago"
  | "expirado"
  | "cancelado"
  | "estornado"
  /** Chargeback em disputa (docs/arquitetura.md, "Estorno e chargeback"). */
  | "contestado";

export type MotivoEstorno = "reembolso" | "chargeback";

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

/** Cobrança Pix gerada no Mercado Pago, mostrada na página do pedido enquanto ele está pendente. */
export type CobrancaPix = {
  copiaECola: string;
  /** Imagem PNG do QR Code em base64, como o Mercado Pago devolve. */
  qrCodeBase64: string;
};

/** Dados privados do pedido: acesso do convidado e ligação com o gateway. */
export type PedidoInterno = Pedido & {
  /** CPF/CNPJ do comprador, só dígitos (exigido pelo Asaas); nulo com o Mercado Pago. */
  cpfComprador?: string | null;
  tokenAcessoHash: string | null;
  acessoExpiraEm: string | null;
  /** Id da cobrança no gateway: order do Mercado Pago (`ORD…`) ou cobrança do Asaas (`pay_…`). */
  gatewayId: string | null;
  pix: CobrancaPix | null;
  lembreteEnviadoEm: string | null;
  /** O gestor pediu o reembolso: os downloads param na hora (docs/arquitetura.md). */
  reembolsoSolicitadoEm?: string | null;
  contestadoEm?: string | null;
  estornadoEm?: string | null;
  motivoEstorno?: MotivoEstorno | null;
};

/**
 * Item vendido. O preço é dividido só entre o autor e o dono do evento; a comissão da
 * plataforma não sai aqui, e sim no saque (docs/arquitetura.md, "Saque do fotógrafo").
 */
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
  viaPacote: boolean;
};

export type Download = {
  id: string;
  itemPedidoId: string;
  baixadoEm: string;
  ip: string | null;
};

/**
 * Mensagem enviada ao comprador. Na Parte A o envio é simulado: a mensagem fica guardada para
 * a equipe conferir no painel de gestão. Na Fase 13, o Resend e a API do WhatsApp enviam.
 */
export type Mensagem = {
  id: string;
  /** Pedido da mensagem; `null` nas mensagens de denúncia. */
  pedidoId: string | null;
  canal: "email" | "whatsapp";
  tipo: "entrega" | "lembrete" | "denuncia" | "lembrete_pix" | "venda" | "seguranca" | "liberacao";
  /** E-mail ou número de WhatsApp. */
  para: string;
  assunto: string;
  texto: string;
  criadoEm: string;
};

// ---------------------------------------------------------------- Dinheiro do fotógrafo

/** A parte de um fotógrafo num item vendido, ainda sem a comissão (que sai no saque). */
export type Lancamento = {
  id: string;
  fotografoId: string;
  itemPedidoId: string;
  /** Valor bruto; negativo em estorno. */
  valorCentavos: number;
  /** A partir daqui entra no saque normal (30 dias depois da venda). */
  disponivelEm: string;
  /** A partir daqui pode entrar no saque antecipado (1 dia depois da venda). */
  antecipavelEm: string;
  saqueId: string | null;
  /** Lançamento que este desfaz (estorno ou volta de estorno); vazio na venda. */
  estornoDe?: string | null;
};

export type StatusSaque = "processando" | "pago" | "falhou";

/** Saque pedido pelo fotógrafo, enviado por Pix da conta da plataforma. */
export type Saque = {
  id: string;
  fotografoId: string;
  antecipado: boolean;
  brutoCentavos: number;
  /** Comissão (10%) mais a antecipação (1%) sobre o que ainda não tinha 30 dias. */
  taxaCentavos: number;
  liquidoCentavos: number;
  /** CPF ou CNPJ do fotógrafo, só dígitos: o saque só vai para a chave Pix dele mesmo. */
  chavePix: string;
  /** Id do payout no Mercado Pago. */
  gatewayId: string | null;
  status: StatusSaque;
  criadoEm: string;
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
  /** `proximaLiberacao`: há mais fotos agendadas para esse horário (ISO), ou `null`. */
  | { tipo: "aberta"; proximaLiberacao?: string | null }
  /** Nenhuma foto liberada ainda; `liberaEm` é o próximo horário agendado (`null`: manual). */
  | { tipo: "aguardando_liberacao"; liberaEm: string | null }
  | { tipo: "so_apos_busca" }
  | { tipo: "senha" };

export type PaginaDeFotos = {
  fotos: Foto[];
  /** Passar para a próxima chamada; `null` quando não há mais fotos. */
  proximoCursor: string | null;
};
