"use server";

import { revalidatePath } from "next/cache";

import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { resumoDoErro, textoDoResumo } from "@/db/erro-do-banco";
import { NaoAutenticadoError } from "@/modules/acesso/sessao";
import { criarDona, criarEmpresaComDona, encerrarSessoes, redefinirSenha } from "@/modules/administracao/empresas";
import { AcessoNegadoError } from "@/modules/administracao/guarda";
import { DadosInvalidosError } from "@/modules/administracao/usuarias";

// Server Actions do painel. Cada uma chega ao módulo de administração, que confere role = 'admin'
// no servidor antes de qualquer coisa. Nenhuma senha vai para os logs.

export type EstadoFormulario =
  | { tipo: "inicial" }
  /** `campo`: o erro é de um campo só (a senha) e aparece nele. */
  | { tipo: "erro"; mensagem: string; campo?: "senha" }
  | { tipo: "ok"; mensagem: string }
  /** A empresa foi criada e a dona não: o formulário é limpo e aponta para "Criar dona" no cartão dela. */
  | { tipo: "parcial"; mensagem: string; empresaId: string; empresaNome: string };

const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? "");

function falha(erro: unknown, acao: string): EstadoFormulario {
  if (erro instanceof DadosInvalidosError) {
    return { tipo: "erro", mensagem: erro.message, ...(erro.campo ? { campo: erro.campo } : {}) };
  }
  if (erro instanceof AcessoNegadoError || erro instanceof NaoAutenticadoError) {
    return { tipo: "erro", mensagem: "Acesso negado." };
  }
  // Só o resumo: a mensagem de um erro do banco traz os parâmetros da consulta (e-mail, hash da senha).
  console.error(`Falha ao ${acao}: ${textoDoResumo(resumoDoErro(erro))}`);
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
    // Reenviar o mesmo formulário criaria outra empresa: ele é limpo, e a dona é criada no cartão da empresa.
    if (resultado.situacao === "sem_dona") {
      return {
        tipo: "parcial",
        mensagem: `${resultado.erro} Crie a dona em "Criar dona", no cartão da empresa.`,
        empresaId: resultado.empresaId,
        empresaNome: texto(dados, "nome").trim(),
      };
    }
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
    const { sessoesEncerradas } = await redefinirSenha(
      await cabecalhosDaRequisicao(),
      texto(dados, "usuarioId"),
      texto(dados, "novaSenha"),
    );
    if (!sessoesEncerradas) {
      return {
        tipo: "erro",
        mensagem: "Senha redefinida, mas as sessões abertas não foram encerradas. Use \"Encerrar sessões\".",
      };
    }
    return { tipo: "ok", mensagem: "Senha redefinida e sessões abertas encerradas. Passe a nova senha para a usuária." };
  } catch (erro) {
    return falha(erro, "redefinir a senha");
  }
}

export async function encerrarSessoesAcao(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  try {
    await encerrarSessoes(await cabecalhosDaRequisicao(), texto(dados, "usuarioId"));
    return { tipo: "ok", mensagem: "Sessões encerradas. A usuária precisa entrar de novo." };
  } catch (erro) {
    return falha(erro, "encerrar as sessões");
  }
}
