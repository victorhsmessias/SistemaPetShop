import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { apagarEmpresas, criarEmpresaComDados, esperarErroPg, usuarioTeste, type DadosEmpresa } from "@/db/testes/apoio";
import { concluir, desfazerConclusao } from "@/modules/agenda/conclusao";
import { instanteNoFuso } from "@/modules/agenda/fuso";
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import { lancamento } from "@/modules/financeiro/schema";

// Lançamento cancelado é estado final, garantido pelo banco (trigger lancamento_cancelado_final, migration 0014).
// Desfazer a conclusão (que cancela a receita) e concluir de novo (que cria outra) continuam funcionando.

const VIOLACAO_DE_REGRA = "23514";
const AGORA = instanteNoFuso("2026-11-12", "10:00", "America/Sao_Paulo");

let a: DadosEmpresa;
const emA = <T>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(a.empresaId, usuarioTeste, fn);

beforeAll(async () => {
  a = await criarEmpresaComDados("Lançamento cancelado");
});

afterAll(async () => {
  if (a) await apagarEmpresas([a.empresaId]);
  await encerrarConexoes();
});

async function novoAtendimento(): Promise<string> {
  return emA(async (tx) => {
    const [at] = await tx
      .insert(atendimento)
      .values({ petId: a.petId, inicio: new Date("2026-11-10T13:00:00Z"), fim: new Date("2026-11-10T14:00:00Z") })
      .returning({ id: atendimento.id });
    await tx.insert(atendimentoItem).values({
      atendimentoId: at!.id,
      servicoId: a.servicoId,
      descricao: "Banho",
      precoCentavos: 5000,
      duracaoMin: 60,
    });
    return at!.id;
  });
}

async function receitasDo(atendimentoId: string) {
  return emA((tx) =>
    tx
      .select({ id: lancamento.id, status: lancamento.status, motivo: lancamento.motivoCancelamento })
      .from(lancamento)
      .where(eq(lancamento.atendimentoId, atendimentoId))
      .orderBy(asc(lancamento.criadoEm), asc(lancamento.id)),
  );
}

async function concluirComPix(id: string, de = "agendado") {
  const r = await emA((tx) => concluir(tx, id, { de, formaPagamentoId: a.formaPagamentoId, totalVisto: 5000 }, AGORA));
  expect(r.ok, JSON.stringify(r)).toBe(true);
}

async function desfazer(id: string, motivo: string) {
  const r = await emA((tx) => desfazerConclusao(tx, id, motivo));
  expect(r.ok, JSON.stringify(r)).toBe(true);
}

describe("lançamento cancelado não volta", () => {
  let canceladaId: string;

  beforeAll(async () => {
    const id = await novoAtendimento();
    await concluirComPix(id);
    await desfazer(id, "Era Dinheiro, não Pix");
    const [receita] = await receitasDo(id);
    expect(receita).toMatchObject({ status: "cancelado", motivo: "Era Dinheiro, não Pix" });
    canceladaId = receita!.id;
  });

  it.each(["pago", "a_receber"])("cancelado → %s é recusado pelo banco", async (status) => {
    await esperarErroPg(
      emA((tx) => tx.update(lancamento).set({ status }).where(eq(lancamento.id, canceladaId))),
      VIOLACAO_DE_REGRA,
    );
    const [depois] = await emA((tx) =>
      tx.select({ status: lancamento.status }).from(lancamento).where(eq(lancamento.id, canceladaId)),
    );
    expect(depois?.status).toBe("cancelado");
  });

  it("outros campos de um cancelado também não mudam (valor, motivo)", async () => {
    await esperarErroPg(
      emA((tx) => tx.update(lancamento).set({ valorCentavos: 1 }).where(eq(lancamento.id, canceladaId))),
      VIOLACAO_DE_REGRA,
    );
    await esperarErroPg(
      emA((tx) => tx.update(lancamento).set({ motivoCancelamento: "outro" }).where(eq(lancamento.id, canceladaId))),
      VIOLACAO_DE_REGRA,
    );
  });

  it("a receita manual cancelada também não volta a pago", async () => {
    await emA((tx) =>
      tx
        .update(lancamento)
        .set({ status: "cancelado", motivoCancelamento: "Lançado em dobro" })
        .where(eq(lancamento.id, a.lancamentoId)),
    );
    await esperarErroPg(
      emA((tx) => tx.update(lancamento).set({ status: "pago" }).where(eq(lancamento.id, a.lancamentoId))),
      VIOLACAO_DE_REGRA,
    );
  });

  it("lançamento não cancelado continua mudando (a receber → pago → cancelado)", async () => {
    const [nova] = await emA((tx) =>
      tx
        .insert(lancamento)
        .values({
          tipo: "receita",
          descricao: "[teste] a receber",
          valorCentavos: 1000,
          data: "2026-11-12",
          status: "a_receber",
          origem: "manual",
          categoriaId: a.categoriaId,
        })
        .returning({ id: lancamento.id }),
    );
    await emA((tx) =>
      tx
        .update(lancamento)
        .set({ status: "pago", formaPagamentoId: a.formaPagamentoId })
        .where(eq(lancamento.id, nova!.id)),
    );
    await emA((tx) =>
      tx
        .update(lancamento)
        .set({ status: "cancelado", motivoCancelamento: "Desistiu" })
        .where(eq(lancamento.id, nova!.id)),
    );
  });
});

describe("desfazer a conclusão e concluir de novo continuam funcionando", () => {
  it("cada conclusão cria uma receita nova; as desfeitas ficam canceladas", async () => {
    const id = await novoAtendimento();
    await concluirComPix(id);
    await desfazer(id, "Forma errada");
    await concluirComPix(id);
    await desfazer(id, "Valor errado");
    await concluirComPix(id);

    const receitas = await receitasDo(id);
    expect(receitas.map((r) => r.status)).toEqual(["cancelado", "cancelado", "pago"]);
    expect(receitas.map((r) => r.motivo)).toEqual(["Forma errada", "Valor errado", null]);
  });
});
