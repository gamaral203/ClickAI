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
  date,
  doublePrecision,
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
/** Frequência da transferência automática do saldo do fotógrafo (src/servicos/financeiro.ts). */
export const frequenciaTransferencia = pgEnum("frequencia_transferencia", [
  "diaria",
  "semanal",
  "mensal",
]);
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
  /** Aviso ao dono e aos colaboradores de que um lote agendado foi liberado. */
  "liberacao",
  /** Aviso à equipe do evento de que alguém passou outro no ranking (Top Cliques). */
  "ranking",
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
 * confirmação obrigatória (`usuario_id`). O código é conferido pelo HMAC; vale 2 horas, aceita 5
 * tentativas, e "Reenviar" manda o MESMO código enquanto ele vale (um código por vez). O
 * cadastro abandonado vence em 24 horas e não prende o e-mail.
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
    /**
     * O mesmo código, cifrado (AES-256-GCM, src/lib/codigo-cifrado.ts), só para o reenvio mandar
     * o MESMO código. Apagado quando o código vence ou esgota as tentativas; nulo nas linhas
     * antigas (o próximo envio gera um código novo).
     */
    codigoCifrado: text(),
    /** Quando este código foi gerado: teto da validade, mesmo com reenvios. */
    codigoGeradoEm: data(),
    codigoExpiraEm: data().notNull(),
    tentativas: integer().notNull().default(0),
    /** Último envio: outro envio em menos de 30 segundos não sai (clique duplo). */
    enviadoEm: data().notNull(),
    criadoEm: momento(),
  },
  (t) => [index().on(t.criadoEm)],
).enableRLS();

/**
 * Código de acesso do gestor (6 dígitos, src/servicos/codigo-login.ts): segunda etapa obrigatória
 * do login de quem tem o papel `admin`, enviada ao e-mail da conta. Um por usuário (a chave
 * primária é o índice por usuário). Um login novo ou um reenvio manda o MESMO código enquanto ele
 * vale (só o login mais novo o aceita); conferido pelo HMAC, vale 10 minutos a cada envio, no
 * máximo 2 horas, aceita 5 tentativas e é apagado ao ser usado. `login_id` é o login pendente
 * (o mesmo id vai no cookie assinado), e `reenvios` conta os reenvios desse login.
 */
export const codigosDeLogin = pgTable("codigos_de_login", {
  usuarioId: uuid()
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  loginId: uuid().notNull(),
  codigoHash: text().notNull(),
  /** O mesmo código, cifrado (src/lib/codigo-cifrado.ts), para o reenvio mandar o mesmo. */
  codigoCifrado: text(),
  /** Quando este código foi gerado: teto da validade, mesmo com reenvios. */
  codigoGeradoEm: data(),
  expiraEm: data().notNull(),
  tentativas: integer().notNull().default(0),
  reenvios: integer().notNull().default(0),
  /** Último envio: outro envio em menos de 30 segundos não sai (clique duplo). */
  enviadoEm: data().notNull(),
  criadoEm: momento(),
}).enableRLS();

/**
 * Código de confirmação por e-mail das ações sensíveis (src/servicos/codigo-acao.ts): saque,
 * transferência automática, troca do CPF/CNPJ, troca de senha, download dos originais e ligar ou
 * desligar a verificação em duas etapas. Um código por usuário e finalidade; só o HMAC fica
 * guardado. Vale 10 minutos, uma vez só, com 5 tentativas.
 */
