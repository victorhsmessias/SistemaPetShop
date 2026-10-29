import { sql } from "drizzle-orm";

import { bancoPlataforma, type Transacao } from "@/db/clientes";

const formatoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Transação com o papel `plataforma` (todas as empresas, sem acesso às tabelas de negócio).
 * Define `app.usuario_id`, que a auditoria grava como autor. `null` só no comando criar-admin,
 * quando ainda não existe administrador. Uso restrito pelo ESLint ao módulo de administração
 * e ao comando criar-admin.
 */
export async function comPlataforma<T>(usuarioId: string | null, fn: (tx: Transacao) => Promise<T>): Promise<T> {
  if (usuarioId !== null && !formatoUuid.test(usuarioId)) throw new Error(`usuarioId inválido: ${usuarioId}`);

  return bancoPlataforma().transaction(async (tx) => {
    if (usuarioId !== null) {
      await tx.execute(sql`select set_config('app.usuario_id', ${usuarioId}, true)`);
    }
    return fn(tx);
  });
}
