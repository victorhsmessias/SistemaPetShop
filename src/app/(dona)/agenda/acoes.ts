"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { urlDoDia } from "@/app/(dona)/agenda/retorno";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import {
  agendar,
  editarHorario,
  editarItens,
  editarObservacoes,
  mudarStatus,
  type Conflito,
  type EntradaItem,
  type ResultadoComAviso,
} from "@/modules/agenda/atendimentos";
import { concluir, desfazerConclusao } from "@/modules/agenda/conclusao";
import type { Erros } from "@/modules/compartilhado/validacao";

// Server Actions da agenda. Cada uma começa por naEmpresaDaDona, que confere a sessão e usa o empresaId
// dela. Ids de atendimento, pet e serviço vêm do formulário, mas o RLS só deixa ver e alterar os da
// empresa da sessão: id de outra empresa volta como "não encontrado".

export type EstadoAgenda = {
  erros: Erros;
  /** O que foi digitado, para o formulário não perder os dados quando volta com erro ou aviso. */
  valores: Record<string, string>;
  /** Serviços marcados; preço e duração de cada um ficam em valores (preco_<id>, duracao_<id>). */
  servicos: string[];
  conflitos?: Conflito[];
  horarioAvisado?: string;
  /** Recusa por estado (ver avisoDaRecusa): a página mostra acima das seções. */
  aviso?: string;
};

/** `erro`: de campo (forma de pagamento), no formulário. `aviso`: recusa por estado (ver avisoDaRecusa). */
export type EstadoStatus = { erro?: string; aviso?: string };

/** Desfazer a conclusão: o motivo digitado volta com o erro, para não se perder. */
export type EstadoDesfazer = { erros: Erros; motivo: string; aviso?: string };

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? "");

function lerItens(dados: FormData): { servicos: string[]; itens: EntradaItem[]; valores: Record<string, string> } {
  const servicos = dados.getAll("servico").map(String);
  const valores: Record<string, string> = {};
  const itens = servicos.map((servicoId) => {
    const preco = texto(dados, `preco_${servicoId}`);
    const duracao = texto(dados, `duracao_${servicoId}`);
    valores[`preco_${servicoId}`] = preco;
    valores[`duracao_${servicoId}`] = duracao;
    return { servicoId, preco, duracao };
  });
  return { servicos, itens, valores };
}

/** Estado devolvido quando a operação recusa ou avisa de horário ocupado. */
function estadoDe(
  resultado: Exclude<ResultadoComAviso<unknown>, { ok: true }>,
  valores: Record<string, string>,
  servicos: string[],
): EstadoAgenda {
  return {
    erros: resultado.erros,
    valores,
    servicos,
    ...("conflitos" in resultado ? { conflitos: resultado.conflitos, horarioAvisado: resultado.horarioAvisado } : {}),
  };
}

function revalidarAgenda() {
  revalidatePath("/agenda", "layout");
}

/**
 * Recusa por estado (erro `geral`: o status ou o total mudou, o atendimento foi encerrado ou já tinha a conclusão
 * desfeita, toque duplo): nada foi gravado, mas a tela mostrava um estado velho. `refresh()` re-renderiza a página
 * na mesma resposta da ação, com o estado atual, sem invalidar cache: a dona não precisa recarregar (o app instalado
 * no iPhone não tem esse botão). O texto volta em `aviso`, que a página mostra acima das seções
 * (aviso-da-pagina.tsx), porque o refresh pode trocar a seção do formulário. Erros de campo não atualizam a tela.
 */
function avisoDaRecusa(erros: Erros): { erros: Erros; aviso?: string } {
  const { geral, ...deCampo } = erros;
  if (!geral) return { erros };
  refresh();
  return { erros: deCampo, aviso: geral };
}

/** Concluir e desfazer mudam a receita: o Financeiro também é revalidado. */
function revalidarAgendaEFinanceiro() {
  revalidarAgenda();
  revalidatePath("/financeiro");
}

export async function agendarAcao(_anterior: EstadoAgenda, dados: FormData): Promise<EstadoAgenda> {
  const { servicos, itens, valores: valoresItens } = lerItens(dados);
  const entrada = {
    petId: texto(dados, "petId"),
    dia: texto(dados, "dia"),
    hora: texto(dados, "hora"),
    observacoes: texto(dados, "observacoes"),
  };
  const horarioAvisado = texto(dados, "horarioAvisado") || undefined;
  const resultado = await naEmpresaDaDona((tx) => agendar(tx, { ...entrada, itens }, horarioAvisado));
  if (!resultado.ok) return estadoDe(resultado, { ...entrada, ...valoresItens }, servicos);
  revalidarAgenda();
  redirect(urlDoDia(resultado.valor.dia));
}

