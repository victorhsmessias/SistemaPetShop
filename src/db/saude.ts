import { Client } from "pg";

import { lerUrl } from "@/db/clientes";

// Checagem do banco para /api/health: uma conexão própria com o papel app (o mesmo das telas), consulta mínima e
// tempo limite curto. Não usa o pool do app: um banco lento não prende conexões das telas, e cada checagem
// prova que dá para conectar de novo.
//
// A rota não tem autenticação. Para uma rajada de requisições não abrir uma conexão por requisição (e esgotar as
// conexões do papel app, derrubando o login), as checagens simultâneas dividem a mesma promessa em andamento: no
// máximo uma conexão de saúde por processo. Nada é guardado depois que ela termina: a próxima requisição faz uma
// checagem nova, então ninguém recebe um resultado de antes de ter chegado, além do da checagem em curso.

const TEMPO_LIMITE_MS = 2000;

let checagemEmAndamento: Promise<boolean> | undefined;

/** true quando o banco responde a `select 1` como o papel app em até 2 s; nunca lança. */
export function bancoRespondendo(): Promise<boolean> {
  checagemEmAndamento ??= checarBanco().finally(() => {
    checagemEmAndamento = undefined;
  });
  return checagemEmAndamento;
}

async function checarBanco(): Promise<boolean> {
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
