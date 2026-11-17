import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { Transacao } from "@/db/clientes";
import { codigoPgDe } from "@/db/erros";
import { pet, tutor } from "@/modules/cadastros/schema";
import { normalizarTelefone } from "@/modules/cadastros/telefone";
import { Campos, ehUuid, escaparLike, falhou, type Resultado } from "@/modules/compartilhado/validacao";

// Tutores (H1). Toda função recebe a transação de comEmpresaDaSessao: o RLS limita à empresa da
// sessão, e nenhuma função aqui recebe empresaId.

export type TutorDaLista = { id: string; nome: string; telefone: string | null; pets: string[] };

export type EntradaTutor = { nome?: string; telefone?: string; observacoes?: string };

/** Telefone repetido na empresa: o formulário mostra um link para o tutor já cadastrado. */
export type ErroTelefoneRepetido = { ok: false; erros: { telefone: string }; tutorExistenteId: string };

const LIMITE_DA_LISTA = 200;

/** Termo só com dígitos e sinais de telefone: "+55 (11) 98765-4321", "98765.4321". */
const PARECE_TELEFONE = /^[\d\s()+.-]+$/;

/**
 * Lista os tutores, ou busca por nome do tutor, nome de um pet ativo ou telefone, sem diferenciar
 * maiúsculas nem acentos. O telefone só entra quando o termo parece telefone (B7 do QA, sessão 07).
 * Pets desativados não entram na busca nem na lista.
 */
export async function buscarTutores(tx: Transacao, busca = ""): Promise<TutorDaLista[]> {
  const termo = busca.trim();
  let filtro = sql`true`;
  if (termo) {
    const padrao = `%${escaparLike(termo)}%`;
    const digitos = termo.replace(/\D/g, "");
    const porTexto = sql`unaccent(lower(${tutor.nome})) like unaccent(lower(${padrao}))
      or exists (
        select 1 from ${pet}
         where ${pet.empresaId} = ${tutor.empresaId} and ${pet.tutorId} = ${tutor.id} and ${pet.ativo}
           and unaccent(lower(${pet.nome})) like unaccent(lower(${padrao}))
      )`;
    // Telefone pelos dígitos: "98765-4321", "(11) 98765" e "+55 11 9…" encontram +5511987654321. Só quando o termo
    // parece telefone: em "Rex 2023" ou "ana 98888", os dígitos fazem parte do texto e não buscam no telefone.
    filtro =
      PARECE_TELEFONE.test(termo) && digitos.length >= 3
        ? sql`(${porTexto} or regexp_replace(${tutor.telefone}, '\\D', '', 'g') like ${`%${digitos}%`})`
        : sql`(${porTexto})`;
  }

  const tutores = await tx
    .select({ id: tutor.id, nome: tutor.nome, telefone: tutor.telefone })
    .from(tutor)
    .where(filtro)
    .orderBy(sql`unaccent(lower(${tutor.nome}))`)
    .limit(LIMITE_DA_LISTA);
  if (tutores.length === 0) return [];

  const pets = await tx
    .select({ tutorId: pet.tutorId, nome: pet.nome })
    .from(pet)
    .where(and(inArray(pet.tutorId, tutores.map((t) => t.id)), eq(pet.ativo, true)))
    .orderBy(asc(pet.nome));
  return tutores.map((t) => ({ ...t, pets: pets.filter((p) => p.tutorId === t.id).map((p) => p.nome) }));
}

export async function obterTutor(tx: Transacao, id: string) {
  if (!ehUuid(id)) return null;
  const [encontrado] = await tx.select().from(tutor).where(eq(tutor.id, id));
  return encontrado ?? null;
}

function validar(entrada: EntradaTutor) {
  const campos = new Campos();
  const nome = campos.obrigatorio("nome", entrada.nome, "o nome", 120);
  const telefone = normalizarTelefone(entrada.telefone ?? "");
  if (!telefone.ok) campos.erro("telefone", telefone.erro);
  const observacoes = campos.opcional("observacoes", entrada.observacoes, 2000);
  return campos.resultado({ nome, telefone: telefone.ok ? telefone.telefone : "", observacoes });
}

async function telefoneRepetido(
  tx: Transacao,
  telefone: string,
  ignorarId?: string,
): Promise<ErroTelefoneRepetido | null> {
  const [existente] = await tx
    .select({ id: tutor.id, nome: tutor.nome })
    .from(tutor)
    .where(ignorarId ? and(eq(tutor.telefone, telefone), ne(tutor.id, ignorarId)) : eq(tutor.telefone, telefone));
  if (!existente) return null;
  return {
    ok: false,
    erros: { telefone: `Este telefone já é de ${existente.nome}.` },
    tutorExistenteId: existente.id,
  };
}

/**
 * Grava num ponto de salvamento: se o índice único de telefone barrar (duas gravações ao mesmo
 * tempo), a transação continua utilizável para responder com o tutor que já tem o telefone.
 */
async function gravarProtegido<T>(
  tx: Transacao,
  telefone: string,
  ignorarId: string | undefined,
  gravar: (sp: Transacao) => Promise<T>,
): Promise<T | ErroTelefoneRepetido> {
  try {
    return await tx.transaction(gravar);
  } catch (erro) {
    if (codigoPgDe(erro) === "23505") {
      const repetido = await telefoneRepetido(tx, telefone, ignorarId);
      if (repetido) return repetido;
    }
    throw erro;
  }
}

export async function criarTutor(
  tx: Transacao,
  entrada: EntradaTutor,
): Promise<Resultado<{ id: string }> | ErroTelefoneRepetido> {
  const validado = validar(entrada);
  if (!validado.ok) return validado;
  const dados = validado.valor;

  const repetido = await telefoneRepetido(tx, dados.telefone);
  if (repetido) return repetido;

  const resultado = await gravarProtegido(tx, dados.telefone, undefined, (sp) =>
    sp.insert(tutor).values(dados).returning({ id: tutor.id }),
  );
  if (!Array.isArray(resultado)) return resultado;
  return { ok: true, valor: { id: resultado[0]!.id } };
}

export async function editarTutor(
  tx: Transacao,
  id: string,
  entrada: EntradaTutor,
): Promise<Resultado<{ id: string }> | ErroTelefoneRepetido> {
  if (!ehUuid(id)) return falhou("geral", "Tutor não encontrado.");
  const validado = validar(entrada);
  if (!validado.ok) return validado;
  const dados = validado.valor;

  const repetido = await telefoneRepetido(tx, dados.telefone, id);
  if (repetido) return repetido;

  // O RLS só deixa alterar tutores da empresa da sessão: id de outra empresa atinge 0 linhas.
  const resultado = await gravarProtegido(tx, dados.telefone, id, (sp) =>
    sp.update(tutor).set(dados).where(eq(tutor.id, id)).returning({ id: tutor.id }),
  );
  if (!Array.isArray(resultado)) return resultado;
  if (resultado.length === 0) return falhou("geral", "Tutor não encontrado.");
  return { ok: true, valor: { id } };
}
