import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { Transacao } from "@/db/clientes";
import { atendimento } from "@/modules/agenda/schema";
import type { Dia } from "@/modules/agenda/fuso";
import { pet } from "@/modules/cadastros/schema";
import { formaPagamento, lancamento } from "@/modules/financeiro/schema";

// Resumo do financeiro (H10) no período [de, ate), em dias do fuso da empresa (lancamento.data já é o dia
// local). Cancelados ficam fora da soma e aparecem à parte, com o motivo. Pacotes, despesas e "a receber"
// entram no M2 e no M3.

export type Recebido = { totalCentavos: number; quantidade: number };

/** Quanto entrou no período: receitas pagas, sem as canceladas. */
export async function recebidoNoPeriodo(tx: Transacao, de: Dia, ate: Dia): Promise<Recebido> {
  const [linha] = await tx
    .select({
      totalCentavos: sql<number>`coalesce(sum(${lancamento.valorCentavos}), 0)::int`,
      quantidade: sql<number>`count(*)::int`,
    })
    .from(lancamento)
    .where(
      and(
        eq(lancamento.tipo, "receita"),
        eq(lancamento.status, "pago"),
        gte(lancamento.data, de),
        lt(lancamento.data, ate),
      ),
    );
  return linha ?? { totalCentavos: 0, quantidade: 0 };
}

export type ReceitaDaLista = {
  id: string;
  data: Dia;
  valorCentavos: number;
  descricao: string;
  forma: string | null;
  motivoCancelamento: string | null;
  /** O pet vem do atendimento, nunca da descrição do lançamento. */
  atendimentoId: string | null;
  petNome: string | null;
};

/** Receitas do período, das mais recentes para as mais antigas, com as canceladas à parte. */
export async function listarReceitasDoPeriodo(
  tx: Transacao,
  de: Dia,
  ate: Dia,
): Promise<{ validas: ReceitaDaLista[]; canceladas: ReceitaDaLista[] }> {
  const linhas = await tx
    .select({
      id: lancamento.id,
      data: lancamento.data,
      valorCentavos: lancamento.valorCentavos,
      descricao: lancamento.descricao,
      status: lancamento.status,
      forma: formaPagamento.nome,
      motivoCancelamento: lancamento.motivoCancelamento,
      atendimentoId: lancamento.atendimentoId,
      petNome: pet.nome,
    })
    .from(lancamento)
    .leftJoin(formaPagamento, eq(formaPagamento.id, lancamento.formaPagamentoId))
    .leftJoin(atendimento, eq(atendimento.id, lancamento.atendimentoId))
    .leftJoin(pet, eq(pet.id, atendimento.petId))
    .where(and(eq(lancamento.tipo, "receita"), gte(lancamento.data, de), lt(lancamento.data, ate)))
    .orderBy(desc(lancamento.data), desc(lancamento.criadoEm), asc(lancamento.id));

  const validas: ReceitaDaLista[] = [];
  const canceladas: ReceitaDaLista[] = [];
  for (const { status, ...receita } of linhas) (status === "cancelado" ? canceladas : validas).push(receita);
  return { validas, canceladas };
}
