import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { expect } from "vitest";

import { bancoPlataforma } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { pet, tutor } from "@/modules/cadastros/schema";
import { empresa } from "@/modules/empresas/schema";

// Apoio aos testes de integração. Roda contra o Postgres de verdade (docker compose ou CI).

export type DadosEmpresa = { empresaId: string; tutorId: string; petId: string };

/** Conexão como migrador, dono das tabelas: só para ler o catálogo e limpar o que os testes criaram. */
export function conexaoMigrador() {
  const url = process.env.DATABASE_URL_MIGRADOR;
  if (!url) throw new Error("DATABASE_URL_MIGRADOR não definida (veja .env.example).");
  const pool = new Pool({ connectionString: url });
  return { pool, banco: drizzle({ client: pool }) };
}

export const usuarioTeste = randomUUID();

/** Cria uma empresa (pela plataforma) com um tutor e um pet (pelo app, dentro de comEmpresa). */
export async function criarEmpresaComDados(nome: string): Promise<DadosEmpresa> {
  const [criada] = await bancoPlataforma()
    .insert(empresa)
    .values({ nome: `[teste] ${nome}` })
    .returning({ id: empresa.id });
  const empresaId = criada!.id;

  return comEmpresa(empresaId, usuarioTeste, async (tx) => {
    const [t] = await tx
      .insert(tutor)
      .values({ nome: `Tutor ${nome}`, telefone: `+5511${String(Date.now()).slice(-8)}${nome.length}` })
      .returning({ id: tutor.id });
    const [p] = await tx
      .insert(pet)
      .values({ tutorId: t!.id, nome: `Pet ${nome}`, porte: "M" })
      .returning({ id: pet.id });
    return { empresaId, tutorId: t!.id, petId: p!.id };
  });
}

/** Apaga, como migrador, as linhas das empresas criadas pelo teste. */
export async function apagarEmpresas(empresaIds: string[]): Promise<void> {
  if (empresaIds.length === 0) return;
  const { pool, banco } = conexaoMigrador();
  try {
    await banco.transaction(async (tx) => {
      await tx.delete(pet).where(inArray(pet.empresaId, empresaIds));
      await tx.delete(tutor).where(inArray(tutor.empresaId, empresaIds));
      await tx.delete(empresa).where(inArray(empresa.id, empresaIds));
    });
  } finally {
    await pool.end();
  }
}

/** Código SQLSTATE do erro do Postgres, mesmo quando o Drizzle o embrulha em outro erro. */
export function codigoPg(erro: unknown): string | undefined {
  let atual: unknown = erro;
  while (atual instanceof Error) {
    if ("code" in atual && typeof atual.code === "string") return atual.code;
    atual = atual.cause;
  }
  return undefined;
}

/** Espera que a operação falhe com um dos códigos SQLSTATE informados. */
export async function esperarErroPg(operacao: Promise<unknown>, ...codigos: string[]): Promise<void> {
  const erro = await operacao.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erro, "a operação deveria ter falhado").toBeDefined();
  expect(codigos).toContain(codigoPg(erro));
}

export const SQLSTATE = {
  semPermissao: "42501", // permission denied / violação de política de RLS
  chaveEstrangeira: "23503",
  naoNulo: "23502",
} as const;
