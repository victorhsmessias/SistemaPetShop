import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { politicaDeIsolamento } from "@/db/rls";
import { atendimento } from "@/modules/agenda/schema";
import { colunaEmpresaId, colunasDeData } from "@/modules/empresas/schema";

// Financeiro (H10). Nada é apagado: forma de pagamento e categoria são desativadas, lançamento é cancelado
// com motivo. Formas e categorias padrão nascem com a empresa, pela trigger empresa_dados_padrao (ADR 0012,
// drizzle/0013_dados_padrao_empresa.sql). O lançamento é auditado por trigger (0012_permissoes_financeiro.sql).

export const formaPagamento = pgTable(
  "forma_pagamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    nome: text("nome").notNull(),
    // Usado no M3 (taxa da maquininha). Texto no TypeScript, para nunca virar float.
    taxaPercentual: numeric("taxa_percentual", { precision: 5, scale: 2 }).notNull().default("0"),
    ativa: boolean("ativa").notNull().default(true),
    ...colunasDeData(),
  },
  (t) => [
    unique("forma_pagamento_empresa_id_nome_key").on(t.empresaId, t.nome),
    unique("forma_pagamento_empresa_id_id_key").on(t.empresaId, t.id),
    check("forma_pagamento_taxa_percentual_check", sql`taxa_percentual >= 0 and taxa_percentual <= 100`),
    politicaDeIsolamento("forma_pagamento"),
  ],
).enableRLS();

export const categoria = pgTable(
  "categoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    nome: text("nome").notNull(),
    tipo: text("tipo").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    ...colunasDeData(),
  },
  (t) => [
    unique("categoria_empresa_id_tipo_nome_key").on(t.empresaId, t.tipo, t.nome),
    unique("categoria_empresa_id_id_key").on(t.empresaId, t.id),
    check("categoria_tipo_check", sql`tipo in ('receita', 'despesa')`),
    politicaDeIsolamento("categoria"),
  ],
).enableRLS();

export const lancamento = pgTable(
  "lancamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    tipo: text("tipo").notNull(),
    // Genérica ("Atendimento"): nunca leva nome nem telefone do tutor, para a anonimização (H12) não deixar rastro.
    descricao: text("descricao").notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    // Usado no M3 (taxa da maquininha).
    taxaCentavos: integer("taxa_centavos").notNull().default(0),
    // Dia do pagamento, no fuso da empresa.
    data: date("data", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    origem: text("origem").notNull(),
    atendimentoId: uuid("atendimento_id"),
    formaPagamentoId: uuid("forma_pagamento_id"),
    categoriaId: uuid("categoria_id").notNull(),
    motivoCancelamento: text("motivo_cancelamento"),
    ...colunasDeData(),
  },
  (t) => [
    foreignKey({
      name: "lancamento_atendimento_fk",
      columns: [t.empresaId, t.atendimentoId],
      foreignColumns: [atendimento.empresaId, atendimento.id],
    }),
    foreignKey({
      name: "lancamento_forma_pagamento_fk",
      columns: [t.empresaId, t.formaPagamentoId],
      foreignColumns: [formaPagamento.empresaId, formaPagamento.id],
    }),
    foreignKey({
      name: "lancamento_categoria_fk",
      columns: [t.empresaId, t.categoriaId],
      foreignColumns: [categoria.empresaId, categoria.id],
    }),
    unique("lancamento_empresa_id_id_key").on(t.empresaId, t.id),
    // Um atendimento gera no máximo uma receita válida: barra o toque duplo em "Concluir".
    uniqueIndex("lancamento_atendimento_id_key").on(t.atendimentoId).where(sql`status <> 'cancelado'`),
    index("lancamento_empresa_id_data_idx").on(t.empresaId, t.data),
    check("lancamento_tipo_check", sql`tipo in ('receita', 'despesa')`),
    check("lancamento_status_check", sql`status in ('pago', 'a_receber', 'cancelado')`),
    check("lancamento_origem_check", sql`origem in ('atendimento', 'pacote', 'despesa_fixa', 'manual')`),
    check("lancamento_valor_centavos_check", sql`valor_centavos > 0`),
    check("lancamento_taxa_centavos_check", sql`taxa_centavos >= 0`),
    check(
      "lancamento_cancelado_check",
      sql`status <> 'cancelado' or (motivo_cancelamento is not null and btrim(motivo_cancelamento) <> '')`,
    ),
    check("lancamento_origem_atendimento_check", sql`origem <> 'atendimento' or atendimento_id is not null`),
    check(
      "lancamento_receita_paga_check",
      sql`not (tipo = 'receita' and status = 'pago') or forma_pagamento_id is not null`,
    ),
    politicaDeIsolamento("lancamento"),
  ],
).enableRLS();
