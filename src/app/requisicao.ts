import { headers } from "next/headers";

/** Cabeçalhos da requisição atual (com o cookie da sessão), para obterSessao e o painel. */
export async function cabecalhosDaRequisicao(): Promise<Headers> {
  return new Headers(await headers());
}