export const codigosDeAcao = pgTable(
  "codigos_de_acao",
  {
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    finalidade: text().notNull(),
    codigoHash: text().notNull(),
    expiraEm: data().notNull(),
    tentativas: integer().notNull().default(0),
    enviadoEm: data().notNull(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.finalidade] })],
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
    /**
     * Avatar escolhido (id do catálogo em src/lib/avatares.ts, ex. "avatar-03"). Nulo: o padrão,
     * tirado do id da conta. A foto de perfil enviada tem prioridade sobre ele.
     */
    avatar: text(),
    capa: text(),
    redesSociais: jsonb().$type<{ instagram?: string; site?: string }>().notNull().default({}),
    cpfCnpj: text().notNull().default(""),
    /** O próprio CPF/CNPJ, só dígitos, depois de confirmado. */
    chavePix: text(),
    /**
     * Última troca do CPF/CNPJ (que define a chave Pix). Saques ficam bloqueados por 24 horas
     * depois dela (src/servicos/saques.ts), contra quem invade a conta e troca o documento.
     */
    documentoTrocadoEm: data(),
    /** Comissão da plataforma por venda, descontada uma vez só, no saque (src/servicos/financeiro.ts). */
    comissaoPct: integer().notNull().default(8),
    /** Modelo de marca d'água das prévias (src/lib/marca-dagua.ts); vale para as próximas fotos. */
    modeloMarca: text().notNull().default("padrao"),
    /**
     * Ajustes da marca feitos pelo fotógrafo (Painel > Marca d'água), por cima da configuração da
     * gestão e dentro dos mesmos limites (src/lib/protecao-previas.ts). Nulos: vale o da gestão.
     */
    marcaTamanhoPct: integer(),
    marcaQuantidade: integer(),
    marcaOpacidadePct: integer(),
    marcaLarguraPrevia: integer(),
    marcaVariacao: boolean(),
    /**
     * Conta de demonstração (vídeos e tutoriais, src/servicos/demonstracao.ts): vendas fictícias,
     * sem saque, fora dos rankings e dos números da gestão.
     */
    demonstracao: boolean().notNull().default(false),
    /**
     * "Antecipar automaticamente vendas no cartão": a venda no cartão fica disponível 1 dia depois
     * do pagamento, com 1,99% sobre o bruto, em vez de 30 dias sem taxa. É liberação interna do
     * ClicouAí: o gateway já libera o cartão na hora para a conta da plataforma.
     */
    anteciparCartao: boolean().notNull().default(false),
    /** Transferência automática do saldo disponível: cria sozinha o pedido de saque. */
    transferenciaAutomatica: boolean().notNull().default(false),
    frequenciaTransferencia: frequenciaTransferencia().notNull().default("semanal"),
    /** Quando a transferência automática foi ligada: conta o primeiro intervalo. */
    transferenciaAutomaticaDesde: data(),
    /** Último saque criado pela transferência automática: conta o próximo intervalo. */
    ultimaTransferenciaAutomaticaEm: data(),
  },
  (t) => [uniqueIndex().on(t.usuarioId), uniqueIndex().on(t.slug)],
).enableRLS();

/**
 * Chaves de acesso do plugin do Lightroom (src/servicos/chaves-api.ts): o fotógrafo gera em
 * Painel > Lightroom e cola no plugin, que envia fotos sem o login do navegador. Só o SHA-256 da
 * chave fica guardado (ela é aleatória, 256 bits); o `prefixo` (começo da chave) só identifica
 * a chave na lista. Revogada, para de valer na hora.
 */
