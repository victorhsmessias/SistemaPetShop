import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { empresaDaTransacao, papelPlataforma, politicaDeIsolamento } from "@/db/rls";
import { empresa } from "@/modules/empresas/schema";

/** Autor da transação, definido por comEmpresa e comPlataforma com set_config('app.usuario_id', ..., true). */
export const usuarioDaTransacao = sql`nullif(current_setting('app.usuario_id', true), '')::uuid`;

// Imutável: app só lê e cria (da própria empresa); plataforma só cria. Ninguém altera nem apaga.
// Gravada pela trigger auditar() (drizzle/0005_auditoria_trigger.sql) e por eventos explícitos (registrar.ts).
export const auditoria = pgTable(
  "auditoria",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    // Nulo só em eventos da plataforma, como criar o administrador.
    empresaId: uuid("empresa_id")
      .default(empresaDaTransacao)
      .references(() => empresa.id),
    usuarioId: uuid("usuario_id").default(usuarioDaTransacao),
    tabela: text("tabela").notNull(),
    registroId: uuid("registro_id").notNull(),
    acao: text("acao").notNull(),
    antes: jsonb("antes"),
    depois: jsonb("depois").notNull(),
    quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("auditoria_acao_check", sql`acao in ('criou', 'alterou')`),
    index("auditoria_empresa_id_quando_idx").on(t.empresaId, t.quando),
    politicaDeIsolamento("auditoria"),
    pgPolicy("auditoria_plataforma", {
      as: "permissive",
      for: "insert",
      to: papelPlataforma,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();
