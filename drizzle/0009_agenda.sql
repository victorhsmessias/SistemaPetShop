CREATE TABLE "atendimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'agendado' NOT NULL,
	"observacoes" text,
	"confirmado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"lembrete_enviado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atendimento_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "atendimento_status_check" CHECK (status in ('agendado', 'confirmado', 'em_atendimento', 'pronto', 'concluido', 'cancelado', 'faltou')),
	CONSTRAINT "atendimento_fim_check" CHECK (fim > inicio),
	CONSTRAINT "atendimento_concluido_em_check" CHECK (status <> 'concluido' or concluido_em is not null),
	CONSTRAINT "atendimento_confirmado_em_check" CHECK (status <> 'confirmado' or confirmado_em is not null),
	CONSTRAINT "atendimento_agendado_check" CHECK (status <> 'agendado' or confirmado_em is null)
);
--> statement-breakpoint
ALTER TABLE "atendimento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "atendimento_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"servico_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"preco_centavos" integer NOT NULL,
	"duracao_min" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atendimento_item_servico_key" UNIQUE("empresa_id","atendimento_id","servico_id"),
	CONSTRAINT "atendimento_item_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "atendimento_item_preco_centavos_check" CHECK (preco_centavos >= 0),
	CONSTRAINT "atendimento_item_duracao_min_check" CHECK (duracao_min > 0)
);
--> statement-breakpoint
ALTER TABLE "atendimento_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditoria" DROP CONSTRAINT "auditoria_acao_check";--> statement-breakpoint
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento" ADD CONSTRAINT "atendimento_pet_fk" FOREIGN KEY ("empresa_id","pet_id") REFERENCES "public"."pet"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_item" ADD CONSTRAINT "atendimento_item_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_item" ADD CONSTRAINT "atendimento_item_atendimento_fk" FOREIGN KEY ("empresa_id","atendimento_id") REFERENCES "public"."atendimento"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_item" ADD CONSTRAINT "atendimento_item_servico_fk" FOREIGN KEY ("empresa_id","servico_id") REFERENCES "public"."servico"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimento_empresa_id_inicio_idx" ON "atendimento" USING btree ("empresa_id","inicio");--> statement-breakpoint
CREATE INDEX "atendimento_empresa_id_pet_id_idx" ON "atendimento" USING btree ("empresa_id","pet_id");--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_acao_check" CHECK (acao in ('criou', 'alterou', 'removeu'));--> statement-breakpoint
CREATE POLICY "atendimento_isolamento" ON "atendimento" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "atendimento_item_isolamento" ON "atendimento_item" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);