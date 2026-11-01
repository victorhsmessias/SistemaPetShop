import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotaoSair } from "@/app/botao-sair";
import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { EmpresaIndisponivelError } from "@/db/com-empresa";
import { MENSAGEM_EMPRESA_SUSPENSA } from "@/modules/acesso/auth";
import { comEmpresaDaSessao, NaoAutenticadoError, SemEmpresaError } from "@/modules/acesso/sessao";

export const metadata: Metadata = { title: "Empresa · banho-e-tosa" };

type Situacao = "ativa" | "sem-sessao" | "admin" | "suspensa";

async function carregar(): Promise<Situacao> {
  try {
    // O empresaId vem só da sessão.
    return await comEmpresaDaSessao(await cabecalhosDaRequisicao(), async () => "ativa" as const);
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError) return "sem-sessao";
    if (erro instanceof SemEmpresaError) return "admin";
    if (erro instanceof EmpresaIndisponivelError) return "suspensa";
    throw erro;
  }
}

// Destino da empresa suspensa (naEmpresaDaDona redireciona para cá): mostra o aviso em vez de redirecionar,
// por isso confere a sessão por conta própria. Com a empresa ativa, a tela inicial é a agenda.
export default async function PaginaEmpresa() {
  const situacao = await carregar();
  if (situacao === "sem-sessao") redirect("/login");
  if (situacao === "admin") redirect("/admin");
  if (situacao === "ativa") redirect("/agenda");

  return (
    <main className="pagina pagina-estreita centralizada">
      <p className="marca">banho-e-tosa</p>
      <p className="mensagem mensagem-aviso" role="alert">
        {MENSAGEM_EMPRESA_SUSPENSA}
      </p>
      <div style={{ marginTop: 16 }}>
        <BotaoSair />
      </div>
    </main>
  );
}
