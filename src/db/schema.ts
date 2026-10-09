// Schema do banco (docs/arquitetura.md, "Modelo de dados"). Dinheiro em centavos (inteiro), IDs
// em UUID, datas com fuso. Os nomes das colunas viram snake_case no banco (casing do Drizzle).
//
// Toda tabela tem RLS ligado (`.enableRLS()`) e nenhuma política: no Supabase, o schema public
// fica exposto na API REST com a chave pública, e sem RLS qualquer pessoa leria pedidos, hashes
// de senha e CPFs por lá. O app conecta como dono das tabelas, que não passa pelo RLS. Tabela
// nova também leva `.enableRLS()` (o teste src/db/seguranca.test.ts confere).

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const data = () => timestamp({ withTimezone: true, mode: "date" });
/** Momento de criação: preenchido pelo banco. */
const momento = () => data().notNull().defaultNow();

// ---------------------------------------------------------------- Enums

export const papel = pgEnum("papel", ["cliente", "fotografo", "admin"]);
export const statusEvento = pgEnum("status_evento", [
  "rascunho",
  "publicado",
  "revisao",
  "arquivado",
]);
export const visibilidade = pgEnum("visibilidade", ["publico", "nao_listado", "senha"]);
export const liberacao = pgEnum("liberacao", ["automatica", "manual", "agendada"]);
export const ordenacao = pgEnum("ordenacao", ["envio", "captura", "nome_arquivo", "aleatoria"]);
export const tipoItem = pgEnum("tipo_item", ["foto", "video"]);
export const statusFoto = pgEnum("status_foto", ["processando", "pronta", "erro"]);
export const tipoCupom = pgEnum("tipo_cupom", ["percentual", "valor", "fotos_gratis"]);
export const minimoCupom = pgEnum("minimo_cupom", ["nenhum", "valor", "quantidade"]);
export const tipoPrecoPacote = pgEnum("tipo_preco_pacote", ["fixo", "por_foto"]);
export const metodoPagamento = pgEnum("metodo_pagamento", ["pix", "cartao"]);
export const statusPedido = pgEnum("status_pedido", [
  "pendente",
  "pago",
  "expirado",
  "cancelado",
  "estornado",
  /** Chargeback em disputa: downloads bloqueados e lançamentos estornados até o fim da disputa. */
  "contestado",
]);
/** Por que o pedido foi estornado: reembolso (pelo gestor ou no Mercado Pago) ou chargeback perdido. */
export const motivoEstorno = pgEnum("motivo_estorno", ["reembolso", "chargeback"]);
export const statusSaque = pgEnum("status_saque", ["processando", "pago", "falhou"]);
export const alvoDenuncia = pgEnum("alvo_denuncia", ["evento", "foto"]);
export const statusDenuncia = pgEnum("status_denuncia", [
  "recebida",
  "em_analise",
  "procedente",
  "improcedente",
]);
export const canalMensagem = pgEnum("canal_mensagem", ["email", "whatsapp"]);
export const tipoMensagem = pgEnum("tipo_mensagem", [
  "entrega",
  "lembrete",
  "denuncia",
  /** Pix gerado e ainda não pago, antes de vencer. */
  "lembrete_pix",
  /** Aviso ao fotógrafo de que vendeu. */
  "venda",
  /** Aviso de segurança da conta (ex.: CPF/CNPJ de recebimento trocado). */
  "seguranca",
]);
export const tipoMetrica = pgEnum("tipo_metrica", ["visita_evento", "visita_foto", "carrinho"]);

// ---------------------------------------------------------------- Núcleo

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    email: text().notNull(),
    telefone: text(),
    papel: papel().notNull(),
    /** Quem só entra com o Google não tem senha. */
    senhaHash: text(),
    googleId: text(),
    emailConfirmadoEm: data(),
    criadoEm: momento(),
    /**
     * Conta excluída pelo próprio usuário (LGPD). A linha fica, com os dados pessoais trocados por
     * marcadores, porque pedidos, lançamentos e saques apontam para ela (src/dados/exclusao.ts).
     */
    excluidoEm: data(),
    /**
     * Entra na versão da sessão (src/dados/index.ts, versaoDaSessao): somar 1 derruba todos os
     * cookies de sessão do usuário ("sair de todos os dispositivos", troca de CPF/CNPJ).
     */
    versaoSessao: integer().notNull().default(0),
    /**
     * Verificação em duas etapas (TOTP, src/servicos/mfa.ts): segredo cifrado com AES-256-GCM
     * (chave derivada do APP_SECRET, src/lib/mfa.ts). Com `mfaAtivadoEm` nulo, é um cadastro
     * ainda não confirmado com o primeiro código.
     */
    mfaSegredo: text(),
    mfaAtivadoEm: data(),
    /** Último passo de 30 s aceito: o mesmo código não vale duas vezes. */
    mfaUltimoPasso: integer(),
  },
  (t) => [uniqueIndex().on(t.email), uniqueIndex().on(t.googleId)],
).enableRLS();

/**
 * Códigos de recuperação da verificação em duas etapas: só o HMAC (chave derivada do
 * APP_SECRET), cada um usado uma vez. Gerar códigos novos apaga os antigos.
 */
export const codigosRecuperacao = pgTable(
  "codigos_recuperacao",
  {
    id: uuid().primaryKey().defaultRandom(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    codigoHash: text().notNull(),
    usadoEm: data(),
  },
  (t) => [uniqueIndex().on(t.codigoHash), index().on(t.usuarioId)],
).enableRLS();

/**
 * Sessões encerradas por "Sair" antes de vencer: o id (`jti`) do cookie assinado. A leitura da
 * sessão recusa o cookie cujo id está aqui. A linha só precisa durar até o cookie vencer; o job
 * de pedidos apaga as vencidas.
 */
export const sessoesRevogadas = pgTable(
  "sessoes_revogadas",
  {
    jti: text().primaryKey(),
    expiraEm: data().notNull(),
  },
  (t) => [index().on(t.expiraEm)],
).enableRLS();

/**
 * Código de confirmação do e-mail (6 dígitos, src/servicos/confirmacao-email.ts), um por e-mail.
 * Serve a dois casos: o cadastro com senha ainda não confirmado (nome, hash da senha e papel ficam
 * aqui, e a conta só nasce em `usuarios` com o código certo) e a conta antiga, criada antes da
 * confirmação obrigatória (`usuario_id`). Do código, só o HMAC; vale 15 minutos e aceita 5
 * tentativas. O cadastro abandonado vence em 24 horas e não prende o e-mail: refazer o cadastro
 * troca os dados e o código.
 */
export const codigosEmail = pgTable(
  "codigos_email",
  {
    email: text().primaryKey(),
    usuarioId: uuid().references(() => usuarios.id, { onDelete: "cascade" }),
    nome: text(),
    senhaHash: text(),
    papel: papel(),
    codigoHash: text().notNull(),
    codigoExpiraEm: data().notNull(),
    tentativas: integer().notNull().default(0),
    /** Último envio: o reenvio espera 60 segundos. */
    enviadoEm: data().notNull(),
    criadoEm: momento(),
  },
  (t) => [index().on(t.criadoEm)],
).enableRLS();

/**
 * Link de "Esqueci a senha" (src/servicos/redefinicao-senha.ts): só o SHA-256 do token, vale 30
 * minutos e uma vez só. Redefinir a senha apaga os outros links da conta.
 */
export const redefinicoesSenha = pgTable(
  "redefinicoes_senha",
  {
    tokenHash: text().primaryKey(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEm: data().notNull(),
  },
  (t) => [index().on(t.usuarioId), index().on(t.expiraEm)],
).enableRLS();

export const fotografos = pgTable(
  "fotografos",
  {
    id: uuid().primaryKey().defaultRandom(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    nomePublico: text().notNull(),
    slug: text().notNull(),
    bio: text(),
    fotoPerfil: text(),
    capa: text(),
    redesSociais: jsonb().$type<{ instagram?: string; site?: string }>().notNull().default({}),
    cpfCnpj: text().notNull().default(""),
    /** O próprio CPF/CNPJ, só dígitos, depois de confirmado. */
    chavePix: text(),
    /**
     * Última troca do CPF/CNPJ (que define a chave Pix). Saques ficam bloqueados por 72 horas
     * depois dela (src/servicos/saques.ts), contra quem invade a conta e troca o documento.
     */
    documentoTrocadoEm: data(),
    comissaoPct: integer().notNull().default(10),
  },
  (t) => [uniqueIndex().on(t.usuarioId), uniqueIndex().on(t.slug)],
).enableRLS();

export const categorias = pgTable(
  "categorias",
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [uniqueIndex().on(t.slug)],
).enableRLS();

export const eventos = pgTable(
  "eventos",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    categoriaId: uuid()
      .notNull()
      .references(() => categorias.id),
    titulo: text().notNull(),
    slug: text().notNull(),
    inicioEm: data().notNull(),
    fimEm: data().notNull(),
    local: text().notNull(),
    cidade: text().notNull(),
    estado: text().notNull(),
    capa: text(),
    precoFotoCentavos: integer().notNull(),
    precoVideoCentavos: integer().notNull(),
    status: statusEvento().notNull().default("rascunho"),
    visibilidade: visibilidade().notNull().default("publico"),
    senhaHash: text(),
    listado: boolean().notNull().default(true),
    fotosSoAposBusca: boolean().notNull().default(false),
    liberacao: liberacao().notNull().default("automatica"),
    liberadoEm: data(),
    filtroHorario: boolean().notNull().default(false),
    listarNaoIdentificadas: boolean().notNull().default(false),
    ordenacao: ordenacao().notNull().default("captura"),
    /** Desligado, as faixas de desconto progressivo não valem neste evento. */
    descontoProgressivo: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex().on(t.slug), index().on(t.fotografoId), index().on(t.status, t.inicioEm)],
).enableRLS();

/** Navegador que acertou a senha do evento: hash do token do cookie e a senha da época. */
export const acessosEvento = pgTable("acessos_evento", {
  tokenHash: text().primaryKey(),
  eventoId: uuid()
    .notNull()
    .references(() => eventos.id, { onDelete: "cascade" }),
  senhaHash: text().notNull(),
  expiraEm: data().notNull(),
}).enableRLS();

export const pastas = pgTable(
  "pastas",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    nome: text().notNull(),
    ordem: integer().notNull(),
  },
  (t) => [index().on(t.eventoId)],
).enableRLS();

export const fotos = pgTable(
  "fotos",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id),
    pastaId: uuid().references(() => pastas.id, { onDelete: "set null" }),
    enviadaPor: uuid()
      .notNull()
      .references(() => fotografos.id),
    tipo: tipoItem().notNull().default("foto"),
    /** Chaves no R2 (Fase 12). Nos dados de exemplo, as URLs públicas de exemplo. */
    chaveOriginal: text(),
    urlPrevia: text().notNull(),
    urlMiniatura: text().notNull(),
    nomeArquivo: text().notNull(),
    largura: integer().notNull(),
    altura: integer().notNull(),
    duracaoS: integer(),
    tamanhoBytes: bigint({ mode: "number" }),
    hashConteudo: text(),
    capturadaEm: data(),
    precoCentavos: integer(),
    ordem: integer().notNull(),
    status: statusFoto().notNull().default("processando"),
    criadoEm: momento(),
    excluidaEm: data(),
    /**
     * Quando a foto foi cadastrada no reconhecimento facial, mesmo que sem nenhum rosto
     * (paisagem, de costas). Sem esta marca, a foto sem rosto voltava ao Rekognition a cada
     * "Cadastrar rostos que faltam". Nulo: ainda não foi (ou o cadastro falhou).
     */
    rostosIndexadosEm: data(),
    /**
     * Início do envio atual (a URL assinada vale 15 minutos). O job que revisa fotos presas em
     * `processando` só mexe nas que passaram bem desse prazo (src/servicos/envios.ts). Nulo nas
     * fotos anteriores à migração 0007: vale o `criado_em`.
     */
    envioIniciadoEm: data(),
    /** Por que a foto ficou em `erro`, para o fotógrafo ver no painel. */
    erroMensagem: text(),
  },
  (t) => [
    index().on(t.eventoId, t.ordem),
    index().on(t.eventoId, t.capturadaEm),
    index().on(t.eventoId, t.hashConteudo),
  ],
).enableRLS();

