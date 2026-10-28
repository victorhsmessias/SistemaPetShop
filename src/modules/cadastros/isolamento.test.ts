import { eq, inArray, sql } from "drizzle-orm";
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
import { pet, tutor } from "@/modules/cadastros/schema";

// Teste de isolamento (docs/planejamento/modelo-de-dados.md) para tutor e pet.

let a: DadosEmpresa;
let b: DadosEmpresa;

beforeAll(async () => {
  a = await criarEmpresaComDados("A");
  b = await criarEmpresaComDados("B");
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

const naEmpresaA = <T>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(a.empresaId, usuarioTeste, fn);

describe("com o papel app e a empresa A na transação", () => {
  it("listar devolve só linhas de A", async () => {
    const { tutores, pets } = await naEmpresaA(async (tx) => ({
      tutores: await tx.select().from(tutor),
      pets: await tx.select().from(pet),
    }));

    expect(tutores.map((t) => t.id)).toContain(a.tutorId);
    expect(pets.map((p) => p.id)).toContain(a.petId);
    expect(new Set(tutores.map((t) => t.empresaId))).toEqual(new Set([a.empresaId]));
    expect(new Set(pets.map((p) => p.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it("buscar uma linha de B pelo id não encontra nada", async () => {
    const encontrados = await naEmpresaA(async (tx) => ({
      tutor: await tx.select().from(tutor).where(eq(tutor.id, b.tutorId)),
      pet: await tx.select().from(pet).where(eq(pet.id, b.petId)),
    }));
    expect(encontrados).toEqual({ tutor: [], pet: [] });
  });

  it("inserir sem informar empresa_id grava na empresa A", async () => {
    const [novo] = await naEmpresaA((tx) =>
      tx.insert(tutor).values({ nome: "Tutor padrão", telefone: "+5511900000001" }).returning(),
    );
    expect(novo!.empresaId).toBe(a.empresaId);
  });

  it("inserir tutor com empresa_id de B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(tutor).values({ empresaId: b.empresaId, nome: "Intruso", telefone: "+5511900000002" }),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("inserir pet com empresa_id de B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(pet).values({ empresaId: b.empresaId, tutorId: b.tutorId, nome: "Intruso", porte: "P" }),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("pet de A apontando para tutor de B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(pet).values({ tutorId: b.tutorId, nome: "Órfão", porte: "P" })),
      SQLSTATE.chaveEstrangeira,
    );
  });

  it("alterar uma linha de B não atinge nenhuma linha", async () => {
    const alterados = await naEmpresaA(async (tx) => ({
      tutor: await tx.update(tutor).set({ nome: "Invadido" }).where(eq(tutor.id, b.tutorId)).returning(),
      pet: await tx.update(pet).set({ nome: "Invadido" }).where(eq(pet.id, b.petId)).returning(),
    }));
    expect(alterados).toEqual({ tutor: [], pet: [] });

    const { pool, banco } = conexaoMigrador();
    try {
      const [tutorB] = await banco.select().from(tutor).where(eq(tutor.id, b.tutorId));
      const [petB] = await banco.select().from(pet).where(eq(pet.id, b.petId));
      expect(tutorB!.nome).toBe("Tutor B");
      expect(petB!.nome).toBe("Pet B");
    } finally {
      await pool.end();
    }
  });

  it("mover uma linha de A para a empresa B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.update(tutor).set({ empresaId: b.empresaId }).where(eq(tutor.id, a.tutorId))),
      SQLSTATE.semPermissao,
    );
  });

  it("apagar falha: nada é apagado nas tabelas de negócio", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.delete(pet).where(eq(pet.id, a.petId))),
      SQLSTATE.semPermissao,
    );
    await esperarErroPg(
      naEmpresaA((tx) => tx.delete(tutor).where(eq(tutor.id, a.tutorId))),
      SQLSTATE.semPermissao,
    );
  });
});

describe("com o papel app e sem empresa na transação", () => {
  it("nenhuma linha aparece", async () => {
    const linhas = await bancoApp().transaction(async (tx) => ({
      tutores: await tx.select().from(tutor).where(inArray(tutor.id, [a.tutorId, b.tutorId])),
      pets: await tx.select().from(pet),
    }));
    expect(linhas).toEqual({ tutores: [], pets: [] });
  });

  it("nenhuma linha aparece com app.empresa_id vazio (conexão reaproveitada)", async () => {
    const linhas = await bancoApp().transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.empresa_id', '', true)`);
      return tx.select().from(tutor);
    });
    expect(linhas).toEqual([]);
  });

  it("inserir falha", async () => {
    await esperarErroPg(
      bancoApp().transaction((tx) =>
        tx.insert(tutor).values({ nome: "Sem empresa", telefone: "+5511900000003" }),
      ),
      SQLSTATE.naoNulo,
      SQLSTATE.semPermissao,
    );
    await esperarErroPg(
      bancoApp().transaction((tx) =>
        tx.insert(tutor).values({ empresaId: a.empresaId, nome: "Sem empresa", telefone: "+5511900000004" }),
      ),
      SQLSTATE.semPermissao,
    );
    await esperarErroPg(
      bancoApp().transaction((tx) =>
        tx.insert(pet).values({ empresaId: a.empresaId, tutorId: a.tutorId, nome: "Sem empresa", porte: "P" }),
      ),
      SQLSTATE.semPermissao,
    );
  });
});

describe("com o papel plataforma", () => {
  it("ler tutor dá erro de permissão", async () => {
    await esperarErroPg(bancoPlataforma().select().from(tutor), SQLSTATE.semPermissao);
  });

  it("ler pet dá erro de permissão", async () => {
    await esperarErroPg(bancoPlataforma().select().from(pet), SQLSTATE.semPermissao);
  });

  it("inserir tutor dá erro de permissão", async () => {
    await esperarErroPg(
      bancoPlataforma().insert(tutor).values({ empresaId: a.empresaId, nome: "X", telefone: "+5511900000005" }),
      SQLSTATE.semPermissao,
    );
  });
});
