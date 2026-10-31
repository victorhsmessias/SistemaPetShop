import { redirect } from "next/navigation";

import { cabecalhosDaRequisicao } from "@/app/requisicao";
import type { Transacao } from "@/db/clientes";
import { EmpresaIndisponivelError } from "@/db/com-empresa";
import { comEmpresaDaSessao, NaoAutenticadoError, SemEmpresaError, type Sessao } from "@/modules/acesso/sessao";

/**
 * Roda `fn` na empresa da dona logada. Chamado no início de CADA página e de CADA Server Action do
 * grupo (dona), nunca só no layout: o Next renderiza layout e página em paralelo, e o layout não
 * roda nas Server Actions. O empresaId vem só da sessão.
 *
 * Sem sessão: /login. Administrador (sem empresa): /admin. Empresa suspensa: /empresa, que mostra o aviso.
 */
export async function naEmpresaDaDona<T>(fn: (tx: Transacao, sessao: Sessao) => Promise<T>): Promise<T> {
  const cabecalhos = await cabecalhosDaRequisicao();
  let destino: "/login" | "/admin" | "/empresa";
  try {
    return await comEmpresaDaSessao(cabecalhos, fn);
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError) destino = "/login";
    else if (erro instanceof SemEmpresaError) destino = "/admin";
    else if (erro instanceof EmpresaIndisponivelError) destino = "/empresa";
    else throw erro;
  }
  // redirect fora do try: ele funciona lançando uma exceção.
  redirect(destino);
}
