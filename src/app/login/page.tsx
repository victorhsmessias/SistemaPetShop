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
      <h1>Acesse sua agenda</h1>
      <FormularioLogin />
      <p className="suave">Esqueceu a senha? Peça uma nova ao suporte.</p>
    </main>
  );
}
