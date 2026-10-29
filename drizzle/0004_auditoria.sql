CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid,
	"usuario_id" uuid DEFAULT nullif(current_setting('app.usuario_id', true), '')::uuid,
	"tabela" text NOT NULL,
	"registro_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_acao_check" CHECK (acao in ('criou', 'alterou'))
);
--> statement-breakpoint
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_empresa_id_quando_idx" ON "auditoria" USING btree ("empresa_id","quando");--> statement-breakpoint
CREATE POLICY "auditoria_isolamento" ON "auditoria" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "auditoria_plataforma" ON "auditoria" AS PERMISSIVE FOR INSERT TO "plataforma" WITH CHECK (true);