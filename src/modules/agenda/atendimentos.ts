import { and, asc, desc, eq, gt, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";

import type { Transacao } from "@/db/clientes";
import { codigoPgDe } from "@/db/erros";
import { calcularFim, conflitos } from "@/modules/agenda/calculos";
import {
  ANO_MAXIMO,
  ANO_MINIMO,
  ehDia,
  ehDiaForaDosAnosAceitos,
  ehHora,
  inicioDoDia,
  instanteNoFuso,
  noFuso,
  somarDias,
  type Dia,
} from "@/modules/agenda/fuso";
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import { atendimentoAtivo, avaliarMudanca, ehStatus, NOMES_DOS_STATUS, type StatusAtendimento } from "@/modules/agenda/status";
import { pet, tutor } from "@/modules/cadastros/schema";
import { servico } from "@/modules/catalogo/schema";
import { DURACAO_MAXIMA_MIN } from "@/modules/catalogo/servicos";
import { reaisParaCentavos } from "@/modules/compartilhado/dinheiro";
import { Campos, ehUuid, escaparLike, falhou, type Erros, type Resultado } from "@/modules/compartilhado/validacao";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";

// Agenda (H5 a H7). Toda função recebe a transação de comEmpresaDaSessao e nunca o empresaId: o RLS
// limita à empresa da sessão, e um id de outra empresa volta como "não encontrado".
// Datas e horas entram e saem no fuso da empresa (empresa.fuso_horario), nunca no do servidor.

export type ItemDoAtendimento = {
  id: string;
  servicoId: string;
  descricao: string;
  precoCentavos: number;
  duracaoMin: number;
};

export type AtendimentoDaAgenda = {
  id: string;
  inicio: Date;
  fim: Date;
  status: StatusAtendimento;
  observacoes: string | null;
  confirmadoEm: Date | null;
  pet: { id: string; nome: string; observacoes: string | null; ativo: boolean };
  tutor: { id: string; nome: string; telefone: string | null };
  itens: ItemDoAtendimento[];
};

/** Serviço escolhido no formulário: preço em reais, como a dona digita, e duração em minutos. */
export type EntradaItem = { servicoId: string; preco?: string; duracao?: string };

export type EntradaAgendamento = {
  petId?: string;
  dia?: string;
  hora?: string;
  observacoes?: string;
  itens: EntradaItem[];
};

export type EntradaHorario = { dia?: string; hora?: string; termino?: string };

/** Atendimento que ocupa o mesmo horário, já formatado no fuso da empresa para o aviso. */
export type Conflito = { id: string; petNome: string; tutorNome: string; horario: string };

/**
 * Horário ocupado gera aviso, não bloqueio: a operação devolve os conflitos e a chave do horário avisado.
 * Se a dona confirmar, o formulário reenvia a chave e a mesma operação grava. Mudou o horário, novo aviso.
 */
export type AvisoDeHorario = { ok: false; erros: Erros; conflitos: Conflito[]; horarioAvisado: string };

export type ResultadoComAviso<T> = Resultado<T> | AvisoDeHorario;

const MAXIMO_OBSERVACOES = 2000;
const LIMITE_DA_BUSCA = 50;
export const MENSAGEM_NAO_ENCONTRADO = "Atendimento não encontrado.";
export const MENSAGEM_MUDOU =
  "Este atendimento acabou de ser alterado (talvez num toque repetido ou em outra tela). Confira e tente de novo.";

function chaveDoHorario(inicio: Date, fim: Date): string {
  return `${inicio.toISOString()}/${fim.toISOString()}`;
}

function textoDoHorario(inicio: Date, fim: Date, fuso: string): string {
  return `${noFuso(inicio, fuso).hora}–${noFuso(fim, fuso).hora}`;
}

// ---------------------------------------------------------------------------------------------------------
// Leitura

const colunasDaAgenda = {
  id: atendimento.id,
  inicio: atendimento.inicio,
  fim: atendimento.fim,
  status: atendimento.status,
  observacoes: atendimento.observacoes,
  confirmadoEm: atendimento.confirmadoEm,
  pet: { id: pet.id, nome: pet.nome, observacoes: pet.observacoes, ativo: pet.ativo },
  tutor: { id: tutor.id, nome: tutor.nome, telefone: tutor.telefone },
};

async function comItens(
  tx: Transacao,
  linhas: Omit<AtendimentoDaAgenda, "itens">[],
): Promise<AtendimentoDaAgenda[]> {
  if (linhas.length === 0) return [];
  const itens = await tx
    .select()
    .from(atendimentoItem)
    .where(
      inArray(
        atendimentoItem.atendimentoId,
        linhas.map((l) => l.id),
      ),
    )
    .orderBy(asc(atendimentoItem.criadoEm), asc(atendimentoItem.descricao));
  return linhas.map((l) => ({
    ...l,
    status: l.status as StatusAtendimento,
    itens: itens
      .filter((i) => i.atendimentoId === l.id)
      .map(({ id, servicoId, descricao, precoCentavos, duracaoMin }) => ({
        id,
        servicoId,
        descricao,
        precoCentavos,
        duracaoMin,
      })),
  }));
}

/** Atendimentos que tocam algum minuto do intervalo [de, ate), com pet, tutor e itens. */
async function listarIntervalo(tx: Transacao, de: Date, ate: Date): Promise<AtendimentoDaAgenda[]> {
  const linhas = await tx
    .select(colunasDaAgenda)
    .from(atendimento)
    .innerJoin(pet, eq(pet.id, atendimento.petId))
    .innerJoin(tutor, eq(tutor.id, pet.tutorId))
    .where(and(lt(atendimento.inicio, ate), gt(atendimento.fim, de)))
    .orderBy(asc(atendimento.inicio), asc(atendimento.fim));
  return comItens(
    tx,
    linhas.map((l) => ({ ...l, status: l.status as StatusAtendimento })),
  );
}

/** Agenda de `dias` dias a partir de `primeiroDia`, no fuso da empresa. Devolve também o fuso, para exibir. */
export async function listarAgenda(
  tx: Transacao,
  primeiroDia: Dia,
  dias = 1,
): Promise<{ fuso: string; atendimentos: AtendimentoDaAgenda[] }> {
  const fuso = await fusoDaEmpresa(tx);
  const de = inicioDoDia(primeiroDia, fuso);
  const ate = inicioDoDia(somarDias(primeiroDia, dias), fuso);
  return { fuso, atendimentos: await listarIntervalo(tx, de, ate) };
}

export async function obterAtendimento(tx: Transacao, id: string): Promise<AtendimentoDaAgenda | null> {
  if (!ehUuid(id)) return null;
  const linhas = await tx
    .select(colunasDaAgenda)
    .from(atendimento)
    .innerJoin(pet, eq(pet.id, atendimento.petId))
    .innerJoin(tutor, eq(tutor.id, pet.tutorId))
    .where(eq(atendimento.id, id));
  const [encontrado] = await comItens(
    tx,
    linhas.map((l) => ({ ...l, status: l.status as StatusAtendimento })),
  );
  return encontrado ?? null;
}

export type PetParaAgendar = {
  id: string;
  nome: string;
  especie: string;
  porte: string;
  observacoes: string | null;
  tutorNome: string;
};

const colunasDoPet = {
  id: pet.id,
  nome: pet.nome,
  especie: pet.especie,
  porte: pet.porte,
  observacoes: pet.observacoes,
  tutorNome: tutor.nome,
};

/**
 * Pets ativos para um novo agendamento, pelo nome do pet ou do tutor, sem diferenciar maiúsculas nem
 * acentos. Sem busca, lista em ordem alfabética. Tutores anonimizados ficam de fora.
 */
export async function buscarPetsParaAgendar(tx: Transacao, busca = ""): Promise<PetParaAgendar[]> {
  const termo = busca.trim();
  const padrao = `%${escaparLike(termo)}%`;
  const porNome = termo
    ? sql`(unaccent(lower(${pet.nome})) like unaccent(lower(${padrao}))
          or unaccent(lower(${tutor.nome})) like unaccent(lower(${padrao})))`
    : undefined;
  return tx
    .select(colunasDoPet)
    .from(pet)
    .innerJoin(tutor, eq(tutor.id, pet.tutorId))
    .where(and(eq(pet.ativo, true), isNull(tutor.anonimizadoEm), porNome))
    .orderBy(sql`unaccent(lower(${pet.nome}))`, sql`unaccent(lower(${tutor.nome}))`)
    .limit(LIMITE_DA_BUSCA);
}

/** O pet escolhido para agendar, se existe e está ativo. */
export async function obterPetParaAgendar(tx: Transacao, petId: string): Promise<PetParaAgendar | null> {
  if (!ehUuid(petId)) return null;
  const [encontrado] = await tx
    .select(colunasDoPet)
    .from(pet)
    .innerJoin(tutor, eq(tutor.id, pet.tutorId))
    .where(and(eq(pet.id, petId), eq(pet.ativo, true), isNull(tutor.anonimizadoEm)));
  return encontrado ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// Validação

type ItemValidado = { servicoId: string; descricao: string; precoCentavos: number; duracaoMin: number };

/**
 * Serviços escolhidos: pelo menos um, cada um uma vez, existentes na empresa e ativos. `jaNoAtendimento`
 * são os serviços que o atendimento já tem: continuam aceitos mesmo se o serviço foi desativado depois.
 * Erros de preço e duração vão para `preco_<id>` e `duracao_<id>`.
 */
async function validarItens(
  tx: Transacao,
  campos: Campos,
  itens: EntradaItem[],
  jaNoAtendimento: Set<string> = new Set(),
): Promise<ItemValidado[]> {
  if (itens.some((i) => !ehUuid(i.servicoId))) {
    campos.erro("servicos", "Serviço não encontrado.");
    return [];
  }
  // Cada serviço uma vez (o banco também garante, pelo índice único).
  const escolhidos = [...new Map(itens.map((i) => [i.servicoId, i])).values()];
  if (escolhidos.length === 0) {
    campos.erro("servicos", "Escolha pelo menos um serviço.");
    return [];
  }

  const doCatalogo = await tx
    .select()
    .from(servico)
    .where(
      inArray(
        servico.id,
        escolhidos.map((i) => i.servicoId),
      ),
    );
  const validados: ItemValidado[] = [];
  for (const item of escolhidos) {
    const s = doCatalogo.find((c) => c.id === item.servicoId);
    if (!s) {
      campos.erro("servicos", "Serviço não encontrado.");
      continue;
    }
    if (!s.ativo && !jaNoAtendimento.has(s.id)) {
      campos.erro("servicos", `O serviço "${s.nome}" está desativado.`);
      continue;
    }
    const preco = reaisParaCentavos(item.preco ?? "");
    if (!preco.ok) campos.erro(`preco_${s.id}`, preco.erro);
    const duracaoMin = campos.inteiro(
      `duracao_${s.id}`,
      item.duracao,
      1,
      DURACAO_MAXIMA_MIN,
      `Informe a duração em minutos, de 1 a ${DURACAO_MAXIMA_MIN}.`,
    );
    validados.push({ servicoId: s.id, descricao: s.nome, precoCentavos: preco.ok ? preco.centavos : 0, duracaoMin });
  }
  return validados;
}

function validarDiaEHora(campos: Campos, dia: string | undefined, hora: string | undefined): void {
  if (ehDiaForaDosAnosAceitos(dia)) campos.erro("dia", `Use um dia entre ${ANO_MINIMO} e ${ANO_MAXIMO}.`);
  else if (!ehDia(dia)) campos.erro("dia", "Informe o dia.");
  if (!ehHora(hora)) campos.erro("hora", "Informe a hora, por exemplo 09:30.");
}

/** Outros atendimentos ativos no horário, formatados para o aviso. Cancelados e faltas não contam. */
async function conflitosNoHorario(
  tx: Transacao,
  inicio: Date,
  fim: Date,
  fuso: string,
  ignorarId?: string,
): Promise<Conflito[]> {
  const candidatos = await listarIntervalo(tx, inicio, fim);
  return conflitos({ inicio, fim }, candidatos, ignorarId).map((c) => ({
    id: c.id,
    petNome: c.pet.nome,
    tutorNome: c.tutor.nome,
    horario: textoDoHorario(c.inicio, c.fim, fuso),
  }));
}

async function avisoSeOcupado(
  tx: Transacao,
  inicio: Date,
  fim: Date,
  fuso: string,
  horarioAvisado: string | undefined,
  ignorarId?: string,
): Promise<AvisoDeHorario | null> {
  const chave = chaveDoHorario(inicio, fim);
  if (horarioAvisado === chave) return null;
  const encontrados = await conflitosNoHorario(tx, inicio, fim, fuso, ignorarId);
  return encontrados.length > 0 ? { ok: false, erros: {}, conflitos: encontrados, horarioAvisado: chave } : null;
}

/** Lançado dentro da gravação quando o atendimento mudou no meio-tempo: desfaz o savepoint. */
class AtendimentoMudouError extends Error {}

/**
 * Roda a gravação num savepoint. Um toque duplo que esbarra no índice único, ou um atendimento que mudou
 * no meio-tempo, desfaz só o savepoint e vira mensagem, não erro 500.
 */
async function gravarProtegido<T>(tx: Transacao, gravar: (sp: Transacao) => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await tx.transaction(gravar);
  } catch (erro) {
    if (erro instanceof AtendimentoMudouError || codigoPgDe(erro) === "23505") return falhou("geral", MENSAGEM_MUDOU);
    throw erro;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Escrita

/**
 * Agenda um atendimento (H5): preço e duração copiados do catálogo, editáveis; fim = início + durações.
 * Só pets e serviços ativos. Horário ocupado devolve um aviso, a menos que `horarioAvisado` confirme.
 */
export async function agendar(
  tx: Transacao,
  entrada: EntradaAgendamento,
  horarioAvisado?: string,
): Promise<ResultadoComAviso<{ id: string; dia: Dia }>> {
  const campos = new Campos();
  const petEscolhido = entrada.petId ? await obterPetParaAgendar(tx, entrada.petId) : null;
  if (!petEscolhido) campos.erro("pet", "Escolha um pet ativo.");
  validarDiaEHora(campos, entrada.dia, entrada.hora);
  const observacoes = campos.opcional("observacoes", entrada.observacoes, MAXIMO_OBSERVACOES);
  const itens = await validarItens(tx, campos, entrada.itens);
  if (!campos.validos) return { ok: false, erros: campos.erros };

  const fuso = await fusoDaEmpresa(tx);
  const inicio = instanteNoFuso(entrada.dia!, entrada.hora!, fuso);
  const fim = calcularFim(
    inicio,
    itens.map((i) => i.duracaoMin),
  );
  const aviso = await avisoSeOcupado(tx, inicio, fim, fuso, horarioAvisado);
  if (aviso) return aviso;

  return gravarProtegido(tx, async (sp) => {
    const [criado] = await sp
      .insert(atendimento)
      .values({ petId: petEscolhido!.id, inicio, fim, observacoes })
      .returning({ id: atendimento.id });
    await sp.insert(atendimentoItem).values(itens.map((i) => ({ ...i, atendimentoId: criado!.id })));
    return { ok: true, valor: { id: criado!.id, dia: entrada.dia! } };
  });
}

type Atual = { id: string; status: StatusAtendimento; confirmadoEm: Date | null; inicio: Date; fim: Date };

async function obterAtual(tx: Transacao, id: string): Promise<Atual | null> {
  if (!ehUuid(id)) return null;
  const [encontrado] = await tx
    .select({
      id: atendimento.id,
      status: atendimento.status,
      confirmadoEm: atendimento.confirmadoEm,
      inicio: atendimento.inicio,
      fim: atendimento.fim,
    })
    .from(atendimento)
    .where(eq(atendimento.id, id));
  return encontrado ? { ...encontrado, status: encontrado.status as StatusAtendimento } : null;
}

function recusaSeInativo(atual: Atual): { ok: false; erros: Erros } | null {
  if (atendimentoAtivo(atual.status)) return null;
  return falhou(
    "geral",
    `Este atendimento está "${NOMES_DOS_STATUS[atual.status]}" e não pode mudar. Reabra-o antes, se foi engano.`,
  );
}

/**
 * Muda o status (H7), avançando ou desfazendo. `de` é o status que a tela mostrava: se ele mudou nesse
 * meio-tempo (toque duplo, página desatualizada), nada é gravado. A trigger registra a mudança na auditoria.
 */
export async function mudarStatus(
  tx: Transacao,
  id: string,
  de: string | undefined,
  para: string | undefined,
): Promise<Resultado<{ id: string; status: StatusAtendimento }>> {
  if (!ehStatus(de) || !ehStatus(para)) return falhou("geral", "Status inválido.");
  const atual = await obterAtual(tx, id);
  if (!atual) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  if (atual.status !== de) return falhou("geral", MENSAGEM_MUDOU);

  const avaliada = avaliarMudanca(atual, para);
  if (!avaliada.ok) return falhou("geral", avaliada.erro);

  const [alterado] = await tx
    .update(atendimento)
    .set(avaliada.mudanca)
    .where(and(eq(atendimento.id, atual.id), eq(atendimento.status, de)))
    .returning({ id: atendimento.id });
  if (!alterado) return falhou("geral", MENSAGEM_MUDOU);
  return { ok: true, valor: { id: alterado.id, status: para } };
}

/**
 * Troca os serviços: os mantidos são alterados, os novos inseridos e os retirados apagados (a trigger
 * registra a remoção). O fim é recalculado. Só enquanto o atendimento está ativo.
 */
export async function editarItens(
  tx: Transacao,
  id: string,
  itens: EntradaItem[],
  horarioAvisado?: string,
): Promise<ResultadoComAviso<{ id: string }>> {
  const atual = await obterAtual(tx, id);
  if (!atual) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  const inativo = recusaSeInativo(atual);
  if (inativo) return inativo;

  const existentes = await tx.select().from(atendimentoItem).where(eq(atendimentoItem.atendimentoId, atual.id));
  const campos = new Campos();
  const validados = await validarItens(tx, campos, itens, new Set(existentes.map((e) => e.servicoId)));
  if (!campos.validos) return { ok: false, erros: campos.erros };

  const fuso = await fusoDaEmpresa(tx);
  const fim = calcularFim(
    atual.inicio,
    validados.map((i) => i.duracaoMin),
  );
  const aviso = await avisoSeOcupado(tx, atual.inicio, fim, fuso, horarioAvisado, atual.id);
  if (aviso) return aviso;

  return gravarProtegido(tx, async (sp) => {
    const manter = validados.map((i) => i.servicoId);
    await sp
      .delete(atendimentoItem)
      .where(and(eq(atendimentoItem.atendimentoId, atual.id), notInArray(atendimentoItem.servicoId, manter)));
    for (const item of validados) {
      const existente = existentes.find((e) => e.servicoId === item.servicoId);
      if (existente) {
        // A descrição fica como foi copiada no agendamento.
        await sp
          .update(atendimentoItem)
          .set({ precoCentavos: item.precoCentavos, duracaoMin: item.duracaoMin })
          .where(eq(atendimentoItem.id, existente.id));
      } else {
        await sp.insert(atendimentoItem).values({ ...item, atendimentoId: atual.id });
      }
    }
    // Só grava se ninguém mudou o status no meio-tempo para cancelado ou falta.
    const [alterado] = await sp
      .update(atendimento)
      .set({ fim })
      .where(and(eq(atendimento.id, atual.id), eq(atendimento.status, atual.status)))
      .returning({ id: atendimento.id });
    if (!alterado) throw new AtendimentoMudouError();
    return { ok: true, valor: { id: alterado.id } };
  });
}

/** Ajusta o dia, o início e o término (no mesmo dia, depois do início). Só enquanto o atendimento está ativo. */
export async function editarHorario(
  tx: Transacao,
  id: string,
  entrada: EntradaHorario,
  horarioAvisado?: string,
): Promise<ResultadoComAviso<{ id: string; dia: Dia }>> {
  const atual = await obterAtual(tx, id);
  if (!atual) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  const inativo = recusaSeInativo(atual);
  if (inativo) return inativo;

  const campos = new Campos();
  validarDiaEHora(campos, entrada.dia, entrada.hora);
  if (!ehHora(entrada.termino)) campos.erro("termino", "Informe a hora do término, por exemplo 10:30.");
  else if (ehHora(entrada.hora) && entrada.termino <= entrada.hora) {
    campos.erro("termino", "O término precisa ser depois do início, no mesmo dia.");
  }
  if (!campos.validos) return { ok: false, erros: campos.erros };

  const fuso = await fusoDaEmpresa(tx);
  const inicio = instanteNoFuso(entrada.dia!, entrada.hora!, fuso);
  const fim = instanteNoFuso(entrada.dia!, entrada.termino!, fuso);
  const aviso = await avisoSeOcupado(tx, inicio, fim, fuso, horarioAvisado, atual.id);
  if (aviso) return aviso;

  const [alterado] = await tx
    .update(atendimento)
    .set({ inicio, fim })
    .where(and(eq(atendimento.id, atual.id), eq(atendimento.status, atual.status)))
    .returning({ id: atendimento.id });
  if (!alterado) return falhou("geral", MENSAGEM_MUDOU);
  return { ok: true, valor: { id: alterado.id, dia: entrada.dia! } };
}

/** Observações do atendimento: podem mudar em qualquer status (anotar por que faltou, por exemplo). */
export async function editarObservacoes(
  tx: Transacao,
  id: string,
  observacoes: string | undefined,
): Promise<Resultado<{ id: string }>> {
  if (!ehUuid(id)) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  const campos = new Campos();
  const texto = campos.opcional("observacoes", observacoes, MAXIMO_OBSERVACOES);
  if (!campos.validos) return { ok: false, erros: campos.erros };
  const [alterado] = await tx
    .update(atendimento)
    .set({ observacoes: texto })
    .where(eq(atendimento.id, id))
    .returning({ id: atendimento.id });
  if (!alterado) return falhou("geral", MENSAGEM_NAO_ENCONTRADO);
  return { ok: true, valor: alterado };
}

export type HistoricoDoPet = {
  /** Próximo atendimento ainda por terminar (agendado, confirmado, em atendimento ou pronto). */
  proximo?: { id: string; inicio: Date; status: StatusAtendimento };
  /** Último atendimento concluído. */
  ultimo?: { id: string; inicio: Date };
};

/**
 * Próximo e último atendimento de cada pet do tutor, para a ficha do cliente. Só a empresa da transação (RLS): um
 * tutor de outra empresa devolve um mapa vazio. `agora` é o instante de referência (o relógio, nos testes).
 */
export async function proximoEUltimoPorPet(
  tx: Transacao,
  tutorId: string,
  agora: Date = new Date(),
): Promise<Map<string, HistoricoDoPet>> {
  const historico = new Map<string, HistoricoDoPet>();
  if (!ehUuid(tutorId)) return historico;
  const doTutor = eq(pet.tutorId, tutorId);

  const proximos = await tx
    .selectDistinctOn([atendimento.petId], {
      petId: atendimento.petId,
      id: atendimento.id,
      inicio: atendimento.inicio,
      status: atendimento.status,
    })
    .from(atendimento)
    .innerJoin(pet, eq(pet.id, atendimento.petId))
    .where(and(doTutor, inArray(atendimento.status, ["agendado", "confirmado", "em_atendimento", "pronto"]), gt(atendimento.fim, agora)))
    .orderBy(atendimento.petId, asc(atendimento.inicio));
  for (const p of proximos) {
    historico.set(p.petId, { proximo: { id: p.id, inicio: p.inicio, status: p.status as StatusAtendimento } });
  }

  const ultimos = await tx
    .selectDistinctOn([atendimento.petId], { petId: atendimento.petId, id: atendimento.id, inicio: atendimento.inicio })
    .from(atendimento)
    .innerJoin(pet, eq(pet.id, atendimento.petId))
    .where(and(doTutor, eq(atendimento.status, "concluido")))
    .orderBy(atendimento.petId, desc(atendimento.inicio));
  for (const u of ultimos) {
    historico.set(u.petId, { ...historico.get(u.petId), ultimo: { id: u.id, inicio: u.inicio } });
  }
  return historico;
}
