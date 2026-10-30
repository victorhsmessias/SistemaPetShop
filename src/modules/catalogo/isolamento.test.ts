import { eq } from "drizzle-orm";
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
import { servico } from "@/modules/catalogo/schema";

// Teste de isolamento (docs/planejamento/modelo-de-dados.md) para servico.

let a: DadosEmpresa;
let b: DadosEmpresa;

beforeAll(async () => {
  a = await criarEmpresaComDados("Catálogo A");
  b = await criarEmpresaComDados("Catálogo B");
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

const naEmpresaA = <T>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(a.empresaId, usuarioTeste, fn);

describe("servico com o papel app e a empresa A na transação", () => {
  it("listar devolve só serviços de A", async () => {
    const servicos = await naEmpresaA((tx) => tx.select().from(servico));
    expect(servicos.map((s) => s.id)).toContain(a.servicoId);
    expect(new Set(servicos.map((s) => s.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it("buscar o serviço de B pelo id não encontra nada", async () => {
    expect(await naEmpresaA((tx) => tx.select().from(servico).where(eq(servico.id, b.servicoId)))).toEqual([]);
  });

  it("inserir sem empresa_id grava em A; com empresa_id de B falha", async () => {
    const [novo] = await naEmpresaA((tx) =>
      tx.insert(servico).values({ nome: "Tosa", precoCentavos: 0, duracaoMin: 30 }).returning(),
    );
    expect(novo!.empresaId).toBe(a.empresaId);

    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(servico).values({ empresaId: b.empresaId, nome: "Intruso", precoCentavos: 100, duracaoMin: 10 }),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("alterar o serviço de B não atinge nenhuma linha", async () => {
    const alterados = await naEmpresaA((tx) =>
      tx.update(servico).set({ precoCentavos: 1 }).where(eq(servico.id, b.servicoId)).returning(),
    );
    expect(alterados).toEqual([]);

    const { pool, banco } = conexaoMigrador();
    try {
      const [servicoB] = await banco.select().from(servico).where(eq(servico.id, b.servicoId));
      expect(servicoB!.precoCentavos).toBe(5000);
    } finally {
      await pool.end();
    }
  });

  it("mover um serviço de A para B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.update(servico).set({ empresaId: b.empresaId }).where(eq(servico.id, a.servicoId))),
      SQLSTATE.semPermissao,
    );
  });

  it("apagar falha: serviço é desativado, nunca apagado", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.delete(servico).where(eq(servico.id, a.servicoId))),
      SQLSTATE.semPermissao,
    );
  });

  it("preço negativo e duração zero são recusados pelo banco", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(servico).values({ nome: "X", precoCentavos: -1, duracaoMin: 10 })),
      "23514",
    );
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(servico).values({ nome: "X", precoCentavos: 100, duracaoMin: 0 })),
      "23514",
    );
  });
});

describe("servico sem empresa na transação e com a plataforma", () => {
  it("sem empresa, nada aparece e inserir falha", async () => {
    expect(await bancoApp().transaction((tx) => tx.select().from(servico))).toEqual([]);
    await esperarErroPg(
      bancoApp().transaction((tx) =>
        tx.insert(servico).values({ empresaId: a.empresaId, nome: "X", precoCentavos: 100, duracaoMin: 10 }),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("a plataforma não lê serviços", async () => {
    await esperarErroPg(bancoPlataforma().select().from(servico), SQLSTATE.semPermissao);
  });
});