export const colaboradores = pgTable(
  "colaboradores",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    comissaoDonoPct: integer().notNull(),
    nota: text(),
    /**
     * Quando o convidado aceitou o convite (e as condições). Sem aceite, ele não envia fotos.
     * Colaboradores de antes do convite com aceite entraram como já aceitos (migração 0012).
     */
    aceitoEm: data(),
  },
  (t) => [uniqueIndex().on(t.eventoId, t.fotografoId), index().on(t.fotografoId)],
).enableRLS();

// ---------------------------------------------------------------- Busca

export const rostos = pgTable(
  "rostos",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotoId: uuid()
      .notNull()
      .references(() => fotos.id, { onDelete: "cascade" }),
    rostoIdProvedor: text().notNull(),
    /**
     * Onde está o rosto na foto, em frações de 0 a 1 (o Rekognition devolve assim). Serve para a
     * prévia ampliada no rosto, nos resultados da busca por selfie.
     */
    caixa: jsonb().$type<{ esquerda: number; topo: number; largura: number; altura: number }>(),
  },
  (t) => [index().on(t.rostoIdProvedor), index().on(t.fotoId)],
).enableRLS();

export const numeros = pgTable(
  "numeros",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotoId: uuid()
      .notNull()
      .references(() => fotos.id, { onDelete: "cascade" }),
    numero: text().notNull(),
  },
  (t) => [index().on(t.numero, t.fotoId), index().on(t.fotoId)],
).enableRLS();

// ---------------------------------------------------------------- Vendas

export const cupons = pgTable(
  "cupons",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    codigo: text().notNull(),
    tipo: tipoCupom().notNull(),
    valor: integer().notNull(),
    usosMax: integer(),
    usos: integer().notNull().default(0),
    inicioEm: data().notNull(),
    expiraEm: data(),
    minimoTipo: minimoCupom().notNull().default("nenhum"),
    minimoValor: integer().notNull().default(0),
    todosEventos: boolean().notNull().default(true),
    ativo: boolean().notNull().default(true),
  },
  // O comprador digita só o código: ele é único na plataforma (em maiúsculas).
  (t) => [
    uniqueIndex("cupons_codigo_unico").on(sql`upper(${t.codigo})`),
    index().on(t.fotografoId),
  ],
).enableRLS();

export const cuponsEventos = pgTable(
  "cupons_eventos",
  {
    cupomId: uuid()
      .notNull()
      .references(() => cupons.id, { onDelete: "cascade" }),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cupomId, t.eventoId] })],
).enableRLS();

export const faixasDesconto = pgTable(
  "faixas_desconto",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    /** Vazio: regra padrão do fotógrafo para todos os eventos. */
    eventoId: uuid().references(() => eventos.id, { onDelete: "cascade" }),
    quantidadeMin: integer().notNull(),
    descontoPct: integer().notNull(),
  },
  (t) => [index().on(t.fotografoId, t.eventoId)],
).enableRLS();

export const pacotes = pgTable(
  "pacotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    tipoPreco: tipoPrecoPacote().notNull(),
    precoCentavos: integer().notNull(),
    mostrarAPartirDe: integer(),
    expiraEm: data(),
    ativo: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex().on(t.eventoId)],
).enableRLS();

