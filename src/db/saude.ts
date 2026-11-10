import { Client } from "pg";

import { lerUrl } from "@/db/clientes";

// Checagem do banco para /api/health: uma conexão própria com o papel app (o mesmo das telas), consulta mínima e
// tempo limite curto. Não usa o pool do app: um banco lento não prende conexões das telas, e cada checagem
// prova que dá para conectar de novo.

const TEMPO_LIMITE_MS = 2000;

/** true quando o banco responde a `select 1` como o papel app em até 2 s; nunca lança. */
export async function bancoRespondendo(): Promise<boolean> {
  let cliente: Client | undefined;
  try {
    cliente = new Client({
      connectionString: lerUrl("DATABASE_URL"),
      connectionTimeoutMillis: TEMPO_LIMITE_MS,
      query_timeout: TEMPO_LIMITE_MS,
      statement_timeout: TEMPO_LIMITE_MS,
    });
    // Um erro da conexão depois de pronta (banco caiu no meio) não pode derrubar o processo.
    cliente.on("error", () => {});
    await cliente.connect();
    const { rows } = await cliente.query<{ ok: number }>("select 1 as ok");
    return rows[0]?.ok === 1;
  } catch {
    return false;
  } finally {
    await cliente?.end().catch(() => {});
  }
}
