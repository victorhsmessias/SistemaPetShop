import { redirect } from "next/navigation";

import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { NaoAutenticadoError, type Sessao } from "@/modules/acesso/sessao";
import { AcessoNegadoError, exigirAdmin } from "@/modules/administracao/guarda";

/**
 * Para páginas e layouts de /admin: devolve a sessão do administrador ou redireciona (sem sessão
 * para /login; a dona para a página dela). O Next renderiza layout e página em paralelo, então
 * cada um confere por conta própria. As Server Actions conferem no módulo de administração.
 */
export async function conferirAdminOuRedirecionar(): Promise<{ sessao: Sessao; cabecalhos: Headers }> {
  const cabecalhos = await cabecalhosDaRequisicao();
  let situacao: { sessao: Sessao } | "sem-sessao" | "negado";
  try {
    situacao = { sessao: await exigirAdmin(cabecalhos) };
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError) situacao = "sem-sessao";
    else if (erro instanceof AcessoNegadoError) situacao = "negado";
    else throw erro;
  }
  // redirect fora do try: ele funciona lançando uma exceção.
  if (situacao === "sem-sessao") redirect("/login");
  if (situacao === "negado") redirect("/");
  return { sessao: situacao.sessao, cabecalhos };
}