export const chavesApi = pgTable(
  "chaves_api",
  {
    id: uuid().primaryKey().defaultRandom(),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id, { onDelete: "cascade" }),
    nome: text().notNull(),
    prefixo: text().notNull(),
    segredoHash: text().notNull(),
    criadaEm: momento(),
    usadaEm: data(),
    revogadaEm: data(),
  },
  (t) => [uniqueIndex().on(t.segredoHash), index().on(t.fotografoId)],
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
    /** Data e hora de fim. Opcional: sem ela, o evento vale só pela data de início. */
    fimEm: data(),
    local: text().notNull(),
    cidade: text().notNull(),
    estado: text().notNull(),
    /**
     * Ponto escolhido no mapa (OpenStreetMap; docs/arquitetura.md, "Local no mapa"). Os dois
     * juntos ou nenhum: sem eles, o evento tem só o texto de local, cidade e estado.
     */
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    /** Endereço curto do ponto (rua, número, bairro, cidade – UF), vindo do Nominatim. */
    enderecoMapa: text(),
    capa: text(),
    /**
     * Foto de capa escolhida pelo dono (cartões, página do evento, divulgação). Nula: capa
     * automática. Só vale enquanto a foto estiver pronta, liberada e não excluída; senão a
     * consulta cai para a automática (src/dados/capa.ts).
     */
    capaFotoId: uuid().references((): AnyPgColumn => fotos.id, { onDelete: "set null" }),
    precoFotoCentavos: integer().notNull(),
    precoVideoCentavos: integer().notNull(),
    status: statusEvento().notNull().default("rascunho"),
    visibilidade: visibilidade().notNull().default("publico"),
    senhaHash: text(),
    listado: boolean().notNull().default(true),
    /**
     * Sem uso: a opção "fotos só após a busca" foi removida e a galeria ignora a coluna, mesmo
     * quando está `true`. Fica até a migração que a apaga (docs/tarefas.md).
     */
    fotosSoAposBusca: boolean().notNull().default(false),
    liberacao: liberacao().notNull().default("automatica"),
    liberadoEm: data(),
    filtroHorario: boolean().notNull().default(false),
    listarNaoIdentificadas: boolean().notNull().default(false),
    /**
     * Prévia desfocada com o círculo de revelação no visualizador e na página da foto. Opcional:
     * desligada, o cliente vê a prévia nítida com a marca d'água (o fotógrafo escolhe por evento).
     */
    previaDesfocada: boolean().notNull().default(false),
    ordenacao: ordenacao().notNull().default("captura"),
    /** Desligado, as faixas de desconto progressivo não valem neste evento. */
    descontoProgressivo: boolean().notNull().default(true),
    /**
     * Lê o número de peito das fotos (Rekognition DetectText, src/servicos/numeros.ts) para a
     * busca por número. Ligada por padrão nas categorias com peito (src/lib/numeros-de-peito.ts);
     * cada leitura é cobrada, então nas demais fica desligada.
     */
    lerNumeros: boolean().notNull().default(false),
    /**
     * Última busca por rosto no evento (selfie pública ou busca do painel), gravada no máximo a
     * cada poucas horas. Conta como atividade para não arquivar a coleção (src/servicos/
     * colecoes.ts). Nos eventos anteriores à migração 0036, começa com a última visita.
     */
    ultimaBuscaEm: data(),
    /**
     * A coleção do evento no Rekognition foi apagada por inatividade e os rostos saíram do banco
     * (`rostos`, `fotos.rostos_indexados_em`). Nulo: rostos indexados normalmente. A busca num
     * evento arquivado pede a reindexação em vez de consultar o provedor.
     */
    rostosArquivadosEm: data(),
    /** Alguém buscou no evento arquivado: a reindexação continua até terminar. */
    reindexacaoPedidaEm: data(),
    /** Reserva da reindexação em andamento (uma por vez por evento), até esta hora. */
    reindexacaoAte: data(),
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
    /**
     * Pasta de cima: nulo nas pastas de nível 1; numa subpasta, uma pasta de nível 1 do mesmo
     * evento. No máximo 2 níveis (conferido no servidor e pelo gatilho da migração 0043).
     * Apagar a pasta de cima apaga as subpastas; as fotos ficam sem pasta (excluirPasta).
     */
    pastaPaiId: uuid().references((): AnyPgColumn => pastas.id, { onDelete: "cascade" }),
    nome: text().notNull(),
    ordem: integer().notNull(),
  },
  (t) => [index().on(t.eventoId), index().on(t.pastaPaiId)],
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
    /** Sem uso: era o id no Cloudflare Stream (os vídeos passaram a ser convertidos na Vercel). */
    streamUid: text(),
    /** Vídeo: chave da prévia em MP4 com marca d'água no bucket público (src/servicos/video.ts). */
    previaVideo: text(),
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
     * Quando a foto passou pela leitura do número de peito (src/servicos/numeros.ts), mesmo que
     * sem nenhum número. Nulo: ainda não passou (evento sem a opção, leitura que falhou ou foto
     * anterior à migração 0038); o "Ler números que faltam" e o job de revisão pegam essas.
     */
    numerosLidosEm: data(),
    /**
     * Início do envio atual (a URL assinada vale 15 minutos). O job que revisa fotos presas em
     * `processando` só mexe nas que passaram bem desse prazo (src/servicos/envios.ts). Nulo nas
     * fotos anteriores à migração 0007: vale o `criado_em`.
     */
    envioIniciadoEm: data(),
    /** Por que a foto ficou em `erro`, para o fotógrafo ver no painel. */
    erroMensagem: text(),
    /**
     * Modo escolhido para o lote desta foto (o padrão do evento ou o do envio). Só registra a
     * escolha: quem decide a visibilidade é `liberar_em`.
     */
    liberacao: liberacao().notNull().default("automatica"),
    /**
     * A partir de quando a foto aparece para o público (galeria, busca, página da foto,
     * carrinho e checkout): toda consulta pública filtra `liberar_em <= agora`. Nulo: aguarda o
     * "Liberar agora" do dono (manual). No automático, é o momento do envio.
     */
    liberarEm: data(),
    /** Quando saiu o aviso de lote agendado liberado (job de pedidos): o aviso não se repete. */
    avisoLiberacaoEm: data(),
  },
  (t) => [
    index().on(t.eventoId, t.ordem),
    index().on(t.eventoId, t.capturadaEm),
    index().on(t.eventoId, t.hashConteudo),
    index().on(t.eventoId, t.liberarEm),
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
    /** Só dígitos, sem zeros à esquerda (src/lib/numeros-de-peito.ts, normalizarNumero). */
    numero: text().notNull(),
    /** Confiança da leitura (0–100); nula na correção manual e nos dados de exemplo. */
    confianca: doublePrecision(),
    /** Onde está o número na foto, em frações de 0 a 1 (como devolve o Rekognition). */
    caixa: jsonb().$type<{ esquerda: number; topo: number; largura: number; altura: number }>(),
    /** Posto pelo fotógrafo no painel: a releitura da foto não o apaga. */
    manual: boolean().notNull().default(false),
  },
  (t) => [index().on(t.numero, t.fotoId), uniqueIndex().on(t.fotoId, t.numero)],
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
    /** CPF/CNPJ do comprador. Não é mais pedido (era exigido pelo Asaas); fica nulo. */
    cpfComprador: text(),
    whatsapp: text(),
    aceitaWhatsapp: boolean().notNull().default(false),
    tokenAcessoHash: text(),
    acessoExpiraEm: data(),
    cupomId: uuid().references(() => cupons.id),
    subtotalCentavos: integer().notNull(),
    descontoCentavos: integer().notNull(),
    /**
     * No cartão, a metade da taxa do Mercado Pago que o comprador paga (src/lib/taxas.ts); a outra
     * metade sai da parte do fotógrafo. Já está somado no total. Zero no Pix.
     */
    acrescimoCartaoCentavos: integer().notNull().default(0),
    totalCentavos: integer().notNull(),
    metodo: metodoPagamento().notNull(),
    status: statusPedido().notNull().default("pendente"),
    expiraEm: data().notNull(),
    /**
     * Order no Mercado Pago. Única: o webhook busca
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
    /**
     * Pedido fictício da conta de demonstração (src/servicos/demonstracao.ts), ou pedido de teste da
     * equipe marcado depois: fica fora dos rankings e dos números da gestão. Fora da conta de
     * demonstração, as vendas dele também saem do Financeiro do fotógrafo (src/dados/painel.ts).
     */
    demonstracao: boolean().notNull().default(false),
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

