import { and, asc, eq, inArray, ne } from "drizzle-orm";
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
import { auditoria } from "@/modules/auditoria/schema";
import { categoria, formaPagamento, lancamento } from "@/modules/financeiro/schema";

// Teste de isolamento (docs/planejamento/modelo-de-dados.md) para forma_pagamento, categoria e lancamento,
// mais os dados padrão criados com a empresa (ADR 0012), as restrições do lançamento e a auditoria.

let a: DadosEmpresa;
let b: DadosEmpresa;

beforeAll(async () => {
  a = await criarEmpresaComDados("Financeiro A");
  b = await criarEmpresaComDados("Financeiro B");
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

const naEmpresaA = <T>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(a.empresaId, usuarioTeste, fn);

async function comoMigrador<T>(fn: (banco: ReturnType<typeof conexaoMigrador>["banco"]) => Promise<T>) {
  const { pool, banco } = conexaoMigrador();
  try {
    return await fn(banco);
  } finally {
    await pool.end();
  }
}

/** Receita paga de A, com os valores obrigatórios; `extra` sobrescreve. */
function receitaDeA(extra: Partial<typeof lancamento.$inferInsert> = {}): typeof lancamento.$inferInsert {
  return {
    tipo: "receita",
    descricao: "Atendimento",
    valorCentavos: 5000,
    data: "2026-11-10",
    status: "pago",
    origem: "atendimento",
    atendimentoId: a.atendimentoId,
    formaPagamentoId: a.formaPagamentoId,
    categoriaId: a.categoriaId,
    ...extra,
  };
}

describe("dados padrão criados com a empresa (trigger empresa_dados_padrao)", () => {
  it("cada empresa nasce com Pix, Dinheiro, Débito e Crédito, e com as categorias de receita", async () => {
    const dados = await naEmpresaA(async (tx) => ({
      formas: await tx
        .select({ nome: formaPagamento.nome, ativa: formaPagamento.ativa, taxa: formaPagamento.taxaPercentual })
        .from(formaPagamento)
        .orderBy(asc(formaPagamento.nome)),
      categorias: await tx
        .select({ nome: categoria.nome, tipo: categoria.tipo })
        .from(categoria)
        .orderBy(asc(categoria.nome)),
    }));
    // A ordenação do banco é por bytes ("Dinheiro" antes de "Débito"): compara em português.
    dados.formas.sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
    expect(dados.formas).toEqual([
      { nome: "Crédito", ativa: true, taxa: "0.00" },
      { nome: "Débito", ativa: true, taxa: "0.00" },
      { nome: "Dinheiro", ativa: true, taxa: "0.00" },
      { nome: "Pix", ativa: true, taxa: "0.00" },
    ]);
    expect(dados.categorias).toEqual([
      { nome: "Atendimentos", tipo: "receita" },
      { nome: "Pacotes", tipo: "receita" },
    ]);
  });

  it("nome repetido na mesma empresa é recusado", async () => {
    await esperarErroPg(naEmpresaA((tx) => tx.insert(formaPagamento).values({ nome: "Pix" })), "23505");
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(categoria).values({ nome: "Atendimentos", tipo: "receita" })),
      "23505",
    );
  });
});

describe.each([
  { tabela: "forma_pagamento", alvo: formaPagamento, idDe: (d: DadosEmpresa) => d.formaPagamentoId },
  { tabela: "categoria", alvo: categoria, idDe: (d: DadosEmpresa) => d.categoriaId },
  { tabela: "lancamento", alvo: lancamento, idDe: (d: DadosEmpresa) => d.lancamentoId },
] as const)("$tabela com o papel app e a empresa A na transação", ({ alvo, idDe }) => {
  it("listar devolve só linhas de A", async () => {
    const linhas = await naEmpresaA((tx) => tx.select({ id: alvo.id, empresaId: alvo.empresaId }).from(alvo));
    expect(linhas.map((l) => l.id)).toContain(idDe(a));
    expect(new Set(linhas.map((l) => l.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it("buscar a linha de B pelo id não devolve nada", async () => {
    expect(await naEmpresaA((tx) => tx.select({ id: alvo.id }).from(alvo).where(eq(alvo.id, idDe(b))))).toEqual([]);
  });

  it("alterar a linha de B não atinge nenhuma linha", async () => {
    const alterados = await naEmpresaA((tx) =>
      tx.update(alvo).set({ atualizadoEm: new Date() }).where(eq(alvo.id, idDe(b))).returning({ id: alvo.id }),
    );
    expect(alterados).toEqual([]);
  });

  it("apagar falha: o app nunca apaga", async () => {
    await esperarErroPg(naEmpresaA((tx) => tx.delete(alvo).where(eq(alvo.id, idDe(a)))), SQLSTATE.semPermissao);
  });

  it("a plataforma não lê", async () => {
    await esperarErroPg(bancoPlataforma().select({ id: alvo.id }).from(alvo), SQLSTATE.semPermissao);
  });

  it("sem empresa na transação, nada aparece", async () => {
    expect(await bancoApp().transaction((tx) => tx.select({ id: alvo.id }).from(alvo))).toEqual([]);
  });
});

describe("inserir com empresa de B ou apontando para B", () => {
  it("forma de pagamento e categoria com empresa_id de B falham", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(formaPagamento).values({ empresaId: b.empresaId, nome: "Intrusa" })),
      SQLSTATE.semPermissao,
    );
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(categoria).values({ empresaId: b.empresaId, nome: "Intrusa", tipo: "receita" })),
      SQLSTATE.semPermissao,
    );
  });

  it("lançamento com empresa_id de B falha", async () => {
    await esperarErroPg(
      naEmpresaA((tx) =>
        tx.insert(lancamento).values(
          receitaDeA({
            empresaId: b.empresaId,
            atendimentoId: b.atendimentoId,
            formaPagamentoId: b.formaPagamentoId,
            categoriaId: b.categoriaId,
          }),
        ),
      ),
      SQLSTATE.semPermissao,
    );
  });

  it("lançamento de A apontando para atendimento, forma ou categoria de B falha", async () => {
    for (const extra of [
      { atendimentoId: b.atendimentoId },
      { formaPagamentoId: b.formaPagamentoId },
      { categoriaId: b.categoriaId },
    ]) {
      await esperarErroPg(naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA(extra))), SQLSTATE.chaveEstrangeira);
    }
  });

  it("sem empresa na transação, inserir falha", async () => {
    await esperarErroPg(
      bancoApp().transaction((tx) => tx.insert(lancamento).values({ ...receitaDeA(), empresaId: a.empresaId })),
      SQLSTATE.semPermissao,
    );
  });

  it("a linha de B continua intacta", async () => {
    const [lancamentoB] = await comoMigrador((banco) =>
      banco.select().from(lancamento).where(eq(lancamento.id, b.lancamentoId)),
    );
    expect(lancamentoB).toMatchObject({ status: "pago", valorCentavos: 1000 });
  });
});

