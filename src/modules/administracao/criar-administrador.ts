import { resumoDoErro, textoDoResumo } from "@/db/erro-do-banco";
import { criarUsuaria, DadosInvalidosError } from "@/modules/administracao/usuarias";

/**
 * Cria o administrador da plataforma. Usado só pelo comando `npm run criar-admin`, rodado no
 * servidor: não há rota pública para isso. Passa pelo mesmo createUser do plugin admin que o
 * gancho de cadastro aceita, e grava o evento na auditoria sem empresa e sem autor.
 */
export async function criarAdministrador(dados: { nome: string; email: string; senha: string }) {
  return criarUsuaria({ autorId: null, dados, role: "admin", empresaId: null, origem: "criar-admin" });
}

export type RespostasDoCriarAdmin = { email: string; senha: string; confirmacao: string };

/**
 * O comando `criar-admin` sem o terminal: cria o administrador e devolve o que imprimir. A saída fica no log do
 * container, então não leva o e-mail nem nada da senha (regra 21 do `CLAUDE.md`): uma falha vira só o resumo de
 * `src/db/erro-do-banco.ts`, porque o erro do createUser do Better Auth pode ser um `DrizzleQueryError` com o
 * e-mail e o hash da senha nos parâmetros.
 */
export async function executarCriarAdmin(
  respostas: RespostasDoCriarAdmin,
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    if (respostas.senha !== respostas.confirmacao) throw new DadosInvalidosError("As senhas não conferem.");
    await criarAdministrador({ nome: "Administrador", email: respostas.email, senha: respostas.senha });
    return { ok: true, mensagem: "Administrador criado. Entre em /login com o e-mail e a senha informados." };
  } catch (erro) {
    return { ok: false, mensagem: `Não foi possível criar o administrador: ${textoDoResumo(resumoDoErro(erro))}` };
  }
}
