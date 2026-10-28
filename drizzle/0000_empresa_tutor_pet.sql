CREATE TABLE "pet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tutor_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"especie" text DEFAULT 'cao' NOT NULL,
	"raca" text,
	"porte" text NOT NULL,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "pet_especie_check" CHECK (especie in ('cao', 'gato', 'outro')),
	CONSTRAINT "pet_porte_check" CHECK (porte in ('P', 'M', 'G', 'GG'))
);
--> statement-breakpoint
ALTER TABLE "pet" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tutor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"observacoes" text,
	"anonimizado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_empresa_id_telefone_key" UNIQUE("empresa_id","telefone"),
	CONSTRAINT "tutor_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "tutor_telefone_check" CHECK (telefone is not null or anonimizado_em is not null)
);
--> statement-breakpoint
ALTER TABLE "tutor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" text DEFAULT 'ativa' NOT NULL,
	"horario_resumo" time DEFAULT '07:00' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_status_check" CHECK (status in ('ativa', 'suspensa'))
);
--> statement-breakpoint
ALTER TABLE "empresa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_tutor_fk" FOREIGN KEY ("empresa_id","tutor_id") REFERENCES "public"."tutor"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor" ADD CONSTRAINT "tutor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_empresa_id_tutor_id_idx" ON "pet" USING btree ("empresa_id","tutor_id");--> statement-breakpoint
CREATE POLICY "pet_isolamento" ON "pet" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tutor_isolamento" ON "tutor" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "empresa_propria" ON "empresa" AS PERMISSIVE FOR SELECT TO "app" USING (id = nullif(current_setting('app.empresa_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "empresa_plataforma" ON "empresa" AS PERMISSIVE FOR ALL TO "plataforma" USING (true) WITH CHECK (true);