import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoPlataforma, encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { apagarEmpresas, criarEmpresaComDados, usuarioTeste, type DadosEmpresa } from "@/db/testes/apoio";
import { MENSAGEM_MUDOU, MENSAGEM_NAO_ENCONTRADO, mudarStatus } from "@/modules/agenda/atendimentos";
import {
  concluir,
  contarConcluidos,
  desfazerConclusao,
  MENSAGEM_JA_CONCLUIDO,
  MENSAGEM_NAO_CONCLUIDO,
} from "@/modules/agenda/conclusao";
import { inicioDoDia, instanteNoFuso } from "@/modules/agenda/fuso";
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import type { StatusAtendimento } from "@/modules/agenda/status";
import { auditoria } from "@/modules/auditoria/schema";
import { servico } from "@/modules/catalogo/schema";
import { empresa } from "@/modules/empresas/schema";
import { listarReceitasDoPeriodo, recebidoNoPeriodo } from "@/modules/financeiro/resumo";
import { formaPagamento, lancamento } from "@/modules/financeiro/schema";

// Concluir e desfazer a conclusão contra o Postgres de verdade. A empresa A fica em Manaus (UTC-4), para
// provar que o dia da receita segue o fuso da empresa. B serve ao isolamento; C, ao resumo do dia e do mês.

let a: DadosEmpresa;
let b: DadosEmpresa;
let c: DadosEmpresa;
let tosaId: string;
let valeInativoId: string;

const naEmpresa = (empresaDe: () => DadosEmpresa) => <T>(fn: Parameters<typeof comEmpresa<T>>[2]) =>
  comEmpresa(empresaDe().empresaId, usuarioTeste, fn);
const emA = naEmpresa(() => a);
const emB = naEmpresa(() => b);
const emC = naEmpresa(() => c);

/** 23h30 de 10/11 em Manaus = 03h30 UTC de 11/11. */
const TARDE_DA_NOITE_EM_MANAUS = instanteNoFuso("2026-11-10", "23:30", "America/Manaus");

/** Atendimento do pet da empresa com um item por preço (o primeiro é o banho do apoio, o segundo a tosa). */
async function novoAtendimento(
  em: typeof emA,
  dados: DadosEmpresa,
  precos: number[],
  servicos: string[] = [dados.servicoId, tosaId],
): Promise<string> {
  return em(async (tx) => {
    const [at] = await tx
      .insert(atendimento)
      .values({ petId: dados.petId, inicio: new Date("2026-11-10T13:00:00Z"), fim: new Date("2026-11-10T14:00:00Z") })
      .returning({ id: atendimento.id });
    await tx.insert(atendimentoItem).values(
      precos.map((precoCentavos, i) => ({
        atendimentoId: at!.id,
        servicoId: servicos[i]!,
        descricao: `Serviço ${i}`,
        precoCentavos,
        duracaoMin: 30,
      })),
    );
    return at!.id;
  });
}

/** Leva o atendimento pelos status, como a dona faria, para a auditoria ter o caminho de verdade. */
async function passarPor(em: typeof emA, id: string, caminho: StatusAtendimento[]) {
  let de: StatusAtendimento = "agendado";
  for (const para of caminho) {
    const r = await em((tx) => mudarStatus(tx, id, de, para));
    if (!r.ok) throw new Error(JSON.stringify(r.erros));
    de = para;
  }
}

const receitasDe = (em: typeof emA, atendimentoId: string) =>
  em((tx) =>
    tx
      .select()
      .from(lancamento)
      .where(eq(lancamento.atendimentoId, atendimentoId))
      .orderBy(asc(lancamento.criadoEm), asc(lancamento.id)),
  );

const atendimentoDe = async (em: typeof emA, id: string) =>
  (await em((tx) => tx.select().from(atendimento).where(eq(atendimento.id, id))))[0];

