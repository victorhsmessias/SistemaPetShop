import { and, eq, ne } from "drizzle-orm";

import type { Transacao } from "@/db/clientes";
import type { Dia } from "@/modules/agenda/fuso";
import { ehUuid } from "@/modules/compartilhado/validacao";
import { categoria, formaPagamento, lancamento } from "@/modules/financeiro/schema";

// Lançamentos (H10). Toda função recebe a transação de comEmpresaDaSessao e nunca o empresaId: o RLS limita
// à empresa da sessão. Lançamento nunca é apagado: é cancelado com motivo. A descrição é genérica e nunca
// leva nome nem telefone do tutor; a tela liga o pet pelo atendimento_id.

/** Descrição da receita de atendimento. Fixa, para a anonimização do tutor (H12) não deixar rastro. */
export const DESCRICAO_RECEITA_DE_ATENDIMENTO = "Atendimento";

/** Categoria de receita das conclusões de atendimento, criada com a empresa (ADR 0012). */
const CATEGORIA_DE_ATENDIMENTO = "Atendimentos";

/** As formas padrão aparecem nesta ordem (a mais usada primeiro); outras vêm depois, por nome. */
const ORDEM_DAS_FORMAS = ["Pix", "Dinheiro", "Débito", "Crédito"];

export type FormaDePagamento = { id: string; nome: string };

function posicao(nome: string): number {
  const i = ORDEM_DAS_FORMAS.indexOf(nome);
  return i === -1 ? ORDEM_DAS_FORMAS.length : i;
}

export async function listarFormasAtivas(tx: Transacao): Promise<FormaDePagamento[]> {
  const formas = await tx
    .select({ id: formaPagamento.id, nome: formaPagamento.nome })
    .from(formaPagamento)
    .where(eq(formaPagamento.ativa, true));
  return formas.sort((x, y) => posicao(x.nome) - posicao(y.nome) || x.nome.localeCompare(y.nome, "pt-BR"));
}

/** A forma de pagamento, se existe na empresa e está ativa. A de outra empresa some pelo RLS. */
export async function obterFormaAtiva(tx: Transacao, id: string | undefined): Promise<FormaDePagamento | null> {
  if (!ehUuid(id)) return null;
  const [forma] = await tx
    .select({ id: formaPagamento.id, nome: formaPagamento.nome })
    .from(formaPagamento)
    .where(and(eq(formaPagamento.id, id), eq(formaPagamento.ativa, true)));
  return forma ?? null;
}

/**
 * Receita paga de um atendimento concluído. Quem chama (agenda/conclusao.ts) já conferiu a forma de pagamento
 * e o valor (> 0). O índice único parcial barra uma segunda receita válida do mesmo atendimento (erro 23505).
 */
export async function criarReceitaDeAtendimento(
  tx: Transacao,
  dados: { atendimentoId: string; valorCentavos: number; formaPagamentoId: string; data: Dia },
): Promise<string> {
  const [cat] = await tx
    .select({ id: categoria.id })
    .from(categoria)
    .where(and(eq(categoria.tipo, "receita"), eq(categoria.nome, CATEGORIA_DE_ATENDIMENTO)));
  if (!cat) throw new Error(`Categoria "${CATEGORIA_DE_ATENDIMENTO}" não encontrada na empresa.`);

  const [criada] = await tx
    .insert(lancamento)
    .values({
      tipo: "receita",
      descricao: DESCRICAO_RECEITA_DE_ATENDIMENTO,
      valorCentavos: dados.valorCentavos,
      data: dados.data,
      status: "pago",
      origem: "atendimento",
      atendimentoId: dados.atendimentoId,
      formaPagamentoId: dados.formaPagamentoId,
      categoriaId: cat.id,
    })
    .returning({ id: lancamento.id });
  return criada!.id;
}

/** Cancela a receita válida do atendimento, com o motivo. Devolve quantas foram canceladas (0 ou 1). */
export async function cancelarReceitaDoAtendimento(tx: Transacao, atendimentoId: string, motivo: string): Promise<number> {
  const canceladas = await tx
    .update(lancamento)
    .set({ status: "cancelado", motivoCancelamento: motivo })
    .where(and(eq(lancamento.atendimentoId, atendimentoId), ne(lancamento.status, "cancelado")))
    .returning({ id: lancamento.id });
  return canceladas.length;
}

export type ReceitaDoAtendimento = { id: string; valorCentavos: number; data: Dia; forma: string | null };

/** A receita válida (não cancelada) do atendimento, para a página do atendimento. */
export async function receitaDoAtendimento(tx: Transacao, atendimentoId: string): Promise<ReceitaDoAtendimento | null> {
  if (!ehUuid(atendimentoId)) return null;
  const [receita] = await tx
    .select({
      id: lancamento.id,
      valorCentavos: lancamento.valorCentavos,
      data: lancamento.data,
      forma: formaPagamento.nome,
    })
    .from(lancamento)
    .leftJoin(formaPagamento, eq(formaPagamento.id, lancamento.formaPagamentoId))
    .where(and(eq(lancamento.atendimentoId, atendimentoId), ne(lancamento.status, "cancelado")));
  return receita ?? null;
}