export const pedidos = pgTable(
  "pedidos",
  {
    id: uuid().primaryKey().defaultRandom(),
    clienteId: uuid().references(() => usuarios.id),
    emailComprador: text().notNull(),
    nomeComprador: text().notNull(),
    /** CPF/CNPJ do comprador, só dígitos: o Asaas exige para cobrar. Nulo com o Mercado Pago. */
    cpfComprador: text(),
    whatsapp: text(),
    aceitaWhatsapp: boolean().notNull().default(false),
    tokenAcessoHash: text(),
    acessoExpiraEm: data(),
    cupomId: uuid().references(() => cupons.id),
    subtotalCentavos: integer().notNull(),
    descontoCentavos: integer().notNull(),
    totalCentavos: integer().notNull(),
    metodo: metodoPagamento().notNull(),
    status: statusPedido().notNull().default("pendente"),
    expiraEm: data().notNull(),
    /**
     * Cobrança no gateway (order do Mercado Pago ou cobrança do Asaas). Única: o webhook busca
     * por ela e não confirma duas vezes.
     */
    gatewayId: text(),
    pixCopiaECola: text(),
    pixQrCodeBase64: text(),
    pagoEm: data(),
    lembreteEnviadoEm: data(),
    /** Lembrete "seu Pix vence em X minutos", uma vez por pedido. */
    lembretePixEm: data(),
    /**
     * O gestor pediu o reembolso no /admin. Daqui em diante os downloads param, mesmo que o
     * Mercado Pago ainda não tenha concluído a devolução.
     */
    reembolsoSolicitadoEm: data(),
    reembolsoSolicitadoPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
    /** Abertura de chargeback lida na order (fica gravada mesmo se a disputa for ganha). */
    contestadoEm: data(),
    estornadoEm: data(),
    motivoEstorno: motivoEstorno(),
    criadoEm: momento(),
  },
  (t) => [index().on(t.clienteId), index().on(t.status, t.expiraEm), uniqueIndex().on(t.gatewayId)],
).enableRLS();

export const itensPedido = pgTable(
  "itens_pedido",
  {
    id: uuid().primaryKey().defaultRandom(),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    fotoId: uuid()
      .notNull()
      .references(() => fotos.id),
    /** Quem recebe pela foto (o autor). */
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    precoCentavos: integer().notNull(),
    descontoCentavos: integer().notNull(),
    valorFotografoCentavos: integer().notNull(),
    valorDonoEventoCentavos: integer().notNull(),
    viaPacote: boolean().notNull().default(false),
  },
  (t) => [index().on(t.pedidoId), index().on(t.fotoId)],
).enableRLS();

export const downloads = pgTable(
  "downloads",
  {
    id: uuid().primaryKey().defaultRandom(),
    itemPedidoId: uuid()
      .notNull()
      .references(() => itensPedido.id, { onDelete: "cascade" }),
    baixadoEm: momento(),
    ip: text(),
  },
  (t) => [index().on(t.itemPedidoId)],
).enableRLS();

// ---------------------------------------------------------------- Dinheiro do fotógrafo

export const saques = pgTable(
  "saques",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    antecipado: boolean().notNull(),
    brutoCentavos: integer().notNull(),
    taxaCentavos: integer().notNull(),
    liquidoCentavos: integer().notNull(),
    chavePix: text().notNull(),
    gatewayId: text(),
    status: statusSaque().notNull().default("processando"),
    criadoEm: momento(),
    pagoEm: data(),
  },
  (t) => [index().on(t.fotografoId, t.status)],
).enableRLS();

export const lancamentos = pgTable(
  "lancamentos",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    itemPedidoId: uuid()
      .notNull()
      .references(() => itensPedido.id),
    /** Bruto; negativo em estorno. */
    valorCentavos: integer().notNull(),
    disponivelEm: data().notNull(),
    antecipavelEm: data().notNull(),
    saqueId: uuid().references(() => saques.id),
    /**
     * Lançamento que este desfaz (estorno, com o valor negativo, ou a volta de um estorno depois
     * de uma contestação ganha). Único: cada lançamento é desfeito no máximo uma vez.
     */
    estornoDe: uuid().references((): AnyPgColumn => lancamentos.id),
  },
  (t) => [
    index().on(t.fotografoId, t.saqueId),
    index().on(t.itemPedidoId),
    uniqueIndex().on(t.estornoDe),
  ],
).enableRLS();