beforeAll(async () => {
  a = await criarEmpresaComDados("Conclusão A");
  b = await criarEmpresaComDados("Conclusão B");
  c = await criarEmpresaComDados("Conclusão C");
  await bancoPlataforma().update(empresa).set({ fusoHorario: "America/Manaus" }).where(eq(empresa.id, a.empresaId));
  // Um segundo serviço em cada empresa, para atendimentos com dois itens.
  const [tosa] = await emA((tx) =>
    tx.insert(servico).values({ nome: "Tosa", precoCentavos: 3200, duracaoMin: 30 }).returning({ id: servico.id }),
  );
  tosaId = tosa!.id;
  const [vale] = await emA((tx) =>
    tx.insert(formaPagamento).values({ nome: "Vale", ativa: false }).returning({ id: formaPagamento.id }),
  );
  valeInativoId = vale!.id;
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId, c?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

describe("concluir", () => {
  it("grava concluido e cria exatamente uma receita: soma dos itens, forma, pago, Atendimentos, dia no fuso", async () => {
    const id = await novoAtendimento(emA, a, [5000, 3200]);
    const resultado = await emA((tx) =>
      concluir(tx, id, { de: "agendado", formaPagamentoId: a.formaPagamentoId, totalVisto: 8200 }, TARDE_DA_NOITE_EM_MANAUS),
    );
    expect(resultado).toMatchObject({ ok: true, valor: { id, totalCentavos: 8200 } });

    const concluido = await atendimentoDe(emA, id);
    expect(concluido).toMatchObject({ status: "concluido", concluidoEm: TARDE_DA_NOITE_EM_MANAUS });

    const receitas = await receitasDe(emA, id);
    expect(receitas).toHaveLength(1);
    expect(receitas[0]).toMatchObject({
      tipo: "receita",
      origem: "atendimento",
      status: "pago",
      valorCentavos: 8200,
      taxaCentavos: 0,
      formaPagamentoId: a.formaPagamentoId,
      categoriaId: a.categoriaId,
      // 23h30 de 10/11 em Manaus: o dia é 10, embora em UTC já seja 11.
      data: "2026-11-10",
      descricao: "Atendimento",
      motivoCancelamento: null,
    });
    expect(receitas[0]!.descricao).not.toContain("Tutor");
  });

  it.each([["cancelado"], ["faltou"]] as const)("recusa atendimento %s, sem criar receita", async (status) => {
    const id = await novoAtendimento(emA, a, [5000]);
    await passarPor(emA, id, [status]);
    const resultado = await emA((tx) => concluir(tx, id, { de: status, formaPagamentoId: a.formaPagamentoId }));
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.erros.geral).toMatch(/não pode ser concluído/);
    expect(await receitasDe(emA, id)).toEqual([]);
  });

  it("recusa o já concluído com a mensagem, sem segunda receita", async () => {
    const id = await novoAtendimento(emA, a, [5000]);
    await emA((tx) => concluir(tx, id, { de: "agendado", formaPagamentoId: a.formaPagamentoId }));
    const deNovo = await emA((tx) => concluir(tx, id, { de: "agendado", formaPagamentoId: a.formaPagamentoId }));
    expect(deNovo).toEqual({ ok: false, erros: { geral: MENSAGEM_JA_CONCLUIDO } });
    expect(await receitasDe(emA, id)).toHaveLength(1);
  });

  it("duas conclusões ao mesmo tempo geram uma só receita, e a outra recebe a mensagem", async () => {
    const id = await novoAtendimento(emA, a, [5000, 3200]);
    const entrada = { de: "agendado", formaPagamentoId: a.formaPagamentoId, totalVisto: 8200 };
    const resultados = await Promise.all([emA((tx) => concluir(tx, id, entrada)), emA((tx) => concluir(tx, id, entrada))]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok)).toEqual([{ ok: false, erros: { geral: MENSAGEM_JA_CONCLUIDO } }]);
    expect(await receitasDe(emA, id)).toHaveLength(1);
  });

  it("status ou total diferentes do que a tela mostrava: nada é gravado", async () => {
    const id = await novoAtendimento(emA, a, [5000]);
    await passarPor(emA, id, ["confirmado"]);
    expect(await emA((tx) => concluir(tx, id, { de: "agendado", formaPagamentoId: a.formaPagamentoId }))).toEqual({
      ok: false,
      erros: { geral: MENSAGEM_MUDOU },
    });
    const totalMudou = await emA((tx) =>
      concluir(tx, id, { de: "confirmado", formaPagamentoId: a.formaPagamentoId, totalVisto: 4000 }),
    );
    expect(!totalMudou.ok && totalMudou.erros.geral).toMatch(/O total mudou para R\$\s50,00/);
    expect((await atendimentoDe(emA, id))!.status).toBe("confirmado");
    expect(await receitasDe(emA, id)).toEqual([]);
  });

  it("forma de pagamento ausente, inativa ou de outra empresa é recusada", async () => {
    const id = await novoAtendimento(emA, a, [5000]);
    for (const formaPagamentoId of [undefined, "x", valeInativoId, b.formaPagamentoId]) {
      expect(await emA((tx) => concluir(tx, id, { de: "agendado", formaPagamentoId }))).toEqual({
        ok: false,
        erros: { formaPagamento: "Escolha uma forma de pagamento." },
      });
    }
    expect((await atendimentoDe(emA, id))!.status).toBe("agendado");
  });

  it("total zero conclui sem receita e sem forma de pagamento; desfazer não pede motivo", async () => {
    const id = await novoAtendimento(emA, a, [0]);
    const resultado = await emA((tx) => concluir(tx, id, { de: "agendado", totalVisto: 0 }));
    expect(resultado).toMatchObject({ ok: true, valor: { totalCentavos: 0, receitaId: null } });
    expect((await atendimentoDe(emA, id))!.status).toBe("concluido");
    expect(await receitasDe(emA, id)).toEqual([]);

    expect(await emA((tx) => desfazerConclusao(tx, id, ""))).toEqual({ ok: true, valor: { id, status: "agendado" } });
  });
});

