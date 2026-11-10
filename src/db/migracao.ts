import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Aplica as migrations de drizzle/ como o papel migrador (dono das tabelas): em desenvolvimento e no CI
// (npm run db:migrate) e na subida do container (docker-entrypoint.sh), antes de o app novo entrar.
//
// Usa o migrator do drizzle-orm (dependência de produção), que grava na mesma tabela do drizzle-kit
// (drizzle.__drizzle_migrations) e aplica as pendentes numa transação só. Em volta dele, uma trava consultiva
// (pg_advisory_lock): dois containers que sobem juntos migram em fila; o segundo espera, encontra tudo aplicado e
// segue. Toda migration precisa ser compatível com a versão anterior do app (CLAUDE.md), que continua no ar
// enquanto a nova migra.

/** Chave da trava consultiva das migrations (fixa; só este código a usa). */
export const CHAVE_DA_TRAVA = 7_260_620_061;

const ESPERA_MAXIMA_MS = 5 * 60_000;
const INTERVALO_MS = 1000;

export type OpcoesMigracao = {
  url: string;
  pasta?: string;
  /** Quanto esperar pela trava antes de desistir (padrão 5 minutos). */
  esperaMaximaMs?: number;
  aoEsperar?: () => void;
};

async function pegarTrava(cliente: Client, esperaMaximaMs: number, aoEsperar?: () => void): Promise<void> {
  const limite = Date.now() + esperaMaximaMs;
  let avisou = false;
  for (;;) {
    const { rows } = await cliente.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [CHAVE_DA_TRAVA]);
    if (rows[0]?.ok) return;
    if (!avisou) {
      aoEsperar?.();
      avisou = true;
    }
    if (Date.now() >= limite) {
      throw new Error(`Outra migração segura a trava há mais de ${Math.round(esperaMaximaMs / 1000)} s; desisti.`);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS));
  }
}

/** Aplica as migrations pendentes com a trava. Lança se a conexão, a trava ou alguma migration falhar. */
export async function aplicarMigracoes({
  url,
  pasta = "drizzle",
  esperaMaximaMs = ESPERA_MAXIMA_MS,
  aoEsperar,
}: OpcoesMigracao): Promise<void> {
  const cliente = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  cliente.on("error", () => {});
  await cliente.connect();
  try {
    await pegarTrava(cliente, esperaMaximaMs, aoEsperar);
    try {
      await migrate(drizzle({ client: cliente }), { migrationsFolder: pasta });
    } finally {
      await cliente.query("select pg_advisory_unlock($1)", [CHAVE_DA_TRAVA]).catch(() => {});
    }
  } finally {
    await cliente.end().catch(() => {});
  }
}