describe("restrições que o banco garante no lançamento", () => {
  it("valor zero e taxa negativa são recusados", async () => {
    await esperarErroPg(naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA({ valorCentavos: 0 }))), "23514");
    await esperarErroPg(naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA({ taxaCentavos: -1 }))), "23514");
  });

  it("tipo, status e origem fora da lista são recusados", async () => {
    for (const extra of [{ tipo: "x" }, { status: "x" }, { origem: "x" }]) {
      await esperarErroPg(naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA(extra))), "23514");
    }
  });

  it("cancelado exige motivo", async () => {
    for (const motivoCancelamento of [null, "   "]) {
      await esperarErroPg(
        naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA({ status: "cancelado", motivoCancelamento }))),
        "23514",
      );
    }
  });

  it("origem atendimento exige atendimento_id", async () => {
    await esperarErroPg(naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA({ atendimentoId: null }))), "23514");
  });

  it("receita paga exige forma de pagamento", async () => {
    await esperarErroPg(
      naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA({ formaPagamentoId: null }))),
      "23514",
    );
  });

  it("uma receita válida por atendimento: a segunda é recusada, a cancelada não conta", async () => {
    try {
      const [primeira] = await naEmpresaA((tx) =>
        tx.insert(lancamento).values(receitaDeA()).returning({ id: lancamento.id }),
      );
      await esperarErroPg(naEmpresaA((tx) => tx.insert(lancamento).values(receitaDeA())), "23505");

      await naEmpresaA((tx) =>
        tx
          .update(lancamento)
          .set({ status: "cancelado", motivoCancelamento: "teste" })
          .where(eq(lancamento.id, primeira!.id)),
      );
      const [segunda] = await naEmpresaA((tx) =>
        tx.insert(lancamento).values(receitaDeA()).returning({ id: lancamento.id }),
      );
      expect(segunda!.id).not.toBe(primeira!.id);
    } finally {
      // Mesmo se o teste falhar, o atendimento de A fica sem receita válida, para não barrar os outros testes.
      await naEmpresaA((tx) =>
        tx
          .update(lancamento)
          .set({ status: "cancelado", motivoCancelamento: "limpeza do teste" })
          .where(and(eq(lancamento.atendimentoId, a.atendimentoId), ne(lancamento.status, "cancelado"))),
      );
    }
  });

  it("criar e cancelar lançamento ficam na auditoria, com o autor da transação", async () => {
    const [novo] = await naEmpresaA((tx) =>
      tx.insert(lancamento).values(receitaDeA({ origem: "manual", atendimentoId: null })).returning(),
    );
    await naEmpresaA((tx) =>
      tx
        .update(lancamento)
        .set({ status: "cancelado", motivoCancelamento: "lançado por engano" })
        .where(eq(lancamento.id, novo!.id)),
    );
    const eventos = await naEmpresaA((tx) =>
      tx
        .select()
        .from(auditoria)
        .where(and(eq(auditoria.tabela, "lancamento"), inArray(auditoria.registroId, [novo!.id])))
        .orderBy(auditoria.id),
    );
    expect(eventos.map((e) => [e.acao, e.usuarioId, e.empresaId])).toEqual([
      ["criou", usuarioTeste, a.empresaId],
      ["alterou", usuarioTeste, a.empresaId],
    ]);
    expect(eventos[1]!.antes).toMatchObject({ status: "pago" });
    expect(eventos[1]!.depois).toMatchObject({ status: "cancelado", motivo_cancelamento: "lançado por engano" });
  });
});
