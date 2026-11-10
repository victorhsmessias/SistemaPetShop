CREATE TABLE "categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categoria_empresa_id_tipo_nome_key" UNIQUE("empresa_id","tipo","nome"),
	CONSTRAINT "categoria_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "categoria_tipo_check" CHECK (tipo in ('receita', 'despesa'))
);
--> statement-breakpoint
ALTER TABLE "categoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "forma_pagamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"nome" text NOT NULL,
	"taxa_percentual" numeric(5, 2) DEFAULT '0' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forma_pagamento_empresa_id_nome_key" UNIQUE("empresa_id","nome"),
	CONSTRAINT "forma_pagamento_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "forma_pagamento_taxa_percentual_check" CHECK (taxa_percentual >= 0 and taxa_percentual <= 100)
);
--> statement-breakpoint
ALTER TABLE "forma_pagamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lancamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid DEFAULT nullif(current_setting('app.empresa_id', true), '')::uuid NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"taxa_centavos" integer DEFAULT 0 NOT NULL,
	"data" date NOT NULL,
	"status" text NOT NULL,
	"origem" text NOT NULL,
	"atendimento_id" uuid,
	"forma_pagamento_id" uuid,
	"categoria_id" uuid NOT NULL,
	"motivo_cancelamento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamento_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "lancamento_tipo_check" CHECK (tipo in ('receita', 'despesa')),
	CONSTRAINT "lancamento_status_check" CHECK (status in ('pago', 'a_receber', 'cancelado')),
	CONSTRAINT "lancamento_origem_check" CHECK (origem in ('atendimento', 'pacote', 'despesa_fixa', 'manual')),
	CONSTRAINT "lancamento_valor_centavos_check" CHECK (valor_centavos > 0),
	CONSTRAINT "lancamento_taxa_centavos_check" CHECK (taxa_centavos >= 0),
	CONSTRAINT "lancamento_cancelado_check" CHECK (status <> 'cancelado' or (motivo_cancelamento is not null and btrim(motivo_cancelamento) <> '')),
	CONSTRAINT "lancamento_origem_atendimento_check" CHECK (origem <> 'atendimento' or atendimento_id is not null),
	CONSTRAINT "lancamento_receita_paga_check" CHECK (not (tipo = 'receita' and status = 'pago') or forma_pagamento_id is not null)
);
--> statement-breakpoint
ALTER TABLE "lancamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forma_pagamento" ADD CONSTRAINT "forma_pagamento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_atendimento_fk" FOREIGN KEY ("empresa_id","atendimento_id") REFERENCES "public"."atendimento"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_forma_pagamento_fk" FOREIGN KEY ("empresa_id","forma_pagamento_id") REFERENCES "public"."forma_pagamento"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_categoria_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categoria"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lancamento_atendimento_id_key" ON "lancamento" USING btree ("atendimento_id") WHERE status <> 'cancelado';--> statement-breakpoint
CREATE INDEX "lancamento_empresa_id_data_idx" ON "lancamento" USING btree ("empresa_id","data");--> statement-breakpoint
CREATE POLICY "categoria_isolamento" ON "categoria" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "forma_pagamento_isolamento" ON "forma_pagamento" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "lancamento_isolamento" ON "lancamento" AS PERMISSIVE FOR ALL TO "app" USING (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) WITH CHECK (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);