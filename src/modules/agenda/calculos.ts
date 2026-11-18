import type { StatusAtendimento } from "@/modules/agenda/status";

// Contas da agenda, sem banco: fim do atendimento, total, sobreposição e a distribuição dos blocos em colunas.

const MINUTO = 60_000;

/** Total do atendimento em centavos: a soma dos preços dos itens. É o valor da receita ao concluir. */
export function somarItens(itens: readonly { precoCentavos: number }[]): number {
  return itens.reduce((soma, item) => soma + item.precoCentavos, 0);
}

/** Fim = início + soma das durações dos itens (H5). */
export function calcularFim(inicio: Date, duracoesMin: number[]): Date {
  const total = duracoesMin.reduce((soma, d) => soma + d, 0);
  return new Date(inicio.getTime() + total * MINUTO);
}

/** Cancelados e faltas não ocupam horário (modelo de dados, "Horário ocupado"). */
export function ocupaHorario(status: StatusAtendimento): boolean {
  return status !== "cancelado" && status !== "faltou";
}

type Intervalo = { inicio: Date; fim: Date };

/** Intervalos meio abertos: um atendimento que termina às 10h não se sobrepõe a um que começa às 10h. */
export function seSobrepoem(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

/** Atendimentos que ocupam algum minuto do intervalo, sem contar o próprio (na edição) nem cancelados e faltas. */
export function conflitos<T extends Intervalo & { id: string; status: StatusAtendimento }>(
  intervalo: Intervalo,
  existentes: T[],
  ignorarId?: string,
): T[] {
  return existentes.filter((e) => e.id !== ignorarId && ocupaHorario(e.status) && seSobrepoem(intervalo, e));
}

/** Bloco na grade, em minutos desde o início da grade. */
export type BlocoNaGrade = { id: string; inicioMin: number; fimMin: number };

/** `grupo`: índice do grupo de blocos que se tocam (0, 1, 2… na ordem do dia); os do mesmo grupo dividem a largura. */
export type BlocoPosicionado = { id: string; coluna: number; colunas: number; grupo: number };

/** Altura mínima do bloco, em minutos de grade: 22 min × 2 px = 44 px, o alvo de toque mínimo. */
export const DURACAO_VISUAL_MINIMA_MIN = 22;

/**
 * Distribui os blocos em colunas lado a lado, sem esconder nenhum. Blocos que se tocam (direta ou
 * indiretamente) formam um grupo e dividem a largura pelo número de colunas do grupo. Usa o fim visual
 * (no mínimo 22 min), para um bloco curto, desenhado com 44 px, não cobrir o seguinte.
 */
export function distribuirEmColunas(blocos: BlocoNaGrade[]): BlocoPosicionado[] {
  const ordenados = [...blocos]
    .map((b) => ({ ...b, fimVisual: Math.max(b.fimMin, b.inicioMin + DURACAO_VISUAL_MINIMA_MIN) }))
    .sort((a, b) => a.inicioMin - b.inicioMin || b.fimVisual - a.fimVisual);

  const resultado: BlocoPosicionado[] = [];
  let grupo: { id: string; coluna: number }[] = [];
  let indiceDoGrupo = -1;
  let fimDoGrupo = -Infinity;
  let fimDasColunas: number[] = [];

  const fecharGrupo = () => {
    if (grupo.length > 0) indiceDoGrupo++;
    for (const b of grupo) resultado.push({ ...b, colunas: fimDasColunas.length, grupo: indiceDoGrupo });
    grupo = [];
    fimDasColunas = [];
  };

  for (const bloco of ordenados) {
    if (bloco.inicioMin >= fimDoGrupo) fecharGrupo();
    let coluna = fimDasColunas.findIndex((fim) => fim <= bloco.inicioMin);
    if (coluna === -1) coluna = fimDasColunas.push(bloco.fimVisual) - 1;
    else fimDasColunas[coluna] = bloco.fimVisual;
    grupo.push({ id: bloco.id, coluna });
    fimDoGrupo = Math.max(fimDoGrupo, bloco.fimVisual);
  }
  fecharGrupo();
  return resultado;
}
