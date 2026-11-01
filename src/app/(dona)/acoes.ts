"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { lerRetorno, parametroDeRetorno, urlDoAgendamento } from "@/app/(dona)/agenda/retorno";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { criarPet, definirPetAtivo, editarPet, type EntradaPet } from "@/modules/cadastros/pets";
import { criarTutor, editarTutor, type EntradaTutor } from "@/modules/cadastros/tutores";
import { criarServico, definirServicoAtivo, editarServico, type EntradaServico } from "@/modules/catalogo/servicos";
import type { Erros } from "@/modules/compartilhado/validacao";

// Server Actions das telas da dona. Cada uma começa por naEmpresaDaDona, que confere a sessão e usa o
// empresaId dela. Ids de tutor, pet e serviço vêm do formulário, mas o RLS só deixa ver e alterar os
// da empresa da sessão: id de outra empresa volta como "não encontrado".
// Atalho do agendamento: com o campo "agendar", o cadastro novo de tutor segue para o de pet, e o de pet
// volta para /agenda/novo com ele escolhido. A URL de volta é montada em agenda/retorno.ts.

export type EstadoCadastro = {
  erros: Erros;
  /** O que foi digitado, para o formulário não perder os dados quando volta com erro. */
  valores: Record<string, string>;
  tutorExistenteId?: string;
};

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? "");

function lerCampos(dados: FormData, campos: readonly string[]): Record<string, string> {
  return Object.fromEntries(campos.map((campo) => [campo, texto(dados, campo)]));
}

const CAMPOS_TUTOR = ["nome", "telefone", "observacoes"] as const;
const CAMPOS_PET = ["nome", "especie", "raca", "porte", "observacoes"] as const;
const CAMPOS_SERVICO = ["nome", "preco", "duracao"] as const;

export async function salvarTutorAcao(_anterior: EstadoCadastro, dados: FormData): Promise<EstadoCadastro> {
  const id = texto(dados, "id");
  const entrada: EntradaTutor = lerCampos(dados, CAMPOS_TUTOR);
  const resultado = await naEmpresaDaDona((tx) => (id ? editarTutor(tx, id, entrada) : criarTutor(tx, entrada)));
  if (!resultado.ok) {
    return {
      erros: resultado.erros,
      valores: entrada as Record<string, string>,
      tutorExistenteId: "tutorExistenteId" in resultado ? resultado.tutorExistenteId : undefined,
    };
  }
  revalidatePath("/clientes");
  const retorno = lerRetorno(texto(dados, "agendar"));
  if (retorno && !id) redirect(`/clientes/${resultado.valor.id}/pets/novo?agendar=${parametroDeRetorno(retorno)}`);
  redirect(`/clientes/${resultado.valor.id}`);
}

export async function salvarPetAcao(_anterior: EstadoCadastro, dados: FormData): Promise<EstadoCadastro> {
  const petId = texto(dados, "petId");
  const tutorId = texto(dados, "tutorId");
  const entrada: EntradaPet = lerCampos(dados, CAMPOS_PET);
  const resultado = await naEmpresaDaDona(async (tx) => {
    if (!petId) {
      const criado = await criarPet(tx, tutorId, entrada);
      return criado.ok ? { ok: true as const, valor: { tutorId, id: criado.valor.id } } : criado;
    }
    return editarPet(tx, petId, entrada);
  });
  if (!resultado.ok) return { erros: resultado.erros, valores: entrada as Record<string, string> };
  revalidatePath("/clientes");
  const retorno = lerRetorno(texto(dados, "agendar"));
  if (retorno && !petId) {
    revalidatePath("/agenda", "layout");
    redirect(urlDoAgendamento({ ...retorno, petId: resultado.valor.id }));
  }
  redirect(`/clientes/${resultado.valor.tutorId}`);
}

/** Desativa ou reativa um pet (campo "ativo" = "true" ou "false"). */
export async function alternarPetAtivoAcao(dados: FormData): Promise<void> {
  const ativo = texto(dados, "ativo") === "true";
  const resultado = await naEmpresaDaDona((tx) => definirPetAtivo(tx, texto(dados, "petId"), ativo));
  if (!resultado.ok) redirect("/clientes");
  revalidatePath("/clientes");
  redirect(`/clientes/${resultado.valor.tutorId}${ativo ? "" : "?inativos=1"}`);
}

export async function salvarServicoAcao(_anterior: EstadoCadastro, dados: FormData): Promise<EstadoCadastro> {
  const id = texto(dados, "id");
  const entrada: EntradaServico = lerCampos(dados, CAMPOS_SERVICO);
  const resultado = await naEmpresaDaDona((tx) => (id ? editarServico(tx, id, entrada) : criarServico(tx, entrada)));
  if (!resultado.ok) return { erros: resultado.erros, valores: entrada as Record<string, string> };
  revalidatePath("/servicos");
  redirect("/servicos");
}

/** Desativa ou reativa um serviço (campo "ativo" = "true" ou "false"). */
export async function alternarServicoAtivoAcao(dados: FormData): Promise<void> {
  const ativo = texto(dados, "ativo") === "true";
  await naEmpresaDaDona((tx) => definirServicoAtivo(tx, texto(dados, "id"), ativo));
  revalidatePath("/servicos");
  redirect(ativo ? "/servicos" : "/servicos?inativos=1");
}