/**
 * O que o autor baixou dos originais (src/servicos/originais-do-dono.ts): os lotes do dono do
 * evento ("vendidas" e "minhas", só fotos dele), uma foto só ("individual", dono ou
 * colaborador, sempre na foto que ele mesmo enviou) ou o lote da aba Fotos vendidas
 * ("vendidas_geral": as fotos que ele enviou e foram vendidas em pedido pago, de qualquer
 * evento; uma linha por evento de cada lote).
 */
export const modoOriginaisDoDono = pgEnum("modo_originais_do_dono", [
  "vendidas",
  "minhas",
  "individual",
  "vendidas_geral",
]);

/**
 * Auditoria do download dos originais pelo autor: uma linha por lote de URLs assinadas do dono
 * do evento, ou por foto baixada individualmente (quem, evento, qual opção, quantos arquivos,
 * IP). `fotografo_id` é a conta de quem baixou, que é sempre a autora das fotos entregues.
 * Nunca guarda as URLs nem as chaves.
 */
export const downloadsDoDono = pgTable(
  "downloads_do_dono",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    fotografoId: uuid()
      .notNull()
      .references(() => fotografos.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    modo: modoOriginaisDoDono().notNull(),
    quantidade: integer().notNull(),
    ip: text(),
    criadoEm: momento(),
  },
  (t) => [index().on(t.eventoId, t.criadoEm), index().on(t.fotografoId)],
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
    /** Comissão mais antecipação: a soma das duas colunas abaixo. */
    taxaCentavos: integer().notNull(),
    /**
     * As partes da taxa, para auditoria e para o resumo do painel. Nos saques anteriores à
     * migração 0040 elas foram derivadas da taxa gravada, que não mudou.
     */
    comissaoCentavos: integer().notNull().default(0),
    taxaAntecipacaoCentavos: integer().notNull().default(0),
    liquidoCentavos: integer().notNull(),
    chavePix: text().notNull(),
    gatewayId: text(),
    status: statusSaque().notNull().default("processando"),
    /**
     * Saque de teste (feito pela equipe enquanto testava o site): fica fora dos números da gestão
     * e do Financeiro do fotógrafo, sem apagar o registro (src/dados/admin.ts, painel.ts).
     */
    demonstracao: boolean().notNull().default(false),
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

// ---------------------------------------------------------------- Notificações

/**
 * Inscrições de notificação do navegador (Web Push) de cada usuário: uma por aparelho/navegador
 * em que ele clicou em "Ativar notificações". O endpoint é único; se o navegador disser que a
 * inscrição venceu, ela é apagada (src/lib/push.ts).
 */
export const inscricoesPush = pgTable(
  "inscricoes_push",
  {
    id: uuid().primaryKey().defaultRandom(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    criadoEm: momento(),
  },
  (t) => [uniqueIndex().on(t.endpoint), index().on(t.usuarioId)],
).enableRLS();

// ---------------------------------------------------------------- Suporte e sugestões

export const autorMensagemSuporte = pgEnum("autor_mensagem_suporte", ["usuario", "equipe"]);
export const statusSugestao = pgEnum("status_sugestao", [
  "nova",
  "em_analise",
  "feita",
  "descartada",
]);

/**
 * Conversa do chat de ajuda (painel e site): uma por usuário ou por visitante sem conta, como um
 * fio de WhatsApp. Os dois
 * "não lida" acendem o aviso de mensagem nova de cada lado.
 */
export const tipoContatoSuporte = pgEnum("tipo_contato_suporte", [
  "fotografo",
  "gestor",
  "cliente",
  "visitante",
]);

export const conversasSuporte = pgTable(
  "conversas_suporte",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Quem tem conta. Visitante sem conta fica em `visitanteId`. */
    usuarioId: uuid().references(() => usuarios.id, { onDelete: "cascade" }),
    /** Visitante sem conta: hash do cookie do chat (src/servicos/suporte-visitante.ts). */
    visitanteId: text(),
    /** Quem escreveu por último: a gestão vê se é fotógrafo, gestor, cliente ou visitante. */
    tipo: tipoContatoSuporte().notNull().default("fotografo"),
    /** Nome e e-mail que a pessoa informou no chat (podem diferir dos da conta). */
    nome: text().notNull(),
    email: text().notNull(),
    naoLidaPelaEquipe: boolean().notNull().default(false),
    naoLidaPeloUsuario: boolean().notNull().default(false),
    criadoEm: momento(),
    atualizadoEm: momento(),
  },
  (t) => [
    uniqueIndex().on(t.usuarioId),
    uniqueIndex().on(t.visitanteId),
    index().on(t.atualizadoEm),
  ],
).enableRLS();

export const mensagensSuporte = pgTable(
  "mensagens_suporte",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversaId: uuid()
      .notNull()
      .references(() => conversasSuporte.id, { onDelete: "cascade" }),
    autor: autorMensagemSuporte().notNull(),
    texto: text().notNull(),
    criadoEm: momento(),
  },
  (t) => [index().on(t.conversaId, t.criadoEm)],
).enableRLS();

