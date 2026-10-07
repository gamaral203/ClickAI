CREATE TYPE "public"."alvo_denuncia" AS ENUM('evento', 'foto');--> statement-breakpoint
CREATE TYPE "public"."canal_mensagem" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."liberacao" AS ENUM('automatica', 'manual', 'agendada');--> statement-breakpoint
CREATE TYPE "public"."metodo_pagamento" AS ENUM('pix', 'cartao');--> statement-breakpoint
CREATE TYPE "public"."minimo_cupom" AS ENUM('nenhum', 'valor', 'quantidade');--> statement-breakpoint
CREATE TYPE "public"."ordenacao" AS ENUM('envio', 'captura', 'nome_arquivo', 'aleatoria');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('cliente', 'fotografo', 'admin');--> statement-breakpoint
CREATE TYPE "public"."status_denuncia" AS ENUM('recebida', 'em_analise', 'procedente', 'improcedente');--> statement-breakpoint
CREATE TYPE "public"."status_evento" AS ENUM('rascunho', 'publicado', 'revisao', 'arquivado');--> statement-breakpoint
CREATE TYPE "public"."status_foto" AS ENUM('processando', 'pronta', 'erro');--> statement-breakpoint
CREATE TYPE "public"."status_pedido" AS ENUM('pendente', 'pago', 'expirado', 'cancelado', 'estornado');--> statement-breakpoint
CREATE TYPE "public"."status_saque" AS ENUM('processando', 'pago', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."tipo_cupom" AS ENUM('percentual', 'valor', 'fotos_gratis');--> statement-breakpoint
CREATE TYPE "public"."tipo_item" AS ENUM('foto', 'video');--> statement-breakpoint
CREATE TYPE "public"."tipo_mensagem" AS ENUM('entrega', 'lembrete', 'denuncia');--> statement-breakpoint
CREATE TYPE "public"."tipo_metrica" AS ENUM('visita_evento', 'visita_foto', 'carrinho');--> statement-breakpoint
CREATE TYPE "public"."tipo_preco_pacote" AS ENUM('fixo', 'por_foto');--> statement-breakpoint
CREATE TYPE "public"."visibilidade" AS ENUM('publico', 'nao_listado', 'senha');--> statement-breakpoint
CREATE TABLE "acessos_evento" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"evento_id" uuid NOT NULL,
	"senha_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anexos_denuncia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"denuncia_id" uuid NOT NULL,
	"chave" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" uuid NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"comissao_dono_pct" integer NOT NULL,
	"nota" text
);
--> statement-breakpoint
CREATE TABLE "confirmacoes_email" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo" "tipo_cupom" NOT NULL,
	"valor" integer NOT NULL,
	"usos_max" integer,
	"usos" integer DEFAULT 0 NOT NULL,
	"inicio_em" timestamp with time zone NOT NULL,
	"expira_em" timestamp with time zone,
	"minimo_tipo" "minimo_cupom" DEFAULT 'nenhum' NOT NULL,
	"minimo_valor" integer DEFAULT 0 NOT NULL,
	"todos_eventos" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cupons_eventos" (
	"cupom_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	CONSTRAINT "cupons_eventos_cupom_id_evento_id_pk" PRIMARY KEY("cupom_id","evento_id")
);
--> statement-breakpoint
CREATE TABLE "denuncias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alvo_tipo" "alvo_denuncia" NOT NULL,
	"evento_id" uuid NOT NULL,
	"foto_id" uuid,
	"motivo" text NOT NULL,
	"descricao" text NOT NULL,
	"contato_email" text NOT NULL,
	"contato_telefone" text,
	"razao_social" text,
	"cnpj" text,
	"status" "status_denuncia" DEFAULT 'recebida' NOT NULL,
	"decidida_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_pedido_id" uuid NOT NULL,
	"baixado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"slug" text NOT NULL,
	"inicio_em" timestamp with time zone NOT NULL,
	"fim_em" timestamp with time zone NOT NULL,
	"local" text NOT NULL,
	"cidade" text NOT NULL,
	"estado" text NOT NULL,
	"capa" text,
	"preco_foto_centavos" integer NOT NULL,
	"preco_video_centavos" integer NOT NULL,
	"status" "status_evento" DEFAULT 'rascunho' NOT NULL,
	"visibilidade" "visibilidade" DEFAULT 'publico' NOT NULL,
	"senha_hash" text,
	"listado" boolean DEFAULT true NOT NULL,
	"fotos_so_apos_busca" boolean DEFAULT false NOT NULL,
	"liberacao" "liberacao" DEFAULT 'automatica' NOT NULL,
	"liberado_em" timestamp with time zone,
	"filtro_horario" boolean DEFAULT false NOT NULL,
	"listar_nao_identificadas" boolean DEFAULT false NOT NULL,
	"ordenacao" "ordenacao" DEFAULT 'captura' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faixas_desconto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"evento_id" uuid,
	"quantidade_min" integer NOT NULL,
	"desconto_pct" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fotografos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome_publico" text NOT NULL,
	"slug" text NOT NULL,
	"bio" text,
	"foto_perfil" text,
	"capa" text,
	"redes_sociais" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cpf_cnpj" text DEFAULT '' NOT NULL,
	"chave_pix" text,
	"comissao_pct" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" uuid NOT NULL,
	"pasta_id" uuid,
	"enviada_por" uuid NOT NULL,
	"tipo" "tipo_item" DEFAULT 'foto' NOT NULL,
	"chave_original" text,
	"url_previa" text NOT NULL,
	"url_miniatura" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"largura" integer NOT NULL,
	"altura" integer NOT NULL,
	"duracao_s" integer,
	"tamanho_bytes" bigint,
	"hash_conteudo" text,
	"capturada_em" timestamp with time zone,
	"preco_centavos" integer,
	"ordem" integer NOT NULL,
	"status" "status_foto" DEFAULT 'processando' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluida_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "itens_pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"foto_id" uuid NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"preco_centavos" integer NOT NULL,
	"desconto_centavos" integer NOT NULL,
	"valor_fotografo_centavos" integer NOT NULL,
	"valor_dono_evento_centavos" integer NOT NULL,
	"via_pacote" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"item_pedido_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"disponivel_em" timestamp with time zone NOT NULL,
	"antecipavel_em" timestamp with time zone NOT NULL,
	"saque_id" uuid
);
--> statement-breakpoint
CREATE TABLE "lojas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"logo" text,
	"cor_primaria" text NOT NULL,
	"cor_secundaria" text NOT NULL,
	"subdominio" text NOT NULL,
	"dominio_proprio" text,
	"dominio_verificado" boolean DEFAULT false NOT NULL,
	"ga_id" text,
	"gtm_id" text,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid,
	"canal" "canal_mensagem" NOT NULL,
	"tipo" "tipo_mensagem" NOT NULL,
	"para" text NOT NULL,
	"assunto" text NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metricas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_metrica" NOT NULL,
	"evento_id" uuid NOT NULL,
	"foto_id" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modelos_evento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"config" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numeros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"foto_id" uuid NOT NULL,
	"numero" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pacotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" uuid NOT NULL,
	"tipo_preco" "tipo_preco_pacote" NOT NULL,
	"preco_centavos" integer NOT NULL,
	"mostrar_a_partir_de" integer,
	"expira_em" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pastas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid,
	"email_comprador" text NOT NULL,
	"nome_comprador" text NOT NULL,
	"whatsapp" text,
	"aceita_whatsapp" boolean DEFAULT false NOT NULL,
	"token_acesso_hash" text,
	"acesso_expira_em" timestamp with time zone,
	"cupom_id" uuid,
	"subtotal_centavos" integer NOT NULL,
	"desconto_centavos" integer NOT NULL,
	"total_centavos" integer NOT NULL,
	"metodo" "metodo_pagamento" NOT NULL,
	"status" "status_pedido" DEFAULT 'pendente' NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"gateway_id" text,
	"pix_copia_e_cola" text,
	"pix_qr_code_base64" text,
	"pago_em" timestamp with time zone,
	"lembrete_enviado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rostos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"foto_id" uuid NOT NULL,
	"rosto_id_provedor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fotografo_id" uuid NOT NULL,
	"antecipado" boolean NOT NULL,
	"bruto_centavos" integer NOT NULL,
	"taxa_centavos" integer NOT NULL,
	"liquido_centavos" integer NOT NULL,
	"chave_pix" text NOT NULL,
	"gateway_id" text,
	"status" "status_saque" DEFAULT 'processando' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"pago_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefone" text,
	"papel" "papel" NOT NULL,
	"senha_hash" text,
	"google_id" text,
	"email_confirmado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acessos_evento" ADD CONSTRAINT "acessos_evento_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_denuncia" ADD CONSTRAINT "anexos_denuncia_denuncia_id_denuncias_id_fk" FOREIGN KEY ("denuncia_id") REFERENCES "public"."denuncias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmacoes_email" ADD CONSTRAINT "confirmacoes_email_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupons_eventos" ADD CONSTRAINT "cupons_eventos_cupom_id_cupons_id_fk" FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupons_eventos" ADD CONSTRAINT "cupons_eventos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_decidida_por_usuarios_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_item_pedido_id_itens_pedido_id_fk" FOREIGN KEY ("item_pedido_id") REFERENCES "public"."itens_pedido"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixas_desconto" ADD CONSTRAINT "faixas_desconto_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faixas_desconto" ADD CONSTRAINT "faixas_desconto_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fotografos" ADD CONSTRAINT "fotografos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_pasta_id_pastas_id_fk" FOREIGN KEY ("pasta_id") REFERENCES "public"."pastas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_enviada_por_fotografos_id_fk" FOREIGN KEY ("enviada_por") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_item_pedido_id_itens_pedido_id_fk" FOREIGN KEY ("item_pedido_id") REFERENCES "public"."itens_pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_saque_id_saques_id_fk" FOREIGN KEY ("saque_id") REFERENCES "public"."saques"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lojas" ADD CONSTRAINT "lojas_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metricas" ADD CONSTRAINT "metricas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metricas" ADD CONSTRAINT "metricas_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos_evento" ADD CONSTRAINT "modelos_evento_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeros" ADD CONSTRAINT "numeros_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacotes" ADD CONSTRAINT "pacotes_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastas" ADD CONSTRAINT "pastas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cupom_id_cupons_id_fk" FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rostos" ADD CONSTRAINT "rostos_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saques" ADD CONSTRAINT "saques_fotografo_id_fotografos_id_fk" FOREIGN KEY ("fotografo_id") REFERENCES "public"."fotografos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_slug_index" ON "categorias" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_evento_id_fotografo_id_index" ON "colaboradores" USING btree ("evento_id","fotografo_id");--> statement-breakpoint
