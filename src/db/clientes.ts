import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as acesso from "@/modules/acesso/schema";
import * as agenda from "@/modules/agenda/schema";
import * as auditoria from "@/modules/auditoria/schema";
import * as cadastros from "@/modules/cadastros/schema";
import * as catalogo from "@/modules/catalogo/schema";
import * as empresas from "@/modules/empresas/schema";

// Acesso restrito pelo ESLint (eslint.config.mjs):
// - bancoApp: só dentro de src/db/ e no Better Auth (src/modules/acesso/auth.ts).
// - bancoPlataforma: só em src/db/ (comPlataforma) e nos testes.

const schema = { ...empresas, ...cadastros, ...catalogo, ...agenda, ...acesso, ...auditoria };

export type Banco = NodePgDatabase<typeof schema>;
export type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

type Conexao = { pool: Pool; banco: Banco };

// Guardado em globalThis para o hot reload do `next dev` não abrir pools novos a cada edição.
const cache = globalThis as unknown as { conexoesBanco?: Map<string, Conexao> };
const conexoes = (cache.conexoesBanco ??= new Map());

export function lerUrl(variavel: "DATABASE_URL" | "DATABASE_URL_PLATAFORMA"): string {
  const url = process.env[variavel];
  if (!url) throw new Error(`${variavel} não definida (veja .env.example).`);
  return url;
}

function conectar(variavel: "DATABASE_URL" | "DATABASE_URL_PLATAFORMA"): Banco {
  let conexao = conexoes.get(variavel);
  if (!conexao) {
    const pool = new Pool({ connectionString: lerUrl(variavel), connectionTimeoutMillis: 5000 });
    conexao = { pool, banco: drizzle({ client: pool, schema }) };
    conexoes.set(variavel, conexao);
  }
  return conexao.banco;
}

/** Papel `app`, sujeito ao RLS. Não usar direto: passe por `comEmpresa`. */
export function bancoApp(): Banco {
  return conectar("DATABASE_URL");
}

/** Papel `plataforma`: todas as empresas, sem acesso às tabelas de negócio. */
export function bancoPlataforma(): Banco {
  return conectar("DATABASE_URL_PLATAFORMA");
}

export async function encerrarConexoes(): Promise<void> {
  const pools = [...conexoes.values()].map((c) => c.pool);
  conexoes.clear();
  await Promise.all(pools.map((pool) => pool.end()));
}