/** Avança ou desfaz o status. O botão envia `para`; `de` é o status que a tela mostrava. */
export async function mudarStatusAcao(_anterior: EstadoStatus, dados: FormData): Promise<EstadoStatus> {
  const resultado = await naEmpresaDaDona((tx) =>
    mudarStatus(tx, texto(dados, "id"), texto(dados, "de"), texto(dados, "para")),
  );
  // mudarStatus só recusa com erro geral: tudo vira aviso.
  if (!resultado.ok) return { aviso: avisoDaRecusa(resultado.erros).aviso };
  revalidarAgenda();
  return {};
}

export async function editarServicosAcao(_anterior: EstadoAgenda, dados: FormData): Promise<EstadoAgenda> {
  const id = texto(dados, "id");
  const { servicos, itens, valores } = lerItens(dados);
  const horarioAvisado = texto(dados, "horarioAvisado") || undefined;
  const resultado = await naEmpresaDaDona((tx) => editarItens(tx, id, itens, horarioAvisado));
  if (!resultado.ok) return { ...estadoDe(resultado, valores, servicos), ...avisoDaRecusa(resultado.erros) };
  revalidarAgenda();
  redirect(`/agenda/${resultado.valor.id}`);
}

export async function editarHorarioAcao(_anterior: EstadoAgenda, dados: FormData): Promise<EstadoAgenda> {
  const id = texto(dados, "id");
  const entrada = { dia: texto(dados, "dia"), hora: texto(dados, "hora"), termino: texto(dados, "termino") };
  const horarioAvisado = texto(dados, "horarioAvisado") || undefined;
  const resultado = await naEmpresaDaDona((tx) => editarHorario(tx, id, entrada, horarioAvisado));
  if (!resultado.ok) return { ...estadoDe(resultado, entrada, []), ...avisoDaRecusa(resultado.erros) };
  revalidarAgenda();
  redirect(`/agenda/${resultado.valor.id}`);
}

export async function editarObservacoesAcao(_anterior: EstadoAgenda, dados: FormData): Promise<EstadoAgenda> {
  const id = texto(dados, "id");
  const observacoes = texto(dados, "observacoes");
  const resultado = await naEmpresaDaDona((tx) => editarObservacoes(tx, id, observacoes));
  if (!resultado.ok) return { erros: resultado.erros, valores: { observacoes }, servicos: [] };
  revalidarAgenda();
  redirect(`/agenda/${resultado.valor.id}`);
}

/**
 * Conclui o atendimento com a forma de pagamento do botão tocado (um toque por opção). `de` e `total` são o
 * status e o total que a tela mostrava: se mudaram, nada é gravado. Toque duplo: "já foi concluído".
 */
export async function concluirAcao(_anterior: EstadoStatus, dados: FormData): Promise<EstadoStatus> {
  const total = texto(dados, "total");
  const resultado = await naEmpresaDaDona((tx) =>
    concluir(tx, texto(dados, "id"), {
      de: texto(dados, "de"),
      formaPagamentoId: texto(dados, "formaPagamentoId") || undefined,
      // Sem o total (formulário adulterado), a conferência não roda; a soma vem sempre do banco.
      totalVisto: /^\d+$/.test(total) ? Number(total) : undefined,
    }),
  );
  if (!resultado.ok) {
    const { erros, aviso } = avisoDaRecusa(resultado.erros);
    return aviso ? { aviso } : { erro: erros.formaPagamento };
  }
  revalidarAgendaEFinanceiro();
  return {};
}

/** Desfaz a conclusão: volta ao status anterior e cancela a receita com o motivo. */
export async function desfazerConclusaoAcao(_anterior: EstadoDesfazer, dados: FormData): Promise<EstadoDesfazer> {
  const motivo = texto(dados, "motivo");
  const resultado = await naEmpresaDaDona((tx) => desfazerConclusao(tx, texto(dados, "id"), motivo));
  if (!resultado.ok) return { ...avisoDaRecusa(resultado.erros), motivo };
  revalidarAgendaEFinanceiro();
  return { erros: {}, motivo: "" };
}
