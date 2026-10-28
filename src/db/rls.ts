import { sql } from "drizzle-orm";
import { pgPolicy, pgRole } from "drizzle-orm/pg-core";

// Papéis criados por db/preparacao/papeis.sql; o drizzle-kit não os gerencia.
export const papelApp = pgRole("app").existing();
export const papelPlataforma = pgRole("plataforma").existing();

/**
 * Empresa da transação, definida por `comEmpresa` com `set_config('app.empresa_id', ..., true)`.
 * O `nullif` transforma a variável vazia (conexão reaproveitada) em null: nenhuma linha passa.
 */
export const empresaDaTransacao = sql`nullif(current_setting('app.empresa_id', true), '')::uuid`;

/** Política padrão das tabelas de negócio: o papel `app` só lê e grava linhas da empresa da transação. */
export function politicaDeIsolamento(tabela: string) {
  return pgPolicy(`${tabela}_isolamento`, {
    as: "permissive",
    for: "all",
    to: papelApp,
    using: sql`empresa_id = ${empresaDaTransacao}`,
    withCheck: sql`empresa_id = ${empresaDaTransacao}`,
  });
}