/** Sugestão de melhoria mandada pelo botão do foguete no painel. */
export const sugestoes = pgTable(
  "sugestoes",
  {
    id: uuid().primaryKey().defaultRandom(),
    usuarioId: uuid().references(() => usuarios.id, { onDelete: "set null" }),
    nome: text().notNull(),
    email: text().notNull(),
    texto: text().notNull(),
    status: statusSugestao().notNull().default("nova"),
    criadoEm: momento(),
  },
  (t) => [index().on(t.criadoEm)],
).enableRLS();

/**
 * Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"). Cada vez que um gestor liga ou
 * desliga, entra uma linha nova: a mais recente é o estado atual e as anteriores são o histórico
 * (quem mudou e quando). Sem nenhuma linha, a manutenção está desligada.
 */
export const modoManutencao = pgTable(
  "modo_manutencao",
  {
    id: uuid().primaryKey().defaultRandom(),
    ativa: boolean().notNull(),
    /** Recado do gestor para o público (até 200 caracteres), mostrado na tela de manutenção. */
    mensagem: text(),
    alteradaEm: momento(),
    /** Gestor que ligou ou desligou. */
    alteradaPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
  },
  (t) => [index().on(t.alteradaEm)],
).enableRLS();

// ---------------------------------------------------------------- Painel de uso (gestão)