// ---------------------------------------------------------------- Loja e moderação

export const lojas = pgTable(
  "lojas",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    nome: text().notNull(),
    descricao: text(),
    logo: text(),
    corPrimaria: text().notNull(),
    corSecundaria: text().notNull(),
    subdominio: text().notNull(),
    dominioProprio: text(),
    dominioVerificado: boolean().notNull().default(false),
    gaId: text(),
    gtmId: text(),
    ativa: boolean().notNull().default(true),
  },
  (t) => [
    uniqueIndex().on(t.fotografoId),
    uniqueIndex().on(t.subdominio),
    uniqueIndex().on(t.dominioProprio),
  ],
).enableRLS();

export const denuncias = pgTable(
  "denuncias",
  {
    id: uuid().primaryKey().defaultRandom(),
    alvoTipo: alvoDenuncia().notNull(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id),
    fotoId: uuid().references(() => fotos.id),
    motivo: text().notNull(),
    descricao: text().notNull(),
    contatoEmail: text().notNull(),
    contatoTelefone: text(),
    razaoSocial: text(),
    cnpj: text(),
    status: statusDenuncia().notNull().default("recebida"),
    decididaPor: uuid().references(() => usuarios.id),
    criadoEm: momento(),
  },
  (t) => [index().on(t.status, t.criadoEm), index().on(t.eventoId)],
).enableRLS();

export const anexosDenuncia = pgTable("anexos_denuncia", {
  id: uuid().primaryKey().defaultRandom(),
  denunciaId: uuid()
    .notNull()
    .references(() => denuncias.id, { onDelete: "cascade" }),
  chave: text().notNull(),
}).enableRLS();

/** Caixa de saída de e-mail e WhatsApp (simulada até a Fase 13). */
export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid().primaryKey().defaultRandom(),
    pedidoId: uuid().references(() => pedidos.id, { onDelete: "set null" }),
    canal: canalMensagem().notNull(),
    tipo: tipoMensagem().notNull(),
    para: text().notNull(),
    assunto: text().notNull(),
    texto: text().notNull(),
    criadoEm: momento(),
  },
  (t) => [index().on(t.criadoEm)],
).enableRLS();

// ---------------------------------------------------------------- Crescimento do fotógrafo

/** Visita ou adição ao carrinho, sem nenhum dado de quem visitou (só o que e quando). */
export const metricas = pgTable(
  "metricas",
  {
    id: uuid().primaryKey().defaultRandom(),
    tipo: tipoMetrica().notNull(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    fotoId: uuid().references(() => fotos.id, { onDelete: "cascade" }),
    em: momento(),
  },
  (t) => [index().on(t.eventoId, t.tipo, t.em), index().on(t.fotoId)],
).enableRLS();

/** Configuração de evento reaproveitável (local, preços, visibilidade…), por fotógrafo. */
export const modelosEvento = pgTable(
  "modelos_evento",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id, { onDelete: "cascade" }),
    nome: text().notNull(),
    config: jsonb().$type<import("@/dados/tipos").ConfigModelo>().notNull(),
    criadoEm: momento(),
  },
  (t) => [index().on(t.fotografoId)],
).enableRLS();

// ---------------------------------------------------------------- Proteção contra abuso

/**
 * Tentativas de login, cadastro e outras ações sensíveis, para limitar abuso entre todos os
 * servidores (na Vercel, cada requisição pode cair num servidor diferente, então um contador na
 * memória não funcionaria). A chave já vem como hash (ex.: ação + IP), sem guardar o IP.
 */
export const tentativas = pgTable(
  "tentativas",
  {
    id: uuid().primaryKey().defaultRandom(),
    chave: text().notNull(),
    em: momento(),
  },
  (t) => [index().on(t.chave, t.em)],
).enableRLS();
