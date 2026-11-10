import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { Transacao } from "@/db/clientes";
import { codigoPgDe } from "@/db/erros";
import { MENSAGEM_MUDOU, MENSAGEM_NAO_ENCONTRADO } from "@/modules/agenda/atendimentos";
import { somarItens } from "@/modules/agenda/calculos";
import { hojeNoFuso } from "@/modules/agenda/fuso";
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import { atendimentoAtivo, ehStatus, NOMES_DOS_STATUS, type StatusAtendimento } from "@/modules/agenda/status";
import { auditoria } from "@/modules/auditoria/schema";
import { formatarReais } from "@/modules/compartilhado/dinheiro";
import { ehUuid, falhou, type Resultado } from "@/modules/compartilhado/validacao";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";
import {
  cancelarReceitaDoAtendimento,
  criarReceitaDeAtendimento,
  obterFormaAtiva,
  receitaDoAtendimento,
} from "@/modules/financeiro/lancamentos";

// Concluir atendimento: a transação mais importante do M1 (modelo de dados). Concluir e desfazer a conclusão
// só passam por aqui, porque mexem no status e na receita juntos. Tudo roda na transação de
// comEmpresaDaSessao; a gravação fica num savepoint, para um toque duplo virar mensagem, e não erro 500.
// As triggers registram o atendimento e o lançamento na auditoria, com a dona como autora.

export const MENSAGEM_JA_CONCLUIDO = "Este atendimento já foi concluído.";
export const MENSAGEM_NAO_CONCLUIDO = "Este atendimento não está concluído (talvez a conclusão já tenha sido desfeita).";
const MAXIMO_MOTIVO = 500;

export type EntradaConclusao = {
  /** Status que a tela mostrava: se mudou nesse meio-tempo, nada é gravado. */
  de?: string;
  formaPagamentoId?: string;
  /** Total que a tela mostrava, em centavos: se os serviços mudaram em outra tela, nada é gravado. */
  totalVisto?: number;
};

export type Conclusao = { id: string; totalCentavos: number; receitaId: string | null };

/** Lançado no savepoint quando o UPDATE não atinge a linha: o status mudou desde a leitura. */
class StatusMudouError extends Error {}

async function lerAtual(tx: Transacao, id: string) {
  const [linha] = await tx
    .select({ id: atendimento.id, status: atendimento.status, confirmadoEm: atendimento.confirmadoEm })
    .from(atendimento)
    .where(eq(atendimento.id, id));
  return linha ? { ...linha, status: linha.status as StatusAtendimento } : null;
}

/**
 * Conclui o atendimento (H7): confere que o status é ativo e é o que a tela mostrava, grava `concluido` e
 * `concluido_em` e cria a receita paga com a soma dos itens, a forma de pagamento escolhida (ativa e da
 * empresa), a categoria "Atendimentos" e o dia de hoje no fuso da empresa. Total zero conclui sem receita
 * (o banco exige valor > 0) e não pede forma de pagamento.
 *
 * Toque duplo: o UPDATE condicionado ao status trava a linha; o segundo espera, não atinge nada e recebe
 * "já foi concluído". O índice único parcial da receita é a segunda barreira (erro 23505, mesma mensagem).
 */
export async function concluir(
  tx: Transacao,
  id: string,
  entrada: EntradaConclusao,
  agora: Date = new Date(),
): Promise<Resultado<Conclusao>> {
  if (!ehUuid(id)) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  const atual = await lerAtual(tx, id);
  if (!atual) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  if (atual.status === "concluido") return falhou("geral", MENSAGEM_JA_CONCLUIDO);
  if (!atendimentoAtivo(atual.status)) {
    return falhou(
      "geral",
      `Este atendimento está "${NOMES_DOS_STATUS[atual.status]}" e não pode ser concluído. Reabra-o antes, se foi engano.`,
    );
  }
  if (!ehStatus(entrada.de) || entrada.de !== atual.status) return falhou("geral", MENSAGEM_MUDOU);

  const itens = await tx
    .select({ precoCentavos: atendimentoItem.precoCentavos })
    .from(atendimentoItem)
    .where(eq(atendimentoItem.atendimentoId, atual.id));
  const totalCentavos = somarItens(itens);
  if (entrada.totalVisto !== undefined && entrada.totalVisto !== totalCentavos) {
    return falhou("geral", `O total mudou para ${formatarReais(totalCentavos)}. Confira os serviços e conclua de novo.`);
  }

  const forma = totalCentavos > 0 ? await obterFormaAtiva(tx, entrada.formaPagamentoId) : null;
  if (totalCentavos > 0 && !forma) return falhou("formaPagamento", "Escolha uma forma de pagamento.");

  const data = hojeNoFuso(await fusoDaEmpresa(tx), agora);
  try {
    return await tx.transaction(async (sp) => {
      const [alterado] = await sp
        .update(atendimento)
        .set({ status: "concluido", concluidoEm: agora })
        .where(and(eq(atendimento.id, atual.id), eq(atendimento.status, atual.status)))
        .returning({ id: atendimento.id });
      if (!alterado) throw new StatusMudouError();
      const receitaId = forma
        ? await criarReceitaDeAtendimento(sp, {
            atendimentoId: atual.id,
            valorCentavos: totalCentavos,
            formaPagamentoId: forma.id,
            data,
          })
        : null;
      return { ok: true as const, valor: { id: atual.id, totalCentavos, receitaId } };
    });
  } catch (erro) {
    if (codigoPgDe(erro) === "23505") return falhou("geral", MENSAGEM_JA_CONCLUIDO);
    if (!(erro instanceof StatusMudouError)) throw erro;
    // O savepoint foi desfeito; a transação continua usável. Relê para dar a mensagem certa.
    const agoraNoBanco = await lerAtual(tx, atual.id);
    return falhou("geral", agoraNoBanco?.status === "concluido" ? MENSAGEM_JA_CONCLUIDO : MENSAGEM_MUDOU);
  }
}

/**
 * Status que o atendimento tinha antes de concluir: o `antes` do último evento da auditoria em que ele
 * passou a `concluido`. Sem evento (não deveria acontecer: a trigger grava sempre), deduz por confirmado_em.
 */
async function statusAntesDaConclusao(
  tx: Transacao,
  id: string,
  confirmadoEm: Date | null,
): Promise<StatusAtendimento> {
  const [evento] = await tx
    .select({ antes: auditoria.antes })
    .from(auditoria)
    .where(
      and(
        eq(auditoria.tabela, "atendimento"),
        eq(auditoria.registroId, id),
        eq(auditoria.acao, "alterou"),
        sql`${auditoria.depois} ->> 'status' = 'concluido'`,
        sql`${auditoria.antes} ->> 'status' <> 'concluido'`,
      ),
    )
    .orderBy(desc(auditoria.id))
    .limit(1);
  const anterior = (evento?.antes as { status?: unknown } | null)?.status;
  if (ehStatus(anterior) && atendimentoAtivo(anterior)) return anterior;
  return confirmadoEm ? "confirmado" : "agendado";
}

/**
 * Desfaz a conclusão, numa única transação: volta ao status de antes de concluir (lido da auditoria), limpa
 * concluido_em e cancela a receita com o motivo, obrigatório quando há receita. Concluir de novo cria uma
 * receita nova. Um segundo toque não encontra mais o atendimento concluído e recebe a mensagem.
 */
export async function desfazerConclusao(
  tx: Transacao,
  id: string,
  motivo: string | undefined,
): Promise<Resultado<{ id: string; status: StatusAtendimento }>> {
  if (!ehUuid(id)) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  const atual = await lerAtual(tx, id);
  if (!atual) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  if (atual.status !== "concluido") return falhou("geral", MENSAGEM_NAO_CONCLUIDO);

  const receita = await receitaDoAtendimento(tx, atual.id);
  const texto = (motivo ?? "").trim();
  if (receita && !texto) return falhou("motivo", "Informe o motivo: ele fica no cancelamento da receita.");
  if (texto.length > MAXIMO_MOTIVO) return falhou("motivo", `Use no máximo ${MAXIMO_MOTIVO} caracteres.`);

  const anterior = await statusAntesDaConclusao(tx, atual.id, atual.confirmadoEm);
  try {
    return await tx.transaction(async (sp) => {
      const [alterado] = await sp
        .update(atendimento)
        .set({ status: anterior, concluidoEm: null })
        .where(and(eq(atendimento.id, atual.id), eq(atendimento.status, "concluido")))
        .returning({ id: atendimento.id });
      if (!alterado) throw new StatusMudouError();
      if (receita) await cancelarReceitaDoAtendimento(sp, atual.id, texto);
      return { ok: true as const, valor: { id: atual.id, status: anterior } };
    });
  } catch (erro) {
    if (erro instanceof StatusMudouError) return falhou("geral", MENSAGEM_NAO_CONCLUIDO);
    throw erro;
  }
}

/** Quantos atendimentos foram concluídos no intervalo [de, ate) (instantes; use inicioDoDia no fuso). */
export async function contarConcluidos(tx: Transacao, de: Date, ate: Date): Promise<number> {
  const [linha] = await tx
    .select({ quantidade: sql<number>`count(*)::int` })
    .from(atendimento)
    .where(and(eq(atendimento.status, "concluido"), gte(atendimento.concluidoEm, de), lt(atendimento.concluidoEm, ate)));
  return linha?.quantidade ?? 0;
}
