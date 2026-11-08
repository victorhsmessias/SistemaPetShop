import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bancoPlataforma, encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { apagarEmpresas, criarEmpresaComDados, usuarioTeste, type DadosEmpresa } from "@/db/testes/apoio";
import {
  agendar,
  buscarPetsParaAgendar,
  editarHorario,
  editarItens,
  editarObservacoes,
  listarAgenda,
  mudarStatus,
  obterAtendimento,
  type EntradaItem,
} from "@/modules/agenda/atendimentos";
import { auditoria } from "@/modules/auditoria/schema";
import { criarPet, definirPetAtivo } from "@/modules/cadastros/pets";
import { criarTutor } from "@/modules/cadastros/tutores";
import { criarServico, definirServicoAtivo } from "@/modules/catalogo/servicos";
import { empresa } from "@/modules/empresas/schema";

// Operações da agenda contra o Postgres de verdade. A empresa A fica em Manaus (UTC-4), para provar que
// as datas seguem o fuso da empresa, e não o do servidor nem o de São Paulo.

let a: DadosEmpresa;
let b: DadosEmpresa;
let rexId: string;
let petInativoId: string;
let banhoId: string;
let tosaId: string;
let hidratacaoId: string;
let inativoId: string;

const DIA = "2026-11-20";

const naEmpresa =
  (empresaDe: () => DadosEmpresa) =>
  <T>(fn: Parameters<typeof comEmpresa<T>>[2]) =>
    comEmpresa(empresaDe().empresaId, usuarioTeste, fn);
const emA = naEmpresa(() => a);
const emB = naEmpresa(() => b);

function valorDe<T>(resultado: { ok: boolean; valor?: T }): T {
  if (!resultado.ok || !resultado.valor) throw new Error(`esperava ok: ${JSON.stringify(resultado)}`);
  return resultado.valor;
}

const item = (servicoId: string, preco: string, duracao: string): EntradaItem => ({ servicoId, preco, duracao });

/** Agenda o Rex sem se importar com aviso de horário (cada teste usa um horário só dele). */
async function agendarRex(hora: string, itens: EntradaItem[] = [item(banhoId, "50,00", "60")], dia = DIA) {
  const resultado = await emA((tx) => agendar(tx, { petId: rexId, dia, hora, itens }));
  return valorDe(resultado).id;
}

