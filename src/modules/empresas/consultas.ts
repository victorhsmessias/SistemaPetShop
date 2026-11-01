import type { Transacao } from "@/db/clientes";
import { empresa } from "@/modules/empresas/schema";

/** Fuso da empresa da transação (o RLS só mostra a própria). Datas são digitadas e exibidas nele. */
export async function fusoDaEmpresa(tx: Transacao): Promise<string> {
  const [dados] = await tx.select({ fuso: empresa.fusoHorario }).from(empresa);
  if (!dados) throw new Error("Empresa da transação não encontrada.");
  return dados.fuso;
}
