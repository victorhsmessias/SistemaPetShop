import { eq, sql } from "drizzle-orm";

import { bancoApp, type Transacao } from "@/db/clientes";
import { empresa } from "@/modules/empresas/schema";

const formatoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EmpresaIndisponivelError extends Error {
  constructor(empresaId: string, motivo: "inexistente" | "suspensa") {
    super(`Empresa ${empresaId} ${motivo === "suspensa" ? "está suspensa" : "não existe"}.`);
    this.name = "EmpresaIndisponivelError";
  }
}

/**
 * Único caminho até as tabelas de negócio (docs/planejamento/modelo-de-dados.md, regra 5).
 *
 * Abre uma transação com o papel `app`, define `app.empresa_id` e `app.usuario_id` só para ela
 * (`set_config(..., true)`, seguro com pool de conexões) e roda `fn` com o cliente da transação.
 * Recusa empresa inexistente ou suspensa (regra 6).
 */
export async function comEmpresa<T>(
  empresaId: string,
  usuarioId: string,
  fn: (tx: Transacao) => Promise<T>,
): Promise<T> {
  if (!formatoUuid.test(empresaId)) throw new Error(`empresaId inválido: ${empresaId}`);
  if (!formatoUuid.test(usuarioId)) throw new Error(`usuarioId inválido: ${usuarioId}`);

  return bancoApp().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.empresa_id', ${empresaId}, true), set_config('app.usuario_id', ${usuarioId}, true)`,
    );

    const [registro] = await tx
      .select({ status: empresa.status })
      .from(empresa)
      .where(eq(empresa.id, empresaId));
    if (!registro) throw new EmpresaIndisponivelError(empresaId, "inexistente");
    if (registro.status !== "ativa") throw new EmpresaIndisponivelError(empresaId, "suspensa");

    return fn(tx);
  });
}
