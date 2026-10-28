import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoPlataforma, encerrarConexoes } from "@/db/clientes";
import { comEmpresa, EmpresaIndisponivelError } from "@/db/com-empresa";
import {
  apagarEmpresas,
  criarEmpresaComDados,
  esperarErroPg,
  SQLSTATE,
  usuarioTeste,
  type DadosEmpresa,
} from "@/db/testes/apoio";
import { empresa } from "@/modules/empresas/schema";

let a: DadosEmpresa;
let b: DadosEmpresa;
let suspensa: DadosEmpresa;

beforeAll(async () => {
  a = await criarEmpresaComDados("A");
  b = await criarEmpresaComDados("B");
  suspensa = await criarEmpresaComDados("Suspensa");
  await bancoPlataforma().update(empresa).set({ status: "suspensa" }).where(eq(empresa.id, suspensa.empresaId));
});

afterAll(async () => {
  const ids = [a, b, suspensa].map((dados) => dados?.empresaId).filter((id): id is string => Boolean(id));
  await apagarEmpresas(ids);
  await encerrarConexoes();
});

describe("empresa com o papel app", () => {
  it("só enxerga a própria empresa", async () => {
    const empresas = await comEmpresa(a.empresaId, usuarioTeste, (tx) => tx.select().from(empresa));
    expect(empresas.map((e) => e.id)).toEqual([a.empresaId]);
  });

  it("não altera a própria empresa", async () => {
    await esperarErroPg(
      comEmpresa(a.empresaId, usuarioTeste, (tx) =>
        tx.update(empresa).set({ nome: "Alterada" }).where(eq(empresa.id, a.empresaId)),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("não cria empresas", async () => {
    await esperarErroPg(
      comEmpresa(a.empresaId, usuarioTeste, (tx) => tx.insert(empresa).values({ nome: "Nova" })),
      SQLSTATE.semPermissao,
    );
  });
});

describe("comEmpresa", () => {
  it("recusa empresa suspensa", async () => {
    await expect(comEmpresa(suspensa.empresaId, usuarioTeste, async () => "não devia rodar")).rejects.toThrow(
      EmpresaIndisponivelError,
    );
  });

  it("recusa empresa inexistente", async () => {
    await expect(comEmpresa(randomUUID(), usuarioTeste, async () => "não devia rodar")).rejects.toThrow(
      EmpresaIndisponivelError,
    );
  });

  it("define app.empresa_id e app.usuario_id só dentro da transação", async () => {
    const usuarioId = randomUUID();
    const dentro = await comEmpresa(a.empresaId, usuarioId, async (tx) => {
      const { rows } = await tx.execute<{ empresa: string; usuario: string }>(
        "select current_setting('app.empresa_id', true) as empresa, current_setting('app.usuario_id', true) as usuario",
      );
      return rows[0];
    });
    expect(dentro).toEqual({ empresa: a.empresaId, usuario: usuarioId });
  });
});

describe("empresa com o papel plataforma", () => {
  it("enxerga todas as empresas", async () => {
    const empresas = await bancoPlataforma().select({ id: empresa.id }).from(empresa);
    const ids = empresas.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([a.empresaId, b.empresaId, suspensa.empresaId]));
  });
});
