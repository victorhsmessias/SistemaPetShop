"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { lerRetorno, urlDoAgendamento } from "@/app/(dona)/agenda/retorno";
import { comAviso } from "@/app/(dona)/avisos";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { criarPet, definirPetAtivo, editarPet, validarPet, type EntradaPet } from "@/modules/cadastros/pets";
import { criarTutor, editarTutor, type EntradaTutor } from "@/modules/cadastros/tutores";
import { criarServico, definirServicoAtivo, editarServico, type EntradaServico } from "@/modules/catalogo/servicos";
import type { Erros } from "@/modules/compartilhado/validacao";

// Server Actions das telas da dona. Cada uma começa por naEmpresaDaDona, que confere a sessão e usa o
// empresaId dela. Ids de tutor, pet e serviço vêm do formulário, mas o RLS só deixa ver e alterar os
// da empresa da sessão: id de outra empresa volta como "não encontrado".
// Atalho do agendamento: com o campo "agendar", "Novo cliente e pet" cria os dois numa transação e volta para
// /agenda/novo com o pet escolhido; o cadastro de pet (para um cliente que já existe) também volta. A URL de volta
// é montada em agenda/retorno.ts. Depois de salvar, o destino leva o aviso de sucesso (avisos.ts).

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
  redirect(comAviso(`/clientes/${resultado.valor.id}`, "cliente"));
}

const CAMPOS_CLIENTE_E_PET = ["nome", "telefone", "pet_nome", "especie", "porte", "pet_observacoes"] as const;

/** Recusa do cadastro "cliente e pet" dentro da transação: lançada para desfazer o tutor já criado. */
class CadastroRecusado extends Error {
  constructor(
    readonly erros: Erros,
    readonly tutorExistenteId?: string,
  ) {
    super("Cadastro de cliente e pet recusado.");
  }
}

/**
 * "Novo cliente e pet", vindo do agendamento: tutor (nome e WhatsApp) e pet numa transação só. O telefone passa por
 * normalizarTelefone e é único na empresa (criarTutor); se o tutor ou o pet tiver erro, nada é gravado. Os campos do
 * pet levam o prefixo `pet_` onde o nome repetiria o do tutor. Depois, volta para o agendamento com o pet escolhido.
 */
export async function cadastrarClienteEPetAcao(_anterior: EstadoCadastro, dados: FormData): Promise<EstadoCadastro> {
  const valores = lerCampos(dados, CAMPOS_CLIENTE_E_PET);
  const entradaPet: EntradaPet = {
    nome: valores.pet_nome,
    especie: valores.especie,
    porte: valores.porte,
    observacoes: valores.pet_observacoes,
  };
  const petValido = validarPet(entradaPet);
  const errosDoPet = (erros: Erros): Erros =>
    Object.fromEntries(Object.entries(erros).map(([campo, msg]) => [campo === "nome" || campo === "observacoes" ? `pet_${campo}` : campo, msg]));

  let criado: { tutorId: string; petId: string };
  try {
    criado = await naEmpresaDaDona(async (tx) => {
      const tutorCriado = await criarTutor(tx, { nome: valores.nome, telefone: valores.telefone });
      if (!tutorCriado.ok || !petValido.ok) {
        throw new CadastroRecusado(
          { ...(tutorCriado.ok ? {} : tutorCriado.erros), ...(petValido.ok ? {} : errosDoPet(petValido.erros)) },
          !tutorCriado.ok && "tutorExistenteId" in tutorCriado ? tutorCriado.tutorExistenteId : undefined,
        );
      }
      const petCriado = await criarPet(tx, tutorCriado.valor.id, entradaPet);
      if (!petCriado.ok) throw new CadastroRecusado(errosDoPet(petCriado.erros));
      return { tutorId: tutorCriado.valor.id, petId: petCriado.valor.id };
    });
  } catch (erro) {
    if (erro instanceof CadastroRecusado) return { erros: erro.erros, valores, tutorExistenteId: erro.tutorExistenteId };
    throw erro;
  }

  revalidatePath("/clientes");
  const retorno = lerRetorno(texto(dados, "agendar"));
  if (!retorno) redirect(comAviso(`/clientes/${criado.tutorId}`, "cliente-e-pet"));
  revalidatePath("/agenda", "layout");
  redirect(comAviso(urlDoAgendamento({ ...retorno, petId: criado.petId }), "cliente-e-pet"));
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
    redirect(comAviso(urlDoAgendamento({ ...retorno, petId: resultado.valor.id }), "pet"));
  }
  redirect(comAviso(`/clientes/${resultado.valor.tutorId}`, "pet"));
}

/** Desativa ou reativa um pet (campo "ativo" = "true" ou "false"). */
export async function alternarPetAtivoAcao(dados: FormData): Promise<void> {
  const ativo = texto(dados, "ativo") === "true";
  const resultado = await naEmpresaDaDona((tx) => definirPetAtivo(tx, texto(dados, "petId"), ativo));
  if (!resultado.ok) redirect("/clientes");
  revalidatePath("/clientes");
  redirect(
    ativo
      ? comAviso(`/clientes/${resultado.valor.tutorId}`, "pet-reativado")
      : comAviso(`/clientes/${resultado.valor.tutorId}?inativos=1`, "pet-desativado"),
  );
}

export async function salvarServicoAcao(_anterior: EstadoCadastro, dados: FormData): Promise<EstadoCadastro> {
  const id = texto(dados, "id");
  const entrada: EntradaServico = lerCampos(dados, CAMPOS_SERVICO);
  const resultado = await naEmpresaDaDona((tx) => (id ? editarServico(tx, id, entrada) : criarServico(tx, entrada)));
  if (!resultado.ok) return { erros: resultado.erros, valores: entrada as Record<string, string> };
  revalidatePath("/servicos");
  redirect(comAviso("/servicos", "servico"));
}

/** Desativa ou reativa um serviço (campo "ativo" = "true" ou "false"). */
export async function alternarServicoAtivoAcao(dados: FormData): Promise<void> {
  const ativo = texto(dados, "ativo") === "true";
  const resultado = await naEmpresaDaDona((tx) => definirServicoAtivo(tx, texto(dados, "id"), ativo));
  // Serviço que não é da empresa (ou id inválido): volta à lista, sem aviso de sucesso.
  if (!resultado.ok) redirect("/servicos");
  revalidatePath("/servicos");
  redirect(ativo ? comAviso("/servicos", "servico-reativado") : comAviso("/servicos?inativos=1", "servico-desativado"));
}
