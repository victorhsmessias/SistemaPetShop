import { eq } from "drizzle-orm";

import { comPlataforma } from "@/db/com-plataforma";
import { auth } from "@/modules/acesso/auth";
import { user } from "@/modules/acesso/schema";
import { registrarEvento } from "@/modules/auditoria/registrar";

// Criação de usuárias e redefinição de senha pelo Better Auth, com auditoria fora da
// transação da ação (ADR 0011). Nenhum dado de senha vai para a auditoria nem para os logs.

export class DadosInvalidosError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "DadosInvalidosError";
  }
}

export type NovaUsuaria = { nome: string; email: string; senha: string };

const SENHA_MINIMA = 8;
const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarNovaUsuaria(dados: NovaUsuaria): NovaUsuaria {
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();
  if (!nome) throw new DadosInvalidosError("Informe o nome.");
  if (!formatoEmail.test(email)) throw new DadosInvalidosError("E-mail inválido.");
  validarSenha(dados.senha);
  return { nome, email, senha: dados.senha };
}

export function validarSenha(senha: string): void {
  if (senha.length < SENHA_MINIMA) {
    throw new DadosInvalidosError(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
}

/** Confere, pela plataforma (que só lê `user`), se o e-mail já está em uso. */
export async function emailEmUso(autorId: string | null, email: string): Promise<boolean> {
  const [existente] = await comPlataforma(autorId, (tx) =>
    tx.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase())),
  );
  return Boolean(existente);
}

type Criacao = {
  /** Administrador que cria; null só no comando criar-admin. */
  autorId: string | null;
  /** Cabeçalhos da sessão do administrador; sem eles, a chamada é do servidor (criar-admin). */
  cabecalhos?: Headers;
  dados: NovaUsuaria;
  role: "admin" | "user";
  empresaId: string | null;
  origem: "painel" | "criar-admin";
};

/**
 * Cria a usuária pelo createUser do plugin admin (único caminho aceito pelo gancho de cadastro)
 * e grava o evento na auditoria. Se a auditoria falhar, a usuária é removida (ADR 0011).
 */
export async function criarUsuaria({ autorId, cabecalhos, dados, role, empresaId, origem }: Criacao) {
  const { nome, email, senha } = validarNovaUsuaria(dados);
  if (await emailEmUso(autorId, email)) throw new DadosInvalidosError("Este e-mail já está em uso.");

  const { user: criada } = await auth.api.createUser({
    body: { email, password: senha, name: nome, role, ...(empresaId ? { data: { empresaId } } : {}) },
    ...(cabecalhos ? { headers: cabecalhos } : {}),
  });

  try {
    await comPlataforma(autorId, (tx) =>
      registrarEvento(tx, {
        empresaId,
        tabela: "user",
        registroId: criada.id,
        acao: "criou",
        depois: { id: criada.id, nome, email, role, empresaId, origem },
      }),
    );
  } catch (erro) {
    const contexto = await auth.$context;
    await contexto.internalAdapter.deleteUser(criada.id);
    console.error(`Auditoria falhou ao criar a usuária ${criada.id}; criação desfeita.`, erro);
    throw new Error("Não foi possível registrar a criação na auditoria. A usuária não foi criada.");
  }

  return { id: criada.id, nome, email };
}

/**
 * Redefine a senha pelo setUserPassword (exige a sessão do administrador). Grava um evento antes
 * e outro com o resultado, para nenhuma redefinição bem-sucedida ficar sem registro (ADR 0011).
 */
export async function redefinirSenhaDaUsuaria(
  admin: { usuarioId: string },
  cabecalhos: Headers,
  usuarioId: string,
  novaSenha: string,
): Promise<void> {
  validarSenha(novaSenha);

  const [alvo] = await comPlataforma(admin.usuarioId, (tx) =>
    tx.select({ id: user.id, empresaId: user.empresaId }).from(user).where(eq(user.id, usuarioId)),
  );
  if (!alvo) throw new DadosInvalidosError("Usuária não encontrada.");

  const registrar = (situacao: "iniciada" | "concluida" | "falhou") =>
    comPlataforma(admin.usuarioId, (tx) =>
      registrarEvento(tx, {
        empresaId: alvo.empresaId,
        tabela: "user",
        registroId: alvo.id,
        acao: "alterou",
        depois: { evento: "redefinicao_de_senha", situacao },
      }),
    );

  // Sem o registro de início, a senha não é redefinida.
  await registrar("iniciada");

  try {
    await auth.api.setUserPassword({ body: { userId: alvo.id, newPassword: novaSenha }, headers: cabecalhos });
  } catch (erro) {
    await registrar("falhou").catch((e) => console.error(`Auditoria do resultado falhou (usuária ${alvo.id}).`, e));
    throw erro;
  }

  await registrar("concluida").catch((e) =>
    console.error(`Senha redefinida, mas a auditoria do resultado falhou (usuária ${alvo.id}).`, e),
  );
}