export const categoriaAssinatura = pgEnum("categoria_assinatura", [
  "hospedagem",
  "banco",
  "armazenamento",
  "email",
  "ia",
  "dominio",
  "pagamentos",
  "outros",
]);
export const moedaAssinatura = pgEnum("moeda_assinatura", ["BRL", "USD"]);
/** `uso`: pague pelo que usar; o valor é a estimativa por mês. */
export const cicloAssinatura = pgEnum("ciclo_assinatura", ["mensal", "anual", "uso"]);

/**
 * Serviços que a plataforma assina (Vercel, Supabase, R2, Resend…), cadastrados à mão pela gestão
 * em /admin/uso. A forma de pagamento é só um texto curto ("Mastercard final 9292"): o servidor
 * recusa sequências de 12 ou mais dígitos, para nunca guardar o número de um cartão.
 * `aviso_7d_em` e `aviso_1d_em` marcam o e-mail de vencimento já enviado (job de pedidos) e
 * voltam a nulo quando `renova_em` muda.
 */
export const assinaturas = pgTable(
  "assinaturas",
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    categoria: categoriaAssinatura().notNull(),
    plano: text().notNull().default(""),
    valorCentavos: integer().notNull(),
    moeda: moedaAssinatura().notNull().default("BRL"),
    ciclo: cicloAssinatura().notNull(),
    assinadaEm: date({ mode: "string" }).notNull(),
    renovaEm: date({ mode: "string" }),
    ativa: boolean().notNull().default(true),
    formaPagamento: text().notNull().default(""),
    responsavel: text().notNull().default(""),
    linkPainel: text(),
    observacoes: text().notNull().default(""),
    aviso7dEm: data(),
    aviso1dEm: data(),
    criadoEm: momento(),
    atualizadoEm: momento(),
    criadoPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
  },
  (t) => [index().on(t.ativa, t.renovaEm)],
).enableRLS();

