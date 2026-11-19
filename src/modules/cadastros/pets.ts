import { and, asc, eq } from "drizzle-orm";

import type { Transacao } from "@/db/clientes";
import { pet, tutor } from "@/modules/cadastros/schema";
import { Campos, ehUuid, falhou, type Erros, type Resultado } from "@/modules/compartilhado/validacao";

// Pets (H1). Desativar e reativar, nunca apagar. Mesmas regras de transação de tutores.ts.

export const ESPECIES = ["cao", "gato", "outro"] as const;
export const NOMES_DAS_ESPECIES: Record<(typeof ESPECIES)[number], string> = {
  cao: "Cão",
  gato: "Gato",
  outro: "Outro",
};
export const PORTES = ["P", "M", "G", "GG"] as const;
export const NOMES_DOS_PORTES: Record<(typeof PORTES)[number], string> = {
  P: "Pequeno (P)",
  M: "Médio (M)",
  G: "Grande (G)",
  GG: "Gigante (GG)",
};

export const opcoesDeEspecie = ESPECIES.map((valor) => ({ valor, nome: NOMES_DAS_ESPECIES[valor] }));
export const opcoesDePorte = PORTES.map((valor) => ({ valor, nome: NOMES_DOS_PORTES[valor] }));

export type EntradaPet = {
  nome?: string;
  especie?: string;
  raca?: string;
  porte?: string;
  observacoes?: string;
};

export type Pet = typeof pet.$inferSelect;

/** Pets do tutor: só os ativos, ou todos quando a tela pede os inativos. */
export async function listarPetsDoTutor(tx: Transacao, tutorId: string, incluirInativos = false): Promise<Pet[]> {
  if (!ehUuid(tutorId)) return [];
  const filtro = incluirInativos ? eq(pet.tutorId, tutorId) : and(eq(pet.tutorId, tutorId), eq(pet.ativo, true));
  return tx.select().from(pet).where(filtro).orderBy(asc(pet.nome));
}

export async function obterPet(tx: Transacao, id: string): Promise<Pet | null> {
  if (!ehUuid(id)) return null;
  const [encontrado] = await tx.select().from(pet).where(eq(pet.id, id));
  return encontrado ?? null;
}

function validar(entrada: EntradaPet) {
  const campos = new Campos();
  const valor = {
    nome: campos.obrigatorio("nome", entrada.nome, "o nome do pet", 80),
    especie: campos.umDe("especie", entrada.especie, ESPECIES, "Escolha a espécie."),
    raca: campos.opcional("raca", entrada.raca, 80),
    porte: campos.umDe("porte", entrada.porte, PORTES, "Escolha o porte."),
    observacoes: campos.opcional("observacoes", entrada.observacoes, 2000),
  };
  return campos.resultado(valor);
}

/** Confere os campos do pet sem gravar (o cadastro "cliente e pet" valida tudo antes de criar o tutor). */
export function validarPet(entrada: EntradaPet): { ok: true } | { ok: false; erros: Erros } {
  const validado = validar(entrada);
  return validado.ok ? { ok: true } : validado;
}

export async function criarPet(tx: Transacao, tutorId: string, entrada: EntradaPet): Promise<Resultado<{ id: string }>> {
  // O tutor precisa estar visível na empresa da sessão. A chave composta (empresa_id, tutor_id)
  // garante o mesmo no banco, mesmo se esta checagem faltar.
  if (!ehUuid(tutorId)) return falhou("geral", "Tutor não encontrado.");
  const [dono] = await tx.select({ id: tutor.id }).from(tutor).where(eq(tutor.id, tutorId));
  if (!dono) return falhou("geral", "Tutor não encontrado.");

  const validado = validar(entrada);
  if (!validado.ok) return validado;
  const [criado] = await tx
    .insert(pet)
    .values({ ...validado.valor, tutorId })
    .returning({ id: pet.id });
  return { ok: true, valor: { id: criado!.id } };
}

export async function editarPet(tx: Transacao, id: string, entrada: EntradaPet): Promise<Resultado<{ id: string; tutorId: string }>> {
  if (!ehUuid(id)) return falhou("geral", "Pet não encontrado.");
  const validado = validar(entrada);
  if (!validado.ok) return validado;
  const [alterado] = await tx
    .update(pet)
    .set(validado.valor)
    .where(eq(pet.id, id))
    .returning({ id: pet.id, tutorId: pet.tutorId });
  if (!alterado) return falhou("geral", "Pet não encontrado.");
  return { ok: true, valor: alterado };
}

/** Desativa ou reativa. Desativado some das listas e da busca, mas continua no banco. */
export async function definirPetAtivo(
  tx: Transacao,
  id: string,
  ativo: boolean,
): Promise<Resultado<{ id: string; tutorId: string }>> {
  if (!ehUuid(id)) return falhou("geral", "Pet não encontrado.");
  const [alterado] = await tx
    .update(pet)
    .set({ ativo })
    .where(eq(pet.id, id))
    .returning({ id: pet.id, tutorId: pet.tutorId });
  if (!alterado) return falhou("geral", "Pet não encontrado.");
  return { ok: true, valor: alterado };
}
