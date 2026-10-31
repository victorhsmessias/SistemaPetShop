import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BotaoSair } from "@/app/botao-sair";
import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { EmpresaIndisponivelError } from "@/db/com-empresa";
import { MENSAGEM_EMPRESA_SUSPENSA } from "@/modules/acesso/auth";
import { comEmpresaDaSessao, NaoAutenticadoError, SemEmpresaError } from "@/modules/acesso/sessao";
import { empresa } from "@/modules/empresas/schema";

export const metadata: Metadata = { title: "Início · banho-e-tosa" };

type Situacao =
  | { tipo: "ok"; nomeDona: string; nomeEmpresa: string }
  | { tipo: "sem-sessao" }
  | { tipo: "admin" }
  | { tipo: "suspensa" };

async function carregar(): Promise<Situacao> {
  try {
    // O empresaId vem só da sessão.
    return await comEmpresaDaSessao(await cabecalhosDaRequisicao(), async (tx, sessao) => {
      const [dados] = await tx.select({ nome: empresa.nome }).from(empresa);
      return { tipo: "ok", nomeDona: sessao.nome, nomeEmpresa: dados?.nome ?? "" };
    });
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError) return { tipo: "sem-sessao" };
    if (erro instanceof SemEmpresaError) return { tipo: "admin" };
    if (erro instanceof EmpresaIndisponivelError) return { tipo: "suspensa" };
    throw erro;
  }
}

// Página inicial provisória da dona. Confere a sessão por conta própria (não usa naEmpresaDaDona porque
// é o destino da empresa suspensa: mostra o aviso em vez de redirecionar).
export default async function PaginaEmpresa() {
  const situacao = await carregar();
  if (situacao.tipo === "sem-sessao") redirect("/login");
  if (situacao.tipo === "admin") redirect("/admin");

  if (situacao.tipo === "suspensa") {
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

  return (
    <main className="pagina">
      <header className="topo">
        <span className="marca">banho-e-tosa</span>
        <BotaoSair />
      </header>
      <h1>Olá, {situacao.nomeDona}!</h1>
      <p className="suave">{situacao.nomeEmpresa}</p>
      <div className="acoes" style={{ marginBottom: 16 }}>
        <Link href="/clientes" className="botao-link botao-primario">
          Clientes
        </Link>
        <Link href="/servicos" className="botao-link botao-secundario">
          Serviços
        </Link>
      </div>
      <section className="cartao">
        <h2>Em construção</h2>
        <p className="suave">A agenda e o financeiro aparecem aqui nas próximas versões.</p>
      </section>
    </main>
  );
}
