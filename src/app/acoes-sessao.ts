"use server";

import { redirect } from "next/navigation";

import { cabecalhosDaRequisicao } from "@/app/requisicao";
import { auth } from "@/modules/acesso/auth";

export async function sair(): Promise<void> {
  await auth.api.signOut({ headers: await cabecalhosDaRequisicao() });
  redirect("/login");
}
