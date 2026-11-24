import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormularioLogin } from "@/app/login/formulario-login";
import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { obterSessao } from "@/modules/acesso/sessao";

export const metadata: Metadata = { title: "Entrar · banho-e-tosa" };

export default async function PaginaLogin() {
  if (await obterSessao(await cabecalhosDaRequisicao())) redirect("/");

  return (
    <main className="pagina pagina-estreita centralizada">
      <h1>Entrar</h1>
      <p className="suave">Use o e-mail e a senha que você recebeu.</p>
      <div className="cartao">
        <FormularioLogin />
      </div>
    </main>
  );
}