CREATE INDEX "colaboradores_fotografo_id_index" ON "colaboradores" USING btree ("fotografo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cupons_codigo_unico" ON "cupons" USING btree (upper("codigo"));--> statement-breakpoint
CREATE INDEX "cupons_fotografo_id_index" ON "cupons" USING btree ("fotografo_id");--> statement-breakpoint
CREATE INDEX "denuncias_status_criado_em_index" ON "denuncias" USING btree ("status","criado_em");--> statement-breakpoint
CREATE INDEX "denuncias_evento_id_index" ON "denuncias" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "downloads_item_pedido_id_index" ON "downloads" USING btree ("item_pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_slug_index" ON "eventos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "eventos_fotografo_id_index" ON "eventos" USING btree ("fotografo_id");--> statement-breakpoint
CREATE INDEX "eventos_status_inicio_em_index" ON "eventos" USING btree ("status","inicio_em");--> statement-breakpoint
CREATE INDEX "faixas_desconto_fotografo_id_evento_id_index" ON "faixas_desconto" USING btree ("fotografo_id","evento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fotografos_usuario_id_index" ON "fotografos" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fotografos_slug_index" ON "fotografos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "fotos_evento_id_ordem_index" ON "fotos" USING btree ("evento_id","ordem");--> statement-breakpoint
CREATE INDEX "fotos_evento_id_capturada_em_index" ON "fotos" USING btree ("evento_id","capturada_em");--> statement-breakpoint
CREATE INDEX "fotos_evento_id_hash_conteudo_index" ON "fotos" USING btree ("evento_id","hash_conteudo");--> statement-breakpoint
CREATE INDEX "itens_pedido_pedido_id_index" ON "itens_pedido" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "itens_pedido_foto_id_index" ON "itens_pedido" USING btree ("foto_id");--> statement-breakpoint
CREATE INDEX "lancamentos_fotografo_id_saque_id_index" ON "lancamentos" USING btree ("fotografo_id","saque_id");--> statement-breakpoint
CREATE INDEX "lancamentos_item_pedido_id_index" ON "lancamentos" USING btree ("item_pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lojas_fotografo_id_index" ON "lojas" USING btree ("fotografo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lojas_subdominio_index" ON "lojas" USING btree ("subdominio");--> statement-breakpoint
CREATE UNIQUE INDEX "lojas_dominio_proprio_index" ON "lojas" USING btree ("dominio_proprio");--> statement-breakpoint
CREATE INDEX "mensagens_criado_em_index" ON "mensagens" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "metricas_evento_id_tipo_em_index" ON "metricas" USING btree ("evento_id","tipo","em");--> statement-breakpoint
CREATE INDEX "metricas_foto_id_index" ON "metricas" USING btree ("foto_id");--> statement-breakpoint
CREATE INDEX "modelos_evento_fotografo_id_index" ON "modelos_evento" USING btree ("fotografo_id");--> statement-breakpoint
CREATE INDEX "numeros_numero_foto_id_index" ON "numeros" USING btree ("numero","foto_id");--> statement-breakpoint
CREATE INDEX "numeros_foto_id_index" ON "numeros" USING btree ("foto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pacotes_evento_id_index" ON "pacotes" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "pastas_evento_id_index" ON "pastas" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "pedidos_cliente_id_index" ON "pedidos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "pedidos_status_expira_em_index" ON "pedidos" USING btree ("status","expira_em");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_gateway_id_index" ON "pedidos" USING btree ("gateway_id");--> statement-breakpoint
CREATE INDEX "rostos_rosto_id_provedor_index" ON "rostos" USING btree ("rosto_id_provedor");--> statement-breakpoint
CREATE INDEX "rostos_foto_id_index" ON "rostos" USING btree ("foto_id");--> statement-breakpoint
CREATE INDEX "saques_fotografo_id_status_index" ON "saques" USING btree ("fotografo_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_index" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_google_id_index" ON "usuarios" USING btree ("google_id");