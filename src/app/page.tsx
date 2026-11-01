import { redirect } from "next/navigation";

import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { obterSessao } from "@/modules/acesso/sessao";

// Depois do login: o administrador vai para /admin e a dona para a agenda do dia.
export default async function Inicio() {
  const sessao = await obterSessao(await cabecalhosDaRequisicao());
  if (!sessao) redirect("/login");
  redirect(sessao.role === "admin" ? "/admin" : "/agenda");
}