/**
 * Configurações da gestão, chave e valor inteiro: a cotação do dólar em centavos (545 = R$ 5,45)
 * e os limites do plano do Resend. Editadas à mão em /admin/uso.
 */
export const configuracoesGestao = pgTable("configuracoes_gestao", {
  chave: text().primaryKey(),
  valor: integer().notNull(),
  atualizadoEm: momento(),
  atualizadoPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
}).enableRLS();

/**
 * Contadores anônimos de uso por dia (horário de Brasília): e-mails aceitos pelo Resend e buscas
 * por selfie. Só a chave e o total: nenhum dado de quem usou, nem a selfie, nem o destinatário.
 */
export const contadoresUso = pgTable(
  "contadores_uso",
  {
    dia: date({ mode: "string" }).notNull(),
    chave: text().notNull(),
    total: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.dia, t.chave] })],
).enableRLS();

// ---------------------------------------------------------------- Proteção das prévias (gestão)

/**
 * Configuração global das prévias: marca d'água, lado maior e qualidade (src/lib/protecao-
 * previas.ts; docs/arquitetura.md, "Prévia e marca d'água"). Cada vez que um gestor salva vira
 * uma linha nova com a revisão seguinte, e a de maior revisão vale: o histórico de quem mudou o
 * quê fica aqui. A revisão vai na chave das prévias geradas com ela (`-v5-r3.webp`). Sem
 * nenhuma linha, valem os padrões (revisão 0).
 */
export const configuracoesMarca = pgTable("configuracoes_marca", {
  revisao: integer().primaryKey(),
  tamanhoPct: integer().notNull(),
  quantidade: integer().notNull(),
  opacidadePct: integer().notNull(),
  larguraPrevia: integer().notNull(),
  qualidade: integer().notNull(),
  variacao: boolean().notNull(),
  criadaEm: momento(),
  /** Gestor que salvou. */
  criadaPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
  /**
   * Quando um gestor confirmou regerar as prévias já enviadas com esta revisão (a regeração
   * em lotes só anda com a revisão em vigor pedida; uma revisão nova para tudo até outro pedido).
   */
  regeracaoPedidaEm: data(),
  regeracaoPedidaPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
}).enableRLS();

// ---------------------------------------------------------------- Moldura do evento

export const formatoMoldura = pgEnum("formato_moldura", ["story", "feed"]);

/**
 * Moldura do evento (docs/arquitetura.md, "Moldura do evento"): a arte em PNG com transparência
 * que o dono do evento envia, uma por formato (story 1080×1920, feed 1080×1350). É imagem de
 * divulgação, como a capa enviada: `chave` é o PNG conferido e regravado no bucket público
 * (`eventos/{evento}/moldura-...png`) ou, sem R2 (desenvolvimento), a própria imagem em data:.
 * Quem comprou a foto baixa o original já encaixado nela (src/servicos/molduras.ts).
 */
export const moldurasEvento = pgTable(
  "molduras_evento",
  {
    eventoId: uuid()
      .notNull()
      .references(() => eventos.id, { onDelete: "cascade" }),
    formato: formatoMoldura().notNull(),
    chave: text().notNull(),
    atualizadaEm: momento(),
  },
  (t) => [primaryKey({ columns: [t.eventoId, t.formato] })],
).enableRLS();