beforeAll(async () => {
  a = await criarEmpresaComDados("Agenda Operações A");
  b = await criarEmpresaComDados("Agenda Operações B");
  await bancoPlataforma().update(empresa).set({ fusoHorario: "America/Manaus" }).where(eq(empresa.id, a.empresaId));

  const tutorId = valorDe(await emA((tx) => criarTutor(tx, { nome: "Lúcia Andrade", telefone: "(92) 98877-6655" }))).id;
  rexId = valorDe(
    await emA((tx) => criarPet(tx, tutorId, { nome: "Rex", especie: "cao", porte: "G", observacoes: "Morde se assustado" })),
  ).id;
  petInativoId = valorDe(await emA((tx) => criarPet(tx, tutorId, { nome: "Zeca", especie: "cao", porte: "P" }))).id;
  await emA((tx) => definirPetAtivo(tx, petInativoId, false));

  banhoId = valorDe(await emA((tx) => criarServico(tx, { nome: "Banho G", preco: "60,00", duracao: "60" }))).id;
  tosaId = valorDe(await emA((tx) => criarServico(tx, { nome: "Tosa", preco: "40,00", duracao: "30" }))).id;
  hidratacaoId = valorDe(await emA((tx) => criarServico(tx, { nome: "Hidratação", preco: "25,00", duracao: "20" }))).id;
  inativoId = valorDe(await emA((tx) => criarServico(tx, { nome: "Perfume", preco: "5,00", duracao: "5" }))).id;
  await emA((tx) => definirServicoAtivo(tx, inativoId, false));
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

describe("agendar", () => {
  it("copia preço e duração (editados) para os itens e calcula o fim no fuso da empresa", async () => {
    const id = await agendarRex("09:00", [item(banhoId, "55,00", "60"), item(tosaId, "40,00", "45")]);
    const criado = await emA((tx) => obterAtendimento(tx, id));

    // 09:00 em Manaus (UTC-4) = 13:00 UTC; 60 + 45 min.
    expect(criado!.inicio.toISOString()).toBe("2026-11-20T13:00:00.000Z");
    expect(criado!.fim.toISOString()).toBe("2026-11-20T14:45:00.000Z");
    expect(criado!.status).toBe("agendado");
    expect(criado!.itens.map((i) => [i.descricao, i.precoCentavos, i.duracaoMin]).sort()).toEqual([
      ["Banho G", 5500, 60],
      ["Tosa", 4000, 45],
    ]);
  });

  it("sem serviço, sem pet ou com dia e hora inválidos é recusado, com mensagens por campo", async () => {
    const resultado = await emA((tx) => agendar(tx, { petId: "", dia: "2026-02-30", hora: "25:00", itens: [] }));
    expect(resultado).toEqual({
      ok: false,
      erros: {
        pet: "Escolha um pet ativo.",
        dia: "Informe o dia.",
        hora: "Informe a hora, por exemplo 09:30.",
        servicos: "Escolha pelo menos um serviço.",
      },
    });
  });

  it.each([["2101-01-01"], ["1999-12-31"], ["9999-12-31"]])(
    "dia %s, fora de 2000 a 2100, é recusado com a mensagem do limite, sem gravar",
    async (dia) => {
      const itens = [item(banhoId, "50,00", "60")];
      expect(await emA((tx) => agendar(tx, { petId: rexId, dia, hora: "09:00", itens }))).toEqual({
        ok: false,
        erros: { dia: "Use um dia entre 2000 e 2100." },
      });
    },
  );

  it("preço e duração inválidos apontam para o serviço certo", async () => {
    const resultado = await emA((tx) =>
      agendar(tx, { petId: rexId, dia: DIA, hora: "06:00", itens: [item(banhoId, "50.00", "0")] }),
    );
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.erros).toMatchObject({
      [`preco_${banhoId}`]: expect.stringContaining("vírgula"),
      [`duracao_${banhoId}`]: expect.stringContaining("duração"),
    });
  });

  it("pet e serviço desativados ficam fora do agendamento", async () => {
    expect((await emA((tx) => buscarPetsParaAgendar(tx, "zeca"))).map((p) => p.nome)).toEqual([]);
    expect((await emA((tx) => buscarPetsParaAgendar(tx, "lucia"))).map((p) => p.nome)).toEqual(["Rex"]);

    const comPetInativo = await emA((tx) =>
      agendar(tx, { petId: petInativoId, dia: DIA, hora: "05:00", itens: [item(banhoId, "1,00", "10")] }),
    );
    expect(!comPetInativo.ok && comPetInativo.erros.pet).toBe("Escolha um pet ativo.");

    const comServicoInativo = await emA((tx) =>
      agendar(tx, { petId: rexId, dia: DIA, hora: "05:00", itens: [item(inativoId, "5,00", "5")] }),
    );
    expect(!comServicoInativo.ok && comServicoInativo.erros.servicos).toBe('O serviço "Perfume" está desativado.');
  });

  it("acha o pet pelo nome dele ou do tutor, sem acento", async () => {
    expect((await emA((tx) => buscarPetsParaAgendar(tx, "REX"))).map((p) => [p.nome, p.tutorNome])).toEqual([
      ["Rex", "Lúcia Andrade"],
    ]);
    expect((await emA((tx) => buscarPetsParaAgendar(tx, "andrade"))).map((p) => p.nome)).toEqual(["Rex"]);
  });
});

describe("horário ocupado", () => {
  it("avisa sem bloquear: mostra quem ocupa e grava quando a dona confirma", async () => {
    await agendarRex("14:00", [item(banhoId, "50,00", "60")]);
    const entrada = { petId: rexId, dia: DIA, hora: "14:30", itens: [item(tosaId, "40,00", "30")] };

    const aviso = await emA((tx) => agendar(tx, entrada));
    expect(aviso).toMatchObject({
      ok: false,
      erros: {},
      conflitos: [{ petNome: "Rex", tutorNome: "Lúcia Andrade", horario: "14:00–15:00" }],
    });
    const horarioAvisado = "horarioAvisado" in aviso ? aviso.horarioAvisado : undefined;
    expect(horarioAvisado).toBeTruthy();

    const confirmado = await emA((tx) => agendar(tx, entrada, horarioAvisado));
    expect(confirmado.ok).toBe(true);
  });

  it("o aviso vale só para o horário avisado: mudou a hora, avisa de novo", async () => {
    await agendarRex("16:00");
    const aviso = await emA((tx) => agendar(tx, { petId: rexId, dia: DIA, hora: "16:15", itens: [item(tosaId, "1,00", "30")] }));
    const chave = "horarioAvisado" in aviso ? aviso.horarioAvisado : "";
    const outraHora = await emA((tx) =>
      agendar(tx, { petId: rexId, dia: DIA, hora: "16:20", itens: [item(tosaId, "1,00", "30")] }, chave),
    );
    expect("conflitos" in outraHora && outraHora.conflitos).toHaveLength(1);
  });

  it("encostar não ocupa; cancelados e faltas não ocupam", async () => {
    await agendarRex("18:00"); // 18:00–19:00
    const cancelado = await agendarRex("19:00"); // 19:00–20:00
    await emA((tx) => mudarStatus(tx, cancelado, "agendado", "cancelado"));
    const faltou = await agendarRex("19:30");
    await emA((tx) => mudarStatus(tx, faltou, "agendado", "faltou"));

    const resultado = await emA((tx) => agendar(tx, { petId: rexId, dia: DIA, hora: "19:00", itens: [item(tosaId, "1,00", "60")] }));
    expect(resultado.ok).toBe(true);
  });
});

describe("status", () => {
  it("anda até pronto e desfaz um passo de cada vez até agendado", async () => {
    const id = await agendarRex("07:00", [item(hidratacaoId, "25,00", "20")], "2026-11-21");
    const passo = async (de: string, para: string) => {
      const r = await emA((tx) => mudarStatus(tx, id, de, para));
      expect(r, `${de} → ${para}`).toMatchObject({ ok: true });
      return (await emA((tx) => obterAtendimento(tx, id)))!;
    };

    expect((await passo("agendado", "confirmado")).confirmadoEm).not.toBeNull();
    await passo("confirmado", "em_atendimento");
    expect((await passo("em_atendimento", "pronto")).status).toBe("pronto");

    await passo("pronto", "em_atendimento");
    expect((await passo("em_atendimento", "confirmado")).confirmadoEm).not.toBeNull();
    const desfeito = await passo("confirmado", "agendado");
    expect(desfeito).toMatchObject({ status: "agendado", confirmadoEm: null });
  });

  it("recusa pular etapas e status desconhecido", async () => {
    const id = await agendarRex("08:00", undefined, "2026-11-21");
    expect(await emA((tx) => mudarStatus(tx, id, "agendado", "pronto"))).toMatchObject({ ok: false });
    expect(await emA((tx) => mudarStatus(tx, id, "agendado", "concluido"))).toMatchObject({ ok: false });
    expect(await emA((tx) => mudarStatus(tx, id, "agendado", "sumiu"))).toEqual({
      ok: false,
      erros: { geral: "Status inválido." },
    });
  });

  it("toque duplo ou página desatualizada: o segundo toque não grava nada", async () => {
    const id = await agendarRex("10:00", undefined, "2026-11-21");
    expect((await emA((tx) => mudarStatus(tx, id, "agendado", "confirmado"))).ok).toBe(true);
    // A tela ainda mostrava "agendado": o segundo toque em "Começar" não pode valer.
    const segundo = await emA((tx) => mudarStatus(tx, id, "agendado", "em_atendimento"));
    expect(segundo).toMatchObject({ ok: false, erros: { geral: expect.stringContaining("acabou de ser alterado") } });
    expect((await emA((tx) => obterAtendimento(tx, id)))!.status).toBe("confirmado");
  });

  it("reabrir um cancelado volta para confirmado se o tutor já tinha confirmado; uma falta sem confirmação, para agendado", async () => {
    const confirmado = await agendarRex("12:00", undefined, "2026-11-21");
    await emA((tx) => mudarStatus(tx, confirmado, "agendado", "confirmado"));
    await emA((tx) => mudarStatus(tx, confirmado, "confirmado", "cancelado"));
    expect(await emA((tx) => mudarStatus(tx, confirmado, "cancelado", "agendado"))).toMatchObject({ ok: false });
    expect(await emA((tx) => mudarStatus(tx, confirmado, "cancelado", "confirmado"))).toMatchObject({ ok: true });

    const semConfirmar = await agendarRex("14:00", undefined, "2026-11-21");
    await emA((tx) => mudarStatus(tx, semConfirmar, "agendado", "faltou"));
    expect(await emA((tx) => mudarStatus(tx, semConfirmar, "faltou", "agendado"))).toMatchObject({ ok: true });
  });

  it("a auditoria registra cada mudança com o autor da transação", async () => {
    const id = await agendarRex("16:00", undefined, "2026-11-21");
    await emA((tx) => mudarStatus(tx, id, "agendado", "confirmado"));
    await emA((tx) => mudarStatus(tx, id, "confirmado", "agendado"));
    const eventos = await emA((tx) =>
      tx
        .select()
        .from(auditoria)
        .where(and(eq(auditoria.tabela, "atendimento"), eq(auditoria.registroId, id)))
        .orderBy(auditoria.id),
    );
    expect(
      eventos.map((e) => [
        e.acao,
        e.usuarioId,
        (e.antes as { status?: string } | null)?.status ?? null,
        (e.depois as { status: string }).status,
      ]),
    ).toEqual([
      ["criou", usuarioTeste, null, "agendado"],
      ["alterou", usuarioTeste, "agendado", "confirmado"],
      ["alterou", usuarioTeste, "confirmado", "agendado"],
    ]);
  });
});

describe("serviços, horário e observações do atendimento", () => {
  it("trocar os serviços altera, insere, apaga e recalcula o fim", async () => {
    const id = await agendarRex("07:00", [item(banhoId, "60,00", "60"), item(tosaId, "40,00", "30")], "2026-11-22");
    const resultado = await emA((tx) =>
      editarItens(tx, id, [item(banhoId, "70,00", "50"), item(hidratacaoId, "25,00", "20")]),
    );
    expect(resultado.ok).toBe(true);

    const depois = (await emA((tx) => obterAtendimento(tx, id)))!;
    expect(depois.itens.map((i) => [i.descricao, i.precoCentavos, i.duracaoMin]).sort()).toEqual([
      ["Banho G", 7000, 50],
      ["Hidratação", 2500, 20],
    ]);
    // 07:00 Manaus = 11:00 UTC; 50 + 20 min.
    expect(depois.fim.toISOString()).toBe("2026-11-22T12:10:00.000Z");

    const remocoes = await emA((tx) =>
      tx.select().from(auditoria).where(and(eq(auditoria.tabela, "atendimento_item"), eq(auditoria.acao, "removeu"))),
    );
    expect(remocoes.some((r) => (r.antes as { descricao: string }).descricao === "Tosa")).toBe(true);
  });

  it("o fim pode ser ajustado à mão e volta a ser recalculado quando os serviços mudam", async () => {
    const id = await agendarRex("09:00", [item(banhoId, "60,00", "60")], "2026-11-22");
    const ajuste = await emA((tx) => editarHorario(tx, id, { dia: "2026-11-22", hora: "09:30", termino: "11:00" }));
    expect(ajuste.ok).toBe(true);
    let atual = (await emA((tx) => obterAtendimento(tx, id)))!;
    expect([atual.inicio.toISOString(), atual.fim.toISOString()]).toEqual([
      "2026-11-22T13:30:00.000Z",
      "2026-11-22T15:00:00.000Z",
    ]);

    await emA((tx) => editarItens(tx, id, [item(banhoId, "60,00", "45")]));
    atual = (await emA((tx) => obterAtendimento(tx, id)))!;
    expect(atual.fim.toISOString()).toBe("2026-11-22T14:15:00.000Z");
  });

  it("mudar o horário para um dia fora de 2000 a 2100 é recusado com a mensagem do limite", async () => {
    const id = await agendarRex("08:00", undefined, "2026-11-23");
    const antes = (await emA((tx) => obterAtendimento(tx, id)))!;
    expect(await emA((tx) => editarHorario(tx, id, { dia: "2101-01-01", hora: "08:00", termino: "09:00" }))).toEqual({
      ok: false,
      erros: { dia: "Use um dia entre 2000 e 2100." },
    });
    const depois = (await emA((tx) => obterAtendimento(tx, id)))!;
    expect([depois.inicio, depois.fim]).toEqual([antes.inicio, antes.fim]);
  });

  it("término antes do início é recusado", async () => {
    const id = await agendarRex("11:30", undefined, "2026-11-22");
    expect(await emA((tx) => editarHorario(tx, id, { dia: "2026-11-22", hora: "11:30", termino: "11:30" }))).toEqual({
      ok: false,
      erros: { termino: "O término precisa ser depois do início, no mesmo dia." },
    });
  });

  it("ficar sem nenhum serviço é recusado", async () => {
    const id = await agendarRex("13:00", undefined, "2026-11-22");
    expect(await emA((tx) => editarItens(tx, id, []))).toEqual({
      ok: false,
      erros: { servicos: "Escolha pelo menos um serviço." },
    });
  });

  it("um serviço desativado depois continua aceito no atendimento que já o tinha", async () => {
    const extra = valorDe(await emA((tx) => criarServico(tx, { nome: "Escovação", preco: "10,00", duracao: "10" }))).id;
    const id = await agendarRex("15:00", [item(extra, "10,00", "10")], "2026-11-22");
    await emA((tx) => definirServicoAtivo(tx, extra, false));
    expect((await emA((tx) => editarItens(tx, id, [item(extra, "12,00", "10")]))).ok).toBe(true);
    expect(await emA((tx) => editarItens(tx, id, [item(extra, "12,00", "10"), item(inativoId, "5,00", "5")]))).toEqual({
      ok: false,
      erros: { servicos: 'O serviço "Perfume" está desativado.' },
    });
  });

  it("depois de cancelar, itens e horário não mudam; observações sim; reaberto, volta a mudar", async () => {
    const id = await agendarRex("17:00", undefined, "2026-11-22");
    await emA((tx) => mudarStatus(tx, id, "agendado", "cancelado"));

    expect(await emA((tx) => editarItens(tx, id, [item(tosaId, "1,00", "30")]))).toMatchObject({
      ok: false,
      erros: { geral: expect.stringContaining('"Cancelado" e não pode mudar') },
    });
    expect(await emA((tx) => editarHorario(tx, id, { dia: "2026-11-22", hora: "18:00", termino: "19:00" }))).toMatchObject({
      ok: false,
    });
    expect((await emA((tx) => editarObservacoes(tx, id, "Tutor desmarcou por mensagem"))).ok).toBe(true);
    expect((await emA((tx) => obterAtendimento(tx, id)))!.itens.map((i) => i.descricao)).toEqual(["Banho G"]);

    await emA((tx) => mudarStatus(tx, id, "cancelado", "agendado"));
    expect((await emA((tx) => editarItens(tx, id, [item(tosaId, "1,00", "30")]))).ok).toBe(true);
  });
});

describe("agenda do dia no fuso da empresa", () => {
  it("um atendimento às 23:30 de Manaus é do dia dele, não do dia seguinte em UTC", async () => {
    const id = await agendarRex("23:30", [item(tosaId, "40,00", "20")], "2026-11-23");
    const doDia = await emA((tx) => listarAgenda(tx, "2026-11-23"));
    const doSeguinte = await emA((tx) => listarAgenda(tx, "2026-11-24"));
    expect(doDia.fuso).toBe("America/Manaus");
    expect(doDia.atendimentos.map((x) => x.id)).toContain(id);
    expect(doSeguinte.atendimentos.map((x) => x.id)).not.toContain(id);
  });

  it("a semana traz os sete dias a partir da segunda", async () => {
    const semana = await emA((tx) => listarAgenda(tx, "2026-11-16", 7));
    const dias = new Set(semana.atendimentos.map((x) => x.inicio.toISOString().slice(0, 10)));
    expect([...dias].every((d) => d >= "2026-11-16" && d <= "2026-11-23")).toBe(true);
    expect(semana.atendimentos.length).toBeGreaterThan(5);
  });
});

describe("isolamento pelas operações", () => {
  it("A não vê nem altera o atendimento de B pelo id", async () => {
    expect(await emA((tx) => obterAtendimento(tx, b.atendimentoId))).toBeNull();
    expect(await emA((tx) => mudarStatus(tx, b.atendimentoId, "agendado", "cancelado"))).toEqual({
      ok: false,
      erros: { geral: "Atendimento não encontrado." },
    });
    expect(await emA((tx) => editarItens(tx, b.atendimentoId, [item(banhoId, "1,00", "10")]))).toMatchObject({ ok: false });
    expect(
      await emA((tx) => editarHorario(tx, b.atendimentoId, { dia: DIA, hora: "10:00", termino: "11:00" })),
    ).toMatchObject({ ok: false });
    expect(await emA((tx) => editarObservacoes(tx, b.atendimentoId, "invasão"))).toMatchObject({ ok: false });

    const deB = await emB((tx) => obterAtendimento(tx, b.atendimentoId));
    expect(deB).toMatchObject({ status: "agendado", observacoes: null });
    expect(deB!.itens).toHaveLength(1);
  });

  it("A não agenda para o pet de B nem usa o serviço de B", async () => {
    const paraPetDeB = await emA((tx) =>
      agendar(tx, { petId: b.petId, dia: DIA, hora: "05:00", itens: [item(banhoId, "1,00", "10")] }),
    );
    expect(!paraPetDeB.ok && paraPetDeB.erros.pet).toBe("Escolha um pet ativo.");

    const comServicoDeB = await emA((tx) =>
      agendar(tx, { petId: rexId, dia: DIA, hora: "05:00", itens: [item(b.servicoId, "1,00", "10")] }),
    );
    expect(!comServicoDeB.ok && comServicoDeB.erros.servicos).toBe("Serviço não encontrado.");
  });

  it("ids malformados voltam como não encontrado", async () => {
    expect(await emA((tx) => obterAtendimento(tx, "1 or 1=1"))).toBeNull();
    expect(await emA((tx) => mudarStatus(tx, "x", "agendado", "confirmado"))).toMatchObject({ ok: false });
    expect(await emA((tx) => editarItens(tx, a.atendimentoId, [item("x", "1,00", "10")]))).toEqual({
      ok: false,
      erros: { servicos: "Serviço não encontrado." },
    });
  });
});
