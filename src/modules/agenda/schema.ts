import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { politicaDeIsolamento } from "@/db/rls";
import { pet } from "@/modules/cadastros/schema";
import { servico } from "@/modules/catalogo/schema";
import { colunaEmpresaId, colunasDeData } from "@/modules/empresas/schema";

// Agenda (H5 a H7). Atendimento é cancelado, nunca apagado; atendimento_item é a única tabela de negócio
// em que o app apaga. As duas são auditadas por trigger (drizzle/0010_permissoes_agenda.sql).

export const atendimento = pgTable(
  "atendimento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    petId: uuid("pet_id").notNull(),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    // Início mais a soma das durações dos itens; pode ser ajustado à mão.
    fim: timestamp("fim", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("agendado"),
    observacoes: text("observacoes"),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
    // Usado no M3 (lembrete ao tutor).
    lembreteEnviadoEm: timestamp("lembrete_enviado_em", { withTimezone: true }),
    ...colunasDeData(),
  },
  (t) => [
    foreignKey({
      name: "atendimento_pet_fk",
      columns: [t.empresaId, t.petId],
      foreignColumns: [pet.empresaId, pet.id],
    }),
    unique("atendimento_empresa_id_id_key").on(t.empresaId, t.id),
    index("atendimento_empresa_id_inicio_idx").on(t.empresaId, t.inicio),
    index("atendimento_empresa_id_pet_id_idx").on(t.empresaId, t.petId),
    check(
      "atendimento_status_check",
      sql`status in ('agendado', 'confirmado', 'em_atendimento', 'pronto', 'concluido', 'cancelado', 'faltou')`,
    ),
    check("atendimento_fim_check", sql`fim > inicio`),
    check("atendimento_concluido_em_check", sql`status <> 'concluido' or concluido_em is not null`),
    // Desfazer a confirmação limpa confirmado_em; o status anterior é deduzido dele (modelo de dados).
    check("atendimento_confirmado_em_check", sql`status <> 'confirmado' or confirmado_em is not null`),
    check("atendimento_agendado_check", sql`status <> 'agendado' or confirmado_em is null`),
    politicaDeIsolamento("atendimento"),
  ],
).enableRLS();

export const atendimentoItem = pgTable(
  "atendimento_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    atendimentoId: uuid("atendimento_id").notNull(),
    servicoId: uuid("servico_id").notNull(),
    // Copiados do catálogo no agendamento: mudar o catálogo não altera o passado.
    descricao: text("descricao").notNull(),
    precoCentavos: integer("preco_centavos").notNull(),
    duracaoMin: integer("duracao_min").notNull(),
    ...colunasDeData(),
  },
  (t) => [
    foreignKey({
      name: "atendimento_item_atendimento_fk",
      columns: [t.empresaId, t.atendimentoId],
      foreignColumns: [atendimento.empresaId, atendimento.id],
    }),
    foreignKey({
      name: "atendimento_item_servico_fk",
      columns: [t.empresaId, t.servicoId],
      foreignColumns: [servico.empresaId, servico.id],
    }),
    // Cada serviço uma vez por atendimento: um toque duplo não duplica o item.
    unique("atendimento_item_servico_key").on(t.empresaId, t.atendimentoId, t.servicoId),
    unique("atendimento_item_empresa_id_id_key").on(t.empresaId, t.id),
    check("atendimento_item_preco_centavos_check", sql`preco_centavos >= 0`),
    check("atendimento_item_duracao_min_check", sql`duracao_min > 0`),
    politicaDeIsolamento("atendimento_item"),
  ],
).enableRLS();
