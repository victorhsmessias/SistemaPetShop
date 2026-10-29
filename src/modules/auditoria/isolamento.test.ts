import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoApp, bancoPlataforma, encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import {
  apagarEmpresas,
  conexaoMigrador,
  criarEmpresaComDados,
  esperarErroPg,
  SQLSTATE,
  usuarioTeste,
  type DadosEmpresa,
} from "@/db/testes/apoio";
import { registrarEvento } from "@/modules/auditoria/registrar";
import { auditoria } from "@/modules/auditoria/schema";
import { empresa } from "@/modules/empresas/schema";

// Auditoria: isolamento por empresa, imutabilidade e a trigger auditar() em empresa.

let a: DadosEmpresa;
let b: DadosEmpresa;

beforeAll(async () => {
  a = await criarEmpresaComDados("Auditoria A");
  b = await criarEmpresaComDados("Auditoria B");
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

const naEmpresaA = <T>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(a.empresaId, usuarioTeste, fn);

async function lerComoMigrador(empresaId: string) {
  const { pool, banco } = conexaoMigrador();
  try {
    return await banco.select().from(auditoria).where(eq(auditoria.empresaId, empresaId)).orderBy(auditoria.id);
  } finally {
    await pool.end();
  }
}

describe("trigger auditar() em empresa", () => {
  it("criar empresa grava 'criou' com a empresa afetada", async () => {
    const linhas = await lerComoMigrador(a.empresaId);
    expect(linhas[0]).toMatchObject({
      tabela: "empresa",
      registroId: a.empresaId,
      empresaId: a.empresaId,
      acao: "criou",
      antes: null,
    });
  });

  it("alterar empresa grava antes, depois e o autor de app.usuario_id", async () => {
    const autor = randomUUID();
    await bancoPlataforma().transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.usuario_id', ${autor}, true)`);
      await tx.update(empresa).set({ nome: "[teste] Auditoria A renomeada" }).where(eq(empresa.id, a.empresaId));
    });

    const ultima = (await lerComoMigrador(a.empresaId)).at(-1)!;
    expect(ultima).toMatchObject({ acao: "alterou", usuarioId: autor, tabela: "empresa" });
    expect(ultima.antes).toMatchObject({ nome: "[teste] Auditoria A" });
    expect(ultima.depois).toMatchObject({ nome: "[teste] Auditoria A renomeada" });
  });
});

describe("auditoria com o papel app e a empresa A na transação", () => {
  it("só enxerga eventos de A", async () => {
    const linhas = await naEmpresaA((tx) => tx.select().from(auditoria));
    expect(linhas.length).toBeGreaterThan(0);
    expect(new Set(linhas.map((l) => l.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it("cria evento explícito em A, com o autor da transação", async () => {
    const registroId = randomUUID();
    await naEmpresaA((tx) =>
      registrarEvento(tx, { tabela: "teste", registroId, acao: "criou", depois: { ok: true } }),
    );
    const [linha] = (await lerComoMigrador(a.empresaId)).filter((l) => l.registroId === registroId);
    expect(linha).toMatchObject({ empresaId: a.empresaId, usuarioId: usuarioTeste });
  });

  it("não cria evento em B", async () => {
    await esperarErroPg(
      naEmpresaA((tx) =>
        registrarEvento(tx, {
          empresaId: b.empresaId,
          tabela: "teste",
          registroId: randomUUID(),
          acao: "criou",
          depois: {},
        }),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("não altera nem apaga eventos", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.update(auditoria).set({ acao: "alterou" }).where(eq(auditoria.empresaId, a.empresaId))),
      SQLSTATE.semPermissao,
    );
    await esperarErroPg(
      naEmpresaA((tx) => tx.delete(auditoria).where(eq(auditoria.empresaId, a.empresaId))),
      SQLSTATE.semPermissao,
    );
  });
});

describe("auditoria sem empresa na transação e com a plataforma", () => {
  it("o app sem empresa não enxerga nada", async () => {
    const linhas = await bancoApp().transaction((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.empresaId, a.empresaId)),
    );
    expect(linhas).toEqual([]);
  });

  it("a plataforma cria eventos, inclusive sem empresa, mas não lê", async () => {
    const registroId = randomUUID();
    await bancoPlataforma().transaction((tx) =>
      registrarEvento(tx, { empresaId: null, tabela: "teste", registroId, acao: "criou", depois: {} }),
    );
    await esperarErroPg(bancoPlataforma().select().from(auditoria), SQLSTATE.semPermissao);

    const { pool, banco } = conexaoMigrador();
    try {
      const apagadas = await banco
        .delete(auditoria)
        .where(and(eq(auditoria.registroId, registroId), eq(auditoria.tabela, "teste")))
        .returning();
      expect(apagadas).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });
});

describe("registrarEvento", () => {
  it("recusa dados de senha", async () => {
    await expect(
      naEmpresaA((tx) =>
        registrarEvento(tx, { tabela: "user", registroId: randomUUID(), acao: "alterou", depois: { password: "x" } }),
      ),
    ).rejects.toThrow(/password/);
  });
});
