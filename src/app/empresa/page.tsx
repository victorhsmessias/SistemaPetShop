import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotaoSair } from "@/app/botao-sair";
import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { whatsappDoSuporte } from "@/configuracao/ambiente";
import { EmpresaIndisponivelError } from "@/db/com-empresa";
import { comEmpresaDaSessao, NaoAutenticadoError, SemEmpresaError } from "@/modules/acesso/sessao";

export const metadata: Metadata = { title: "Empresa" };

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

// Destino da empresa suspensa (naEmpresaDaDona redireciona para cá): mostra o aviso em vez de redirecionar, por isso
// confere a sessão por conta própria. Fica fora do grupo (dona): sem a navegação, que só voltaria para cá. O contato
// do suporte é só WhatsApp (SUPORTE_WHATSAPP); sem a variável (só fora de produção), o aviso fica sem o botão.
export default async function PaginaEmpresa() {
  const situacao = await carregar();
  if (situacao === "sem-sessao") redirect("/login");
  if (situacao === "admin") redirect("/admin");
  if (situacao === "ativa") redirect("/agenda");
  const whatsapp = whatsappDoSuporte();

  return (
    <main className="pagina pagina-estreita centralizada pagina-excecao">
      <h1>Acesso suspenso</h1>
      {/* O h1 já diz o que aconteceu: uma linha com o que fazer, sem repetir o título numa caixa (plano "sem cara de
          IA", item 11). Conteúdo que já está na página quando ela abre: sem role="alert" (T17 da revisão). */}
      <p>Fale com o suporte para reativar. Seus dados continuam guardados.</p>
      {whatsapp && (
        <a className="botao-link botao-primario botao-largo" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
          WhatsApp do suporte
        </a>
      )}
      <BotaoSair className="botao-secundario botao-largo" />
    </main>
  );
}
