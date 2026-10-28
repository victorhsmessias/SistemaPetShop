import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { politicaDeIsolamento } from "@/db/rls";
import { colunaEmpresaId, colunasDeData } from "@/modules/empresas/schema";

export const tutor = pgTable(
  "tutor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    nome: text("nome").notNull(),
    // Formato internacional (+55…), normalizado pelo app. Fica null depois da anonimização (H12).
    telefone: text("telefone"),
    observacoes: text("observacoes"),
    anonimizadoEm: timestamp("anonimizado_em", { withTimezone: true }),
    ...colunasDeData(),
  },
  (t) => [
    unique("tutor_empresa_id_telefone_key").on(t.empresaId, t.telefone),
    // Alvo das chaves estrangeiras compostas.
    unique("tutor_empresa_id_id_key").on(t.empresaId, t.id),
    check("tutor_telefone_check", sql`telefone is not null or anonimizado_em is not null`),
    politicaDeIsolamento("tutor"),
  ],
).enableRLS();

export const pet = pgTable(
  "pet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    tutorId: uuid("tutor_id").notNull(),
    nome: text("nome").notNull(),
    especie: text("especie").notNull().default("cao"),
    raca: text("raca"),
    porte: text("porte").notNull(),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasDeData(),
  },
  (t) => [
    foreignKey({
      name: "pet_tutor_fk",
      columns: [t.empresaId, t.tutorId],
      foreignColumns: [tutor.empresaId, tutor.id],
    }),
    index("pet_empresa_id_tutor_id_idx").on(t.empresaId, t.tutorId),
    unique("pet_empresa_id_id_key").on(t.empresaId, t.id),
    check("pet_especie_check", sql`especie in ('cao', 'gato', 'outro')`),
    check("pet_porte_check", sql`porte in ('P', 'M', 'G', 'GG')`),
    politicaDeIsolamento("pet"),
  ],
).enableRLS();
