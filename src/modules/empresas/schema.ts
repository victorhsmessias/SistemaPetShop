import { sql } from "drizzle-orm";
import { check, pgPolicy, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

import { empresaDaTransacao, papelApp, papelPlataforma } from "@/db/rls";

export const empresa = pgTable(
  "empresa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    fusoHorario: text("fuso_horario").notNull().default("America/Sao_Paulo"),
    status: text("status").notNull().default("ativa"),
    horarioResumo: time("horario_resumo").notNull().default("07:00"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  () => [
    check("empresa_status_check", sql`status in ('ativa', 'suspensa')`),
    // O app só enxerga a própria empresa; aqui a comparação é com `id`.
    pgPolicy("empresa_propria", {
      as: "permissive",
      for: "select",
      to: papelApp,
      using: sql`id = ${empresaDaTransacao}`,
    }),
    // A plataforma administra todas as empresas.
    pgPolicy("empresa_plataforma", {
      as: "permissive",
      for: "all",
      to: papelPlataforma,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
).enableRLS();

/**
 * Coluna `empresa_id` das tabelas de negócio: preenchida pela empresa da transação.
 * Usar junto com `politicaDeIsolamento` e com chaves estrangeiras compostas.
 */
export function colunaEmpresaId() {
  return uuid("empresa_id")
    .notNull()
    .default(empresaDaTransacao)
    .references(() => empresa.id);
}

export function colunasDeData() {
  return {
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}
