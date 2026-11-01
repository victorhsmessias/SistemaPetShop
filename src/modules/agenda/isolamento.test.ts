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
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import { auditoria } from "@/modules/auditoria/schema";

// Teste de isolamento (docs/planejamento/modelo-de-dados.md) para atendimento e atendimento_item,
// mais as restrições e a auditoria que o banco garante nessas tabelas.

let a: DadosEmpresa;
let b: DadosEmpresa;

beforeAll(async () => {
  a = await criarEmpresaComDados("Agenda A");
  b = await criarEmpresaComDados("Agenda B");
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

const naEmpresaA = <T>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(a.empresaId, usuarioTeste, fn);

const INICIO = new Date("2026-11-11T13:00:00Z");
const FIM = new Date("2026-11-11T14:00:00Z");

async function comoMigrador<T>(fn: (banco: ReturnType<typeof conexaoMigrador>["banco"]) => Promise<T>) {
  const { pool, banco } = conexaoMigrador();
  try {
    return await fn(banco);
  } finally {
    await pool.end();
  }
}

describe("atendimento com o papel app e a empresa A na transação", () => {
  it("listar devolve só atendimentos de A", async () => {
    const linhas = await naEmpresaA((tx) => tx.select().from(atendimento));
    expect(linhas.map((l) => l.id)).toContain(a.atendimentoId);
    expect(new Set(linhas.map((l) => l.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it("inserir sem empresa_id grava em A; com empresa_id de B falha", async () => {
    const [novo] = await naEmpresaA((tx) =>
      tx.insert(atendimento).values({ petId: a.petId, inicio: INICIO, fim: FIM }).returning(),
    );
    expect(novo).toMatchObject({ empresaId: a.empresaId, status: "agendado" });

    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(atendimento).values({ empresaId: b.empresaId, petId: b.petId, inicio: INICIO, fim: FIM })),
      SQLSTATE.semPermissao,
    );
  });

  it("agendar em A para o pet de B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(atendimento).values({ petId: b.petId, inicio: INICIO, fim: FIM })),
      SQLSTATE.chaveEstrangeira,
    );
  });

  it("alterar o atendimento de B não atinge nenhuma linha", async () => {
    const alterados = await naEmpresaA((tx) =>
      tx.update(atendimento).set({ status: "cancelado" }).where(eq(atendimento.id, b.atendimentoId)).returning(),
    );
    expect(alterados).toEqual([]);
    const [atendimentoB] = await comoMigrador((banco) =>
      banco.select().from(atendimento).where(eq(atendimento.id, b.atendimentoId)),
    );
    expect(atendimentoB!.status).toBe("agendado");
  });

  it("apagar falha: atendimento é cancelado, nunca apagado", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.delete(atendimento).where(eq(atendimento.id, a.atendimentoId))),
      SQLSTATE.semPermissao,
    );
  });
});

describe("atendimento_item com o papel app e a empresa A na transação", () => {
  it("listar devolve só itens de A", async () => {
    const linhas = await naEmpresaA((tx) => tx.select().from(atendimentoItem));
    expect(linhas.map((l) => l.id)).toContain(a.itemId);
    expect(new Set(linhas.map((l) => l.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it("inserir com empresa_id de B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(atendimentoItem).values({
          empresaId: b.empresaId,
          atendimentoId: b.atendimentoId,
          servicoId: b.servicoId,
          descricao: "Intruso",
          precoCentavos: 100,
          duracaoMin: 10,
        }),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("item em A apontando para atendimento ou serviço de B falha", async () => {
    const item = { descricao: "X", precoCentavos: 100, duracaoMin: 10 };
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(atendimentoItem).values({ ...item, atendimentoId: b.atendimentoId, servicoId: a.servicoId }),
      ),
      SQLSTATE.chaveEstrangeira,
    );
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(atendimentoItem).values({ ...item, atendimentoId: a.atendimentoId, servicoId: b.servicoId }),
      ),
      SQLSTATE.chaveEstrangeira,
    );
  });

  it("alterar ou apagar o item de B não atinge nenhuma linha", async () => {
    const alterados = await naEmpresaA((tx) =>
      tx.update(atendimentoItem).set({ precoCentavos: 1 }).where(eq(atendimentoItem.id, b.itemId)).returning(),
    );
    expect(alterados).toEqual([]);
    const apagados = await naEmpresaA((tx) =>
      tx.delete(atendimentoItem).where(eq(atendimentoItem.id, b.itemId)).returning(),
    );
    expect(apagados).toEqual([]);

    const [itemB] = await comoMigrador((banco) =>
      banco.select().from(atendimentoItem).where(eq(atendimentoItem.id, b.itemId)),
    );
    expect(itemB!.precoCentavos).toBe(5000);
  });
});