describe("desfazer a conclusão", () => {
  it("cancela a receita com o motivo e volta ao status de antes de concluir (pronto)", async () => {
    const id = await novoAtendimento(emA, a, [5000]);
    await passarPor(emA, id, ["em_atendimento", "pronto"]);
    await emA((tx) => concluir(tx, id, { de: "pronto", formaPagamentoId: a.formaPagamentoId }));

    expect(await emA((tx) => desfazerConclusao(tx, id, "  "))).toEqual({
      ok: false,
      erros: { motivo: "Informe o motivo: ele fica no cancelamento da receita." },
    });
    expect(await emA((tx) => desfazerConclusao(tx, id, "Toquei sem querer"))).toEqual({
      ok: true,
      valor: { id, status: "pronto" },
    });

    expect(await atendimentoDe(emA, id)).toMatchObject({ status: "pronto", concluidoEm: null });
    const [receita] = await receitasDe(emA, id);
    expect(receita).toMatchObject({ status: "cancelado", motivoCancelamento: "Toquei sem querer" });

    expect(await emA((tx) => desfazerConclusao(tx, id, "de novo"))).toEqual({
      ok: false,
      erros: { geral: MENSAGEM_NAO_CONCLUIDO },
    });
  });

  it("volta a confirmado mantendo confirmado_em, e concluir de novo cria uma receita nova", async () => {
    const id = await novoAtendimento(emA, a, [5000, 3200]);
    await passarPor(emA, id, ["confirmado"]);
    const confirmadoEm = (await atendimentoDe(emA, id))!.confirmadoEm;
    await emA((tx) => concluir(tx, id, { de: "confirmado", formaPagamentoId: a.formaPagamentoId }));
    await emA((tx) => desfazerConclusao(tx, id, "Valor errado"));
    expect(await atendimentoDe(emA, id)).toMatchObject({ status: "confirmado", confirmadoEm, concluidoEm: null });

    const [dinheiro] = await emA((tx) =>
      tx.select({ id: formaPagamento.id }).from(formaPagamento).where(eq(formaPagamento.nome, "Dinheiro")),
    );
    const outra = await emA((tx) => concluir(tx, id, { de: "confirmado", formaPagamentoId: dinheiro!.id }));
    expect(outra.ok).toBe(true);

    const receitas = await receitasDe(emA, id);
    expect(receitas.map((r) => [r.status, r.formaPagamentoId, r.valorCentavos])).toEqual([
      ["cancelado", a.formaPagamentoId, 8200],
      ["pago", dinheiro!.id, 8200],
    ]);
  });

  it("a conclusão e o desfazer ficam na auditoria, no atendimento e no lançamento, com o autor", async () => {
    const id = await novoAtendimento(emA, a, [5000]);
    await emA((tx) => concluir(tx, id, { de: "agendado", formaPagamentoId: a.formaPagamentoId }));
    await emA((tx) => desfazerConclusao(tx, id, "Engano"));
    const [receita] = await receitasDe(emA, id);

    const eventos = await emA((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.empresaId, a.empresaId)).orderBy(asc(auditoria.id)),
    );
    const resumo = eventos
      .filter((e) => e.registroId === id || e.registroId === receita!.id)
      .map((e) => [e.tabela, e.acao, e.usuarioId, (e.depois as { status: string }).status]);
    expect(resumo).toEqual([
      ["atendimento", "criou", usuarioTeste, "agendado"],
      ["atendimento", "alterou", usuarioTeste, "concluido"],
      ["lancamento", "criou", usuarioTeste, "pago"],
      ["atendimento", "alterou", usuarioTeste, "agendado"],
      ["lancamento", "alterou", usuarioTeste, "cancelado"],
    ]);
  });
});

