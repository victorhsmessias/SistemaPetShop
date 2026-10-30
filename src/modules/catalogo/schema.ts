import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { politicaDeIsolamento } from "@/db/rls";
import { colunaEmpresaId, colunasDeData } from "@/modules/empresas/schema";

// Catálogo de serviços da empresa (H2). Agenda e pacotes copiam preço e duração daqui.
export const servico = pgTable(
  "servico",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: colunaEmpresaId(),
    nome: text("nome").notNull(),
    precoCentavos: integer("preco_centavos").notNull(),
    duracaoMin: integer("duracao_min").notNull(),
    // Desativado some do agendamento, mas continua no histórico. Nada é apagado.
    ativo: boolean("ativo").notNull().default(true),
    ...colunasDeData(),
  },
  (t) => [
    // Alvo das chaves estrangeiras compostas (atendimento_item, pacote_tipo_servico).
    unique("servico_empresa_id_id_key").on(t.empresaId, t.id),
    check("servico_preco_centavos_check", sql`preco_centavos >= 0`),
    check("servico_duracao_min_check", sql`duracao_min > 0`),
    politicaDeIsolamento("servico"),
  ],
).enableRLS();