describe("restrições que o banco garante na agenda", () => {
  it("fim antes ou igual ao início é recusado", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(atendimento).values({ petId: a.petId, inicio: INICIO, fim: INICIO })),
      "23514",
    );
  });

  it("status fora da lista é recusado; concluido exige concluido_em", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(atendimento).values({ petId: a.petId, inicio: INICIO, fim: FIM, status: "x" })),
      "23514",
    );
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(atendimento).values({ petId: a.petId, inicio: INICIO, fim: FIM, status: "concluido" }),
      ),
      "23514",
    );
  });

  it("confirmado exige confirmado_em, e agendado não pode ter confirmado_em", async () => {
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(atendimento).values({ petId: a.petId, inicio: INICIO, fim: FIM, status: "confirmado" }),
      ),
      "23514",
    );
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(atendimento).values({ petId: a.petId, inicio: INICIO, fim: FIM, confirmadoEm: new Date() }),
      ),
      "23514",
    );
    const [confirmado] = await naEmpresaA((tx) =>
      tx
        .insert(atendimento)
        .values({ petId: a.petId, inicio: INICIO, fim: FIM, status: "confirmado", confirmadoEm: new Date() })
        .returning(),
    );
    expect(confirmado!.status).toBe("confirmado");
  });

  it("o mesmo serviço duas vezes no atendimento é recusado", async () => {
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(atendimentoItem).values({
          atendimentoId: a.atendimentoId,
          servicoId: a.servicoId,
          descricao: "Repetido",
          precoCentavos: 100,
          duracaoMin: 10,
        }),
      ),
      "23505",
    );
  });

  it("preço negativo e duração zero no item são recusados", async () => {
    const base = { atendimentoId: a.atendimentoId, servicoId: a.servicoId, descricao: "X" };
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(atendimentoItem).values({ ...base, precoCentavos: -1, duracaoMin: 10 })),
      "23514",
    );
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(atendimentoItem).values({ ...base, precoCentavos: 0, duracaoMin: 0 })),
      "23514",
    );
  });
});

describe("auditoria da agenda", () => {
  it("criar, alterar e remover item ficam na auditoria, com o autor da transação", async () => {
    const [novo] = await naEmpresaA((tx) =>
      tx.insert(atendimento).values({ petId: a.petId, inicio: INICIO, fim: FIM }).returning(),
    );
    const [item] = await naEmpresaA((tx) =>
      tx
        .insert(atendimentoItem)
        .values({ atendimentoId: novo!.id, servicoId: a.servicoId, descricao: "Banho", precoCentavos: 5000, duracaoMin: 60 })
        .returning(),
    );
    await naEmpresaA((tx) => tx.update(atendimento).set({ status: "em_atendimento" }).where(eq(atendimento.id, novo!.id)));
    await naEmpresaA((tx) => tx.delete(atendimentoItem).where(eq(atendimentoItem.id, item!.id)));

    const eventos = await naEmpresaA((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.empresaId, a.empresaId)).orderBy(auditoria.id),
    );
    const doAtendimento = eventos.filter((e) => e.registroId === novo!.id);
    expect(doAtendimento.map((e) => [e.tabela, e.acao, e.usuarioId])).toEqual([
      ["atendimento", "criou", usuarioTeste],
      ["atendimento", "alterou", usuarioTeste],
    ]);
    expect(doAtendimento[1]!.antes).toMatchObject({ status: "agendado" });
    expect(doAtendimento[1]!.depois).toMatchObject({ status: "em_atendimento" });

    const doItem = eventos.filter((e) => e.registroId === item!.id);
    expect(doItem.map((e) => [e.tabela, e.acao, e.usuarioId])).toEqual([
      ["atendimento_item", "criou", usuarioTeste],
      ["atendimento_item", "removeu", usuarioTeste],
    ]);
    expect(doItem[1]!.antes).toMatchObject({ id: item!.id, descricao: "Banho", preco_centavos: 5000 });
    expect(doItem[1]!.depois).toEqual({});
  });
});

describe("agenda sem empresa na transação e com a plataforma", () => {
  it("sem empresa, nada aparece e inserir falha", async () => {
    expect(await bancoApp().transaction((tx) => tx.select().from(atendimento))).toEqual([]);
    expect(await bancoApp().transaction((tx) => tx.select().from(atendimentoItem))).toEqual([]);
    await esperarErroPg(
      bancoApp().transaction((tx) =>
        tx.insert(atendimento).values({ empresaId: a.empresaId, petId: a.petId, inicio: INICIO, fim: FIM }),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("a plataforma não lê atendimentos nem itens", async () => {
    await esperarErroPg(bancoPlataforma().select().from(atendimento), SQLSTATE.semPermissao);
    await esperarErroPg(bancoPlataforma().select().from(atendimentoItem), SQLSTATE.semPermissao);
  });
});
