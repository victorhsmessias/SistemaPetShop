import { NaoAutenticadoError, obterSessao, type Sessao } from "@/modules/acesso/sessao";

export class AcessoNegadoError extends Error {
  constructor() {
    super("Acesso restrito ao administrador da plataforma.");
    this.name = "AcessoNegadoError";
  }
}

/** Confere no servidor que a sessão é do administrador. Toda rota e ação de /admin começa por aqui. */
export async function exigirAdmin(cabecalhos: Headers): Promise<Sessao> {
  const sessao = await obterSessao(cabecalhos);
  if (!sessao) throw new NaoAutenticadoError();
  if (sessao.role !== "admin") throw new AcessoNegadoError();
  return sessao;
}
