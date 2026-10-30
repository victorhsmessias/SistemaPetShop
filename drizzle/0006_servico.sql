CREATE TABLE "servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nome" text NOT NULL,
	"preco_centavos" integer NOT NULL,
	"duracao_min" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servico_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "servico_preco_centavos_check" CHECK (preco_centavos >= 0),
	CONSTRAINT "servico_duracao_min_check" CHECK (duracao_min > 0)
);
--> statement-breakpoint
ALTER TABLE "servico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "servico" ADD CONSTRAINT "servico_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "servico_isolamento" ON "servico" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);