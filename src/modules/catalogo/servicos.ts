import { asc, eq, sql } from "drizzle-orm";

import type { Transacao } from "@/db/clientes";
import { servico } from "@/modules/catalogo/schema";
import { reaisParaCentavos } from "@/modules/compartilhado/dinheiro";
import { Campos, ehUuid, falhou, type Resultado } from "@/modules/compartilhado/validacao";

// Catálogo de serviços (H2). Preço digitado em reais e guardado em centavos; duração em minutos.
// Desativar e reativar, nunca apagar: o serviço continua no histórico dos atendimentos.

export type Servico = typeof servico.$inferSelect;

/** Preço em reais, como a dona digita ("45,00"); duração em minutos inteiros. */
export type EntradaServico = { nome?: string; preco?: string; duracao?: string };

export const DURACAO_MAXIMA_MIN = 1440;

export async function listarServicos(tx: Transacao, incluirInativos = false): Promise<Servico[]> {
  return tx
    .select()
    .from(servico)
    .where(incluirInativos ? undefined : eq(servico.ativo, true))
    .orderBy(sql`${servico.ativo} desc`, asc(sql`unaccent(lower(${servico.nome}))`));
}

export async function obterServico(tx: Transacao, id: string): Promise<Servico | null> {
  if (!ehUuid(id)) return null;
  const [encontrado] = await tx.select().from(servico).where(eq(servico.id, id));
  return encontrado ?? null;
}

function validar(entrada: EntradaServico) {
  const campos = new Campos();
  const nome = campos.obrigatorio("nome", entrada.nome, "o nome do serviço", 120);
  const preco = reaisParaCentavos(entrada.preco ?? "");
  if (!preco.ok) campos.erro("preco", preco.erro);
  const duracaoMin = campos.inteiro(
    "duracao",
    entrada.duracao,
    1,
    DURACAO_MAXIMA_MIN,
    `Informe a duração em minutos, de 1 a ${DURACAO_MAXIMA_MIN}.`,
  );
  return campos.resultado({ nome, precoCentavos: preco.ok ? preco.centavos : 0, duracaoMin });
}

export async function criarServico(tx: Transacao, entrada: EntradaServico): Promise<Resultado<{ id: string }>> {
  const validado = validar(entrada);
  if (!validado.ok) return validado;
  const [criado] = await tx.insert(servico).values(validado.valor).returning({ id: servico.id });
  return { ok: true, valor: { id: criado!.id } };
}

export async function editarServico(
  tx: Transacao,
  id: string,
  entrada: EntradaServico,
): Promise<Resultado<{ id: string }>> {
  if (!ehUuid(id)) return falhou("geral", "Serviço não encontrado.");
  const validado = validar(entrada);
  if (!validado.ok) return validado;
  const [alterado] = await tx.update(servico).set(validado.valor).where(eq(servico.id, id)).returning({ id: servico.id });
  if (!alterado) return falhou("geral", "Serviço não encontrado.");
  return { ok: true, valor: alterado };
}

export async function definirServicoAtivo(tx: Transacao, id: string, ativo: boolean): Promise<Resultado<{ id: string }>> {
  if (!ehUuid(id)) return falhou("geral", "Serviço não encontrado.");
  const [alterado] = await tx.update(servico).set({ ativo }).where(eq(servico.id, id)).returning({ id: servico.id });
  if (!alterado) return falhou("geral", "Serviço não encontrado.");
  return { ok: true, valor: alterado };
}
