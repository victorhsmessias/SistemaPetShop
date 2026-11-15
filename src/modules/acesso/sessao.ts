import type { Transacao } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { limparErroDoBanco } from "@/db/erro-do-banco";
import { auth } from "@/modules/acesso/auth";

export type Sessao = {
  usuarioId: string;
  nome: string;
  /** null só para o administrador da plataforma. */
  empresaId: string | null;
  role: "admin" | "user";
};

export class NaoAutenticadoError extends Error {
  constructor() {
    super("Sessão ausente ou expirada.");
    this.name = "NaoAutenticadoError";
  }
}

export class SemEmpresaError extends Error {
  constructor() {
    super("Esta usuária não pertence a uma empresa.");
    this.name = "SemEmpresaError";
  }
}

/**
 * Lê a sessão do Better Auth a partir dos cabeçalhos da requisição (cookie). Um erro do banco vira um erro limpo:
 * os parâmetros da consulta trariam o token da sessão para o log.
 */
export async function obterSessao(cabecalhos: Headers): Promise<Sessao | null> {
  const resultado = await auth.api.getSession({ headers: cabecalhos }).catch((erro: unknown) => {
    throw limparErroDoBanco(erro, "ao ler a sessão");
  });
  if (!resultado) return null;
  const { user } = resultado;
  return {
    usuarioId: user.id,
    nome: user.name,
    empresaId: user.empresaId ?? null,
    role: user.role === "admin" ? "admin" : "user",
  };
}

/**
 * Roda `fn` na empresa da usuária logada. O empresaId vem SÓ da sessão: nunca do corpo da
 * requisição, da URL ou de um formulário. Empresa suspensa: lança EmpresaIndisponivelError.
 */
export async function comEmpresaDaSessao<T>(
  cabecalhos: Headers,
  fn: (tx: Transacao, sessao: Sessao) => Promise<T>,
): Promise<T> {
  const sessao = await obterSessao(cabecalhos);
  if (!sessao) throw new NaoAutenticadoError();
  if (!sessao.empresaId) throw new SemEmpresaError();
  return comEmpresa(sessao.empresaId, sessao.usuarioId, (tx) => fn(tx, sessao));
}