describe("isolamento da conclusão", () => {
  it("a empresa A não conclui nem desfaz o atendimento de B, mesmo com os ids certos", async () => {
    expect(
      await emA((tx) => concluir(tx, b.atendimentoId, { de: "agendado", formaPagamentoId: b.formaPagamentoId })),
    ).toEqual({ ok: false, erros: { geral: MENSAGEM_NAO_ENCONTRADO } });
    expect(await emA((tx) => desfazerConclusao(tx, b.atendimentoId, "x"))).toEqual({
      ok: false,
      erros: { geral: MENSAGEM_NAO_ENCONTRADO },
    });
    expect((await atendimentoDe(emB, b.atendimentoId))!.status).toBe("agendado");
    expect(await receitasDe(emB, b.atendimentoId)).toEqual([]);
  });
});

describe("resumo do dia e do mês", () => {
  // Em C (São Paulo): a receita manual de R$ 10,00 do apoio, em 10/11; um atendimento de R$ 50,00 concluído
  // em 10/11; um de R$ 30,00 em 25/11; e um de R$ 20,00 concluído em 10/11 e desfeito (cancelado).
  const DIA_10 = instanteNoFuso("2026-11-10", "15:00", "America/Sao_Paulo");
  const DIA_25 = instanteNoFuso("2026-11-25", "10:00", "America/Sao_Paulo");

  beforeAll(async () => {
    const pix = c.formaPagamentoId;
    const um = await novoAtendimento(emC, c, [5000], [c.servicoId]);
    const dois = await novoAtendimento(emC, c, [3000], [c.servicoId]);
    const tres = await novoAtendimento(emC, c, [2000], [c.servicoId]);
    for (const [id, quando] of [
      [um, DIA_10],
      [dois, DIA_25],
      [tres, DIA_10],
    ] as const) {
      const r = await emC((tx) => concluir(tx, id, { de: "agendado", formaPagamentoId: pix }, quando));
      if (!r.ok) throw new Error(JSON.stringify(r.erros));
    }
    await emC((tx) => desfazerConclusao(tx, tres, "Cobrado duas vezes"));
  });

  it("o dia soma só as receitas pagas não canceladas", async () => {
    expect(await emC((tx) => recebidoNoPeriodo(tx, "2026-11-10", "2026-11-11"))).toEqual({
      totalCentavos: 6000,
      quantidade: 2,
    });
  });

  it("o mês soma só as receitas não canceladas e conta os atendimentos concluídos", async () => {
    expect(await emC((tx) => recebidoNoPeriodo(tx, "2026-11-01", "2026-12-01"))).toEqual({
      totalCentavos: 9000,
      quantidade: 3,
    });
    const fuso = "America/Sao_Paulo";
    expect(
      await emC((tx) => contarConcluidos(tx, inicioDoDia("2026-11-01", fuso), inicioDoDia("2026-12-01", fuso))),
    ).toBe(2);
    expect(await emC((tx) => recebidoNoPeriodo(tx, "2026-12-01", "2027-01-01"))).toEqual({
      totalCentavos: 0,
      quantidade: 0,
    });
  });

  it("a lista traz as válidas, da mais recente, com o pet, e as canceladas à parte com o motivo", async () => {
    const { validas, canceladas } = await emC((tx) => listarReceitasDoPeriodo(tx, "2026-11-01", "2026-12-01"));
    expect(validas.map((r) => [r.data, r.valorCentavos, r.forma, r.petNome])).toEqual([
      ["2026-11-25", 3000, "Pix", "Pet Conclusão C"],
      ["2026-11-10", 5000, "Pix", "Pet Conclusão C"],
      ["2026-11-10", 1000, "Pix", null],
    ]);
    expect(canceladas.map((r) => [r.data, r.valorCentavos, r.motivoCancelamento])).toEqual([
      ["2026-11-10", 2000, "Cobrado duas vezes"],
    ]);
  });

  it("a empresa A não vê o resumo de C", async () => {
    const { validas } = await emA((tx) => listarReceitasDoPeriodo(tx, "2026-11-01", "2026-12-01"));
    expect(validas.every((r) => r.petNome !== "Pet Conclusão C")).toBe(true);
    const deC = await emA((tx) => tx.select().from(lancamento).where(eq(lancamento.empresaId, c.empresaId)));
    expect(deC).toEqual([]);
  });
});
