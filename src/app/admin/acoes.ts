"use server";

import { revalidatePath } from "next/cache";

import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { NaoAutenticadoError } from "@/modules/acesso/sessao";
import { criarDona, criarEmpresaComDona, redefinirSenha } from "@/modules/administracao/empresas";
import { AcessoNegadoError } from "@/modules/administracao/guarda";
import { DadosInvalidosError } from "@/modules/administracao/usuarias";

// Server Actions do painel. Cada uma chega ao módulo de administração, que confere role = 'admin'
// no servidor antes de qualquer coisa. Nenhuma senha vai para os logs.

export type EstadoFormulario = { tipo: "inicial" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; mensagem: string };

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? "");

function falha(erro: unknown, acao: string): EstadoFormulario {
  if (erro instanceof DadosInvalidosError) return { tipo: "erro", mensagem: erro.message };
  if (erro instanceof AcessoNegadoError || erro instanceof NaoAutenticadoError) {
    return { tipo: "erro", mensagem: "Acesso negado." };
  }
  console.error(`Falha ao ${acao}:`, erro instanceof Error ? erro.message : erro);
  return { tipo: "erro", mensagem: `Não foi possível ${acao}. Tente de novo.` };
}

export async function criarEmpresaAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  try {
    const resultado = await criarEmpresaComDona(await cabecalhosDaRequisicao(), {
      nome: texto(dados, "nome"),
      fusoHorario: texto(dados, "fusoHorario"),
      dona: { nome: texto(dados, "donaNome"), email: texto(dados, "donaEmail"), senha: texto(dados, "donaSenha") },
    });
    revalidatePath("/admin");
    if (resultado.situacao === "sem_dona") return { tipo: "erro", mensagem: resultado.erro };
    return { tipo: "ok", mensagem: "Empresa e dona criadas. Passe a senha provisória para a dona." };
  } catch (erro) {
    return falha(erro, "criar a empresa");
  }
}

export async function criarDonaAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  try {
    await criarDona(await cabecalhosDaRequisicao(), texto(dados, "empresaId"), {
      nome: texto(dados, "donaNome"),
      email: texto(dados, "donaEmail"),
      senha: texto(dados, "donaSenha"),
    });
    revalidatePath("/admin");
    return { tipo: "ok", mensagem: "Dona criada." };
  } catch (erro) {
    return falha(erro, "criar a dona");
  }
}

export async function redefinirSenhaAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  try {
    await redefinirSenha(await cabecalhosDaRequisicao(), texto(dados, "usuarioId"), texto(dados, "novaSenha"));
    return { tipo: "ok", mensagem: "Senha redefinida. Passe a nova senha para a usuária." };
  } catch (erro) {
    return falha(erro, "redefinir a senha");
  }
}
