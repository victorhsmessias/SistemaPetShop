import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import {
  apagarEmpresas,
  apagarUsuarias,
  criarDona,
  criarEmpresaComDados,
  emailTeste,
  entrar,
  usuarioTeste,
  type DadosEmpresa,
} from "@/db/testes/apoio";
import { auth } from "@/modules/acesso/auth";
import { listarAgenda, obterAtendimento } from "@/modules/agenda/atendimentos";
import { MENSAGEM_JA_CONCLUIDO, MENSAGEM_NAO_CONCLUIDO } from "@/modules/agenda/conclusao";
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import { auditoria } from "@/modules/auditoria/schema";
import { criarServico } from "@/modules/catalogo/servicos";
import { lancamento } from "@/modules/financeiro/schema";

// As Server Actions da agenda, chamadas diretamente, como um atacante faria sem passar pela tela.
// Só a leitura dos cabeçalhos da requisição e a revalidação de cache do Next são substituídas;
// sessão, RLS e banco são os de verdade.
const requisicao = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requisicao.cookie ? { cookie: requisicao.cookie } : {}),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => cache);

const {
  agendarAcao,
  concluirAcao,
  desfazerConclusaoAcao,
  editarHorarioAcao,
  editarObservacoesAcao,
  editarServicosAcao,
  mudarStatusAcao,
} = await import("@/app/(dona)/agenda/acoes");
const { salvarPetAcao, salvarTutorAcao } = await import("@/app/(dona)/acoes");
const { default: PaginaAtendimento } = await import("@/app/(dona)/agenda/[id]/page");

const SENHA = "senha-de-teste-123";
// Cada teste cria os próprios atendimentos, e os que leem a agenda de um dia usam um dia só deles.
const DIA = "2026-12-01";
const DIA_SEM_SESSAO = "2026-12-21";
const DIA_OCUPADO = "2026-12-02";
let a: DadosEmpresa;
let b: DadosEmpresa;
let donaAId: string;
let cookieDonaA: string;
let cookieAdmin: string;
let emailAdmin: string;
let tosaId: string;
const vazio = { erros: {}, valores: {}, servicos: [] };

function formulario(campos: Record<string, string | string[]>): FormData {
  const dados = new FormData();
  for (const [campo, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) dados.append(campo, v);
  }
  return dados;
}

/** O redirect do Next é uma exceção com o destino no digest. */
async function destinoDoRedirect(acao: Promise<unknown>): Promise<string> {
  const erro = await acao.then(
    () => null,
    (e: unknown) => e,
  );
  const digest = (erro as { digest?: string } | null)?.digest ?? "";
  expect(digest, "a ação deveria redirecionar").toMatch(/^NEXT_REDIRECT;/);
  return digest.split(";")[2]!;
}

const daEmpresa = <T>(dados: DadosEmpresa, fn: Parameters<typeof comEmpresa<T>>[2]) =>
  comEmpresa(dados.empresaId, usuarioTeste, fn);

/** Formulário de agendamento do pet de A com banho (do apoio) e tosa. */
function agendamento(hora: string, extra: Record<string, string> = {}) {
  return formulario({
    petId: a.petId,
    dia: DIA,
    hora,
    servico: [a.servicoId, tosaId],
    [`preco_${a.servicoId}`]: "55,00",
    [`duracao_${a.servicoId}`]: "60",
    [`preco_${tosaId}`]: "40,00",
    [`duracao_${tosaId}`]: "30",
    ...extra,
  });
}

const semMotivo = { erros: {}, motivo: "" };

/** Formulário do botão de uma forma de pagamento: status e total que a tela mostrava (o apoio cobra R$ 50,00). */
function conclusao(id: string, formaPagamentoId: string, de = "agendado", total = "5000") {
  return formulario({ id, de, total, formaPagamentoId });
}

function receitasDoAtendimento(dados: DadosEmpresa, atendimentoId: string) {
  return daEmpresa(dados, (tx) =>
    tx
      .select()
      .from(lancamento)
      .where(eq(lancamento.atendimentoId, atendimentoId))
      .orderBy(asc(lancamento.criadoEm), asc(lancamento.id)),
  );
}

async function idsDoDia(dados: DadosEmpresa, dia = DIA) {
  return (await daEmpresa(dados, (tx) => listarAgenda(tx, dia))).atendimentos;
}

/** Atendimento agendado do pet de A com um item (banho de R$ 50,00 por padrão), gravado direto no banco. */
async function novoAtendimentoDeA({
  inicio = "2026-12-10T13:00:00Z",
  minutos = 60,
  precoCentavos = 5000,
}: { inicio?: string; minutos?: number; precoCentavos?: number } = {}): Promise<string> {
  return daEmpresa(a, async (tx) => {
    const comeco = new Date(inicio);
    const [at] = await tx
      .insert(atendimento)
      .values({ petId: a.petId, inicio: comeco, fim: new Date(comeco.getTime() + minutos * 60_000) })
      .returning({ id: atendimento.id });
    await tx
      .insert(atendimentoItem)
      .values({ atendimentoId: at!.id, servicoId: a.servicoId, descricao: "Banho", precoCentavos, duracaoMin: minutos });
    return at!.id;
  });
}

/** O texto de uma árvore JSX devolvida por uma página do servidor (componentes do cliente entram sem texto). */
function textoDe(no: unknown): string {
  if (no === null || no === undefined || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join("");
  const props = (no as { props?: { children?: unknown } }).props;
  return props ? textoDe(props.children) : "";
}

beforeAll(async () => {
  a = await criarEmpresaComDados("Agenda Ações A");
  b = await criarEmpresaComDados("Agenda Ações B");
  const emailDona = emailTeste("dona-agenda-a");
  donaAId = await criarDona(a.empresaId, emailDona, SENHA);
  cookieDonaA = await entrar(emailDona, SENHA);
  const tosa = await daEmpresa(a, (tx) => criarServico(tx, { nome: "Tosa", preco: "40,00", duracao: "30" }));
  tosaId = tosa.ok ? tosa.valor.id : "";

  emailAdmin = emailTeste("admin-agenda");
  await auth.api.createUser({ body: { email: emailAdmin, password: SENHA, name: "Admin", role: "admin" } });
  cookieAdmin = await entrar(emailAdmin, SENHA);
});

beforeEach(() => {
  requisicao.cookie = "";
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await apagarUsuarias([emailAdmin].filter(Boolean));
  await encerrarConexoes();
});

describe("sem sessão, toda ação da agenda é recusada e manda para o login", () => {
  it.each([
    ["agendarAcao", () => agendarAcao(vazio, agendamento("09:00"))],
    ["mudarStatusAcao", () => mudarStatusAcao({}, formulario({ id: "", de: "agendado", para: "confirmado" }))],
    ["editarServicosAcao", () => editarServicosAcao(vazio, formulario({ id: "", servico: [] }))],
    ["editarHorarioAcao", () => editarHorarioAcao(vazio, formulario({ id: "", dia: DIA, hora: "09:00", termino: "10:00" }))],
    ["editarObservacoesAcao", () => editarObservacoesAcao(vazio, formulario({ id: "", observacoes: "x" }))],
    ["concluirAcao", () => concluirAcao({}, conclusao(a.atendimentoId, a.formaPagamentoId))],
    ["desfazerConclusaoAcao", () => desfazerConclusaoAcao(semMotivo, formulario({ id: a.atendimentoId, motivo: "x" }))],
  ])("%s", async (_nome, chamar) => {
    expect(await destinoDoRedirect(chamar())).toBe("/login");
  });

  it("e nada é agendado", async () => {
    await destinoDoRedirect(agendarAcao(vazio, agendamento("06:00", { dia: DIA_SEM_SESSAO })));
    expect(await idsDoDia(a, DIA_SEM_SESSAO)).toEqual([]);
  });

  it("e nada é concluído", async () => {
    const id = await novoAtendimentoDeA();
    await destinoDoRedirect(concluirAcao({}, conclusao(id, a.formaPagamentoId)));
    expect(await receitasDoAtendimento(a, id)).toEqual([]);
    expect((await daEmpresa(a, (tx) => obterAtendimento(tx, id)))!.status).toBe("agendado");
  });

  it("o administrador é mandado para /admin, sem agendar nem concluir", async () => {
    const id = await novoAtendimentoDeA();
    requisicao.cookie = cookieAdmin;
    expect(await destinoDoRedirect(agendarAcao(vazio, agendamento("06:00", { dia: DIA_SEM_SESSAO })))).toBe("/admin");
    expect(await destinoDoRedirect(concluirAcao({}, conclusao(id, a.formaPagamentoId)))).toBe("/admin");
    expect(await idsDoDia(a, DIA_SEM_SESSAO)).toEqual([]);
    expect((await daEmpresa(a, (tx) => obterAtendimento(tx, id)))!.status).toBe("agendado");
    expect(await receitasDoAtendimento(a, id)).toEqual([]);
  });

  it("nem sem sessão nem como administrador a conclusão é desfeita: continua concluido, com a receita paga", async () => {
    const id = await novoAtendimentoDeA();
    requisicao.cookie = cookieDonaA;
    expect(await concluirAcao({}, conclusao(id, a.formaPagamentoId))).toEqual({});

    const continuaConcluido = async () => {
      expect((await daEmpresa(a, (tx) => obterAtendimento(tx, id)))!.status).toBe("concluido");
      expect((await receitasDoAtendimento(a, id)).map((r) => [r.status, r.motivoCancelamento])).toEqual([["pago", null]]);
    };
    await continuaConcluido();

    requisicao.cookie = "";
    expect(await destinoDoRedirect(desfazerConclusaoAcao(semMotivo, formulario({ id, motivo: "sem sessão" })))).toBe(
      "/login",
    );
    await continuaConcluido();

    requisicao.cookie = cookieAdmin;
    expect(await destinoDoRedirect(desfazerConclusaoAcao(semMotivo, formulario({ id, motivo: "administrador" })))).toBe(
      "/admin",
    );
    await continuaConcluido();
  });
});

describe("a dona da empresa A, pelas ações da agenda", () => {
  beforeEach(() => {
    requisicao.cookie = cookieDonaA;
  });

  it("agenda com dois serviços e vai para a agenda do dia; a mudança de status fica na auditoria com ela como autora", async () => {
    expect(await destinoDoRedirect(agendarAcao(vazio, agendamento("09:00")))).toBe(`/agenda?dia=${DIA}`);
    const [criado] = await idsDoDia(a);
    // 09:00 em São Paulo (fuso padrão da empresa) = 12:00 UTC; 60 + 30 min.
    expect([criado!.inicio.toISOString(), criado!.fim.toISOString()]).toEqual([
      "2026-12-01T12:00:00.000Z",
      "2026-12-01T13:30:00.000Z",
    ]);
    expect(criado!.itens.map((i) => i.precoCentavos).sort()).toEqual([4000, 5500]);

    expect(await mudarStatusAcao({}, formulario({ id: criado!.id, de: "agendado", para: "confirmado" }))).toEqual({});
    const eventos = await daEmpresa(a, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(and(eq(auditoria.tabela, "atendimento"), eq(auditoria.registroId, criado!.id)))
        .orderBy(auditoria.id),
    );
    expect(eventos.map((e) => [e.acao, e.usuarioId, (e.depois as { status: string }).status])).toEqual([
      ["criou", donaAId, "agendado"],
      ["alterou", donaAId, "confirmado"],
    ]);
  });

  it("toque errado: desfaz a confirmação; status desatualizado volta com mensagem", async () => {
    const id = await novoAtendimentoDeA();
    expect(await mudarStatusAcao({}, formulario({ id, de: "agendado", para: "confirmado" }))).toEqual({});
    expect(await mudarStatusAcao({}, formulario({ id, de: "confirmado", para: "agendado" }))).toEqual({});
    cache.refresh.mockClear();
    const repetido = await mudarStatusAcao({}, formulario({ id, de: "confirmado", para: "agendado" }));
    expect(repetido.aviso).toContain("acabou de ser alterado");
    expect((await daEmpresa(a, (tx) => obterAtendimento(tx, id)))!.status).toBe("agendado");
    // A tela desatualizada é re-renderizada na mesma resposta, com o status atual (B1).
    expect(cache.refresh).toHaveBeenCalledTimes(1);
  });

  it("horário ocupado volta como aviso, com os dados digitados; confirmado, agenda", async () => {
    // 09:00–10:30 em São Paulo (fuso padrão da empresa).
    await novoAtendimentoDeA({ inicio: `${DIA_OCUPADO}T12:00:00Z`, minutos: 90 });
    const aviso = await agendarAcao(vazio, agendamento("10:00", { dia: DIA_OCUPADO, observacoes: "Chega mais cedo" }));
    expect(aviso.conflitos).toEqual([expect.objectContaining({ horario: "09:00–10:30", petNome: "Pet Agenda Ações A" })]);
    expect(aviso.valores).toMatchObject({ hora: "10:00", observacoes: "Chega mais cedo", [`preco_${tosaId}`]: "40,00" });
    expect(aviso.servicos).toEqual([a.servicoId, tosaId]);

    const destino = await destinoDoRedirect(
      agendarAcao(aviso, agendamento("10:00", { dia: DIA_OCUPADO, horarioAvisado: aviso.horarioAvisado! })),
    );
    expect(destino).toBe(`/agenda?dia=${DIA_OCUPADO}`);
    expect(await idsDoDia(a, DIA_OCUPADO)).toHaveLength(2);
  });

  it("erros voltam por campo, sem perder o que foi digitado", async () => {
    const estado = await agendarAcao(
      vazio,
      formulario({ petId: a.petId, dia: DIA, hora: "", servico: [tosaId], [`preco_${tosaId}`]: "40.00", [`duracao_${tosaId}`]: "30" }),
    );
    expect(estado.erros).toMatchObject({ hora: expect.any(String), [`preco_${tosaId}`]: expect.stringContaining("vírgula") });
    expect(estado.valores).toMatchObject({ [`preco_${tosaId}`]: "40.00", dia: DIA });
    expect(estado.servicos).toEqual([tosaId]);
  });

  it("não agenda para o pet da B, nem com o empresa_id da B no formulário", async () => {
    const estado = await agendarAcao(
      vazio,
      formulario({
        petId: b.petId,
        empresaId: b.empresaId,
        dia: DIA,
        hora: "15:00",
        servico: [b.servicoId],
        [`preco_${b.servicoId}`]: "1,00",
        [`duracao_${b.servicoId}`]: "10",
      }),
    );
    expect(estado.erros).toMatchObject({ pet: "Escolha um pet ativo.", servicos: "Serviço não encontrado." });
    expect(await idsDoDia(b)).toEqual([]);
  });

  it("não muda status, serviços, horário nem observações do atendimento da B, e não apaga o item dele", async () => {
    const status = await mudarStatusAcao({}, formulario({ id: b.atendimentoId, de: "agendado", para: "cancelado" }));
    expect(status.aviso).toBe("Atendimento não encontrado.");

    // Trocar os serviços apagaria o item atual da B, se a troca passasse.
    const servicos = await editarServicosAcao(
      vazio,
      formulario({ id: b.atendimentoId, servico: [tosaId], [`preco_${tosaId}`]: "1,00", [`duracao_${tosaId}`]: "10" }),
    );
    expect(servicos.aviso).toBe("Atendimento não encontrado.");

    const horario = await editarHorarioAcao(
      vazio,
      formulario({ id: b.atendimentoId, dia: DIA, hora: "08:00", termino: "09:00" }),
    );
    expect(horario.aviso).toBe("Atendimento não encontrado.");

    const observacoes = await editarObservacoesAcao(vazio, formulario({ id: b.atendimentoId, observacoes: "invasão" }));
    expect(observacoes.erros.geral).toBe("Atendimento não encontrado.");

    const deB = await daEmpresa(b, (tx) => obterAtendimento(tx, b.atendimentoId));
    expect(deB).toMatchObject({ status: "agendado", observacoes: null });
    expect(deB!.itens.map((i) => i.id)).toEqual([b.itemId]);
    expect(deB!.inicio.toISOString()).toBe("2026-11-10T13:00:00.000Z");
  });
});

describe("a dona conclui e desfaz a conclusão pelas ações", () => {
  beforeEach(() => {
    requisicao.cookie = cookieDonaA;
  });

  it("conclui com a forma tocada; o segundo toque recebe a mensagem; desfazer pede o motivo e cancela a receita", async () => {
    const id = await novoAtendimentoDeA();
    expect(await concluirAcao({}, conclusao(id, a.formaPagamentoId))).toEqual({});
    expect(await concluirAcao({}, conclusao(id, a.formaPagamentoId))).toEqual({ aviso: MENSAGEM_JA_CONCLUIDO });
    const [receita, ...outras] = await receitasDoAtendimento(a, id);
    expect(outras).toEqual([]);
    expect(receita).toMatchObject({ status: "pago", valorCentavos: 5000, formaPagamentoId: a.formaPagamentoId });

    expect(await desfazerConclusaoAcao(semMotivo, formulario({ id, motivo: " " }))).toEqual({
      erros: { motivo: "Informe o motivo: ele fica no cancelamento da receita." },
      motivo: " ",
    });
    expect(await desfazerConclusaoAcao(semMotivo, formulario({ id, motivo: "Forma errada" }))).toEqual(semMotivo);
    expect((await receitasDoAtendimento(a, id))[0]).toMatchObject({
      status: "cancelado",
      motivoCancelamento: "Forma errada",
    });

    // Conclusão e desfazer na auditoria, no atendimento e no lançamento, com a dona como autora.
    const eventos = await daEmpresa(a, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(and(inArray(auditoria.tabela, ["atendimento", "lancamento"]), inArray(auditoria.registroId, [id, receita!.id])))
        .orderBy(auditoria.id),
    );
    expect(eventos.filter((e) => e.acao === "alterou" || e.tabela === "lancamento").map((e) => [
      e.tabela,
      e.acao,
      e.usuarioId,
      (e.depois as { status: string }).status,
    ])).toEqual([
      ["atendimento", "alterou", donaAId, "concluido"],
      ["lancamento", "criou", donaAId, "pago"],
      ["atendimento", "alterou", donaAId, "agendado"],
      ["lancamento", "alterou", donaAId, "cancelado"],
    ]);
  });

  it("total diferente do que a tela mostrava volta com mensagem, sem concluir", async () => {
    const id = await novoAtendimentoDeA();
    cache.refresh.mockClear();
    const r = await concluirAcao({}, conclusao(id, a.formaPagamentoId, "agendado", "1"));
    expect(r.aviso).toMatch(/O total mudou para R\$\s50,00/);
    // A tela é re-renderizada com o total atual (B1).
    expect(cache.refresh).toHaveBeenCalledTimes(1);
    expect(await receitasDoAtendimento(a, id)).toEqual([]);
    expect((await daEmpresa(a, (tx) => obterAtendimento(tx, id)))!.status).toBe("agendado");
  });

  it("recusas por estado atualizam a tela (B1); as de campo mantêm o que foi digitado, sem atualizar", async () => {
    const cancelado = await novoAtendimentoDeA({ inicio: "2026-12-11T13:00:00Z" });
    expect(await mudarStatusAcao({}, formulario({ id: cancelado, de: "agendado", para: "cancelado" }))).toEqual({});

    // Serviços e horário de um atendimento cancelado em outra tela: aviso e refresh.
    cache.refresh.mockClear();
    const servicos = await editarServicosAcao(
      vazio,
      formulario({ id: cancelado, servico: [tosaId], [`preco_${tosaId}`]: "40,00", [`duracao_${tosaId}`]: "30" }),
    );
    expect(servicos.aviso).toContain('está "Cancelado" e não pode mudar');
    expect(servicos.erros).toEqual({});
    const horario = await editarHorarioAcao(vazio, formulario({ id: cancelado, dia: DIA, hora: "08:00", termino: "09:00" }));
    expect(horario.aviso).toContain('está "Cancelado" e não pode mudar');
    expect(cache.refresh).toHaveBeenCalledTimes(2);

    // Desfazer a conclusão de um atendimento que já não está concluído (desfeita em outra tela): aviso e refresh.
    cache.refresh.mockClear();
    const ativo = await novoAtendimentoDeA({ inicio: "2026-12-12T13:00:00Z" });
    expect(await desfazerConclusaoAcao(semMotivo, formulario({ id: ativo, motivo: "x" }))).toEqual({
      erros: {},
      aviso: MENSAGEM_NAO_CONCLUIDO,
      motivo: "x",
    });
    expect(cache.refresh).toHaveBeenCalledTimes(1);

    // Erros de campo: voltam no formulário, sem aviso e sem refresh.
    cache.refresh.mockClear();
    const semServico = await editarServicosAcao(vazio, formulario({ id: ativo, servico: [] }));
    expect(semServico).toMatchObject({ erros: { servicos: "Escolha pelo menos um serviço." } });
    expect(semServico.aviso).toBeUndefined();
    const terminoAntes = await editarHorarioAcao(vazio, formulario({ id: ativo, dia: DIA, hora: "10:00", termino: "09:00" }));
    expect(terminoAntes.erros.termino).toContain("depois do início");
    expect(terminoAntes.aviso).toBeUndefined();
    expect(await concluirAcao({}, conclusao(ativo, ""))).toEqual({ erro: "Escolha uma forma de pagamento." });
    await concluirAcao({}, conclusao(ativo, a.formaPagamentoId));
    expect(await desfazerConclusaoAcao(semMotivo, formulario({ id: ativo, motivo: "" }))).toEqual({
      erros: { motivo: "Informe o motivo: ele fica no cancelamento da receita." },
      motivo: "",
    });
    expect(cache.refresh).not.toHaveBeenCalled();
  });

  it("total zero conclui sem forma de pagamento e sem lançamento, e a página avisa que não houve receita", async () => {
    const id = await novoAtendimentoDeA({ precoCentavos: 0 });
    expect(await concluirAcao({}, formulario({ id, de: "agendado", total: "0" }))).toEqual({});
    expect((await daEmpresa(a, (tx) => obterAtendimento(tx, id)))!.status).toBe("concluido");
    expect(await receitasDoAtendimento(a, id)).toEqual([]);

    const pagina = await PaginaAtendimento({ params: Promise.resolve({ id }) });
    expect(textoDe(pagina).replace(/\s/g, " ")).toContain("Concluído sem receita: o total era R$ 0,00.");
  });

  it("não conclui nem desfaz o atendimento da B, mesmo com os ids certos", async () => {
    expect(await concluirAcao({}, conclusao(b.atendimentoId, b.formaPagamentoId))).toEqual({
      aviso: "Atendimento não encontrado.",
    });
    expect(await desfazerConclusaoAcao(semMotivo, formulario({ id: b.atendimentoId, motivo: "x" }))).toEqual({
      erros: {},
      aviso: "Atendimento não encontrado.",
      motivo: "x",
    });
    // A forma de pagamento da B no atendimento da A também não passa.
    const deA = await novoAtendimentoDeA();
    expect(await concluirAcao({}, conclusao(deA, b.formaPagamentoId))).toEqual({
      erro: "Escolha uma forma de pagamento.",
    });
    expect(await receitasDoAtendimento(a, deA)).toEqual([]);
    const deB = await daEmpresa(b, (tx) => obterAtendimento(tx, b.atendimentoId));
    expect(deB!.status).toBe("agendado");
    expect(await receitasDoAtendimento(b, b.atendimentoId)).toEqual([]);
  });
});

describe("atalho: cadastrar tutor e pet e voltar para o agendamento", () => {
  beforeEach(() => {
    requisicao.cookie = cookieDonaA;
  });

  it("tutor novo segue para o pet, e o pet novo volta para o agendamento com ele escolhido", async () => {
    const paraPet = await destinoDoRedirect(
      salvarTutorAcao(
        { erros: {}, valores: {} },
        formulario({ nome: "Clara Nunes", telefone: "(11) 97777-1212", agendar: `${DIA}T14:30` }),
      ),
    );
    expect(paraPet).toMatch(new RegExp(`^/clientes/[0-9a-f-]{36}/pets/novo\\?agendar=${DIA}T14:30$`));
    const tutorId = paraPet.split("/")[2]!;

    const paraAgenda = await destinoDoRedirect(
      salvarPetAcao(
        { erros: {}, valores: {} },
        formulario({ tutorId, nome: "Mel", especie: "cao", porte: "P", agendar: `${DIA}T14:30` }),
      ),
    );
    expect(paraAgenda).toMatch(new RegExp(`^/agenda/novo\\?dia=${DIA}&hora=14%3A30&pet=[0-9a-f-]{36}$`));
  });

  it("um endereço no lugar do dia é ignorado: o cadastro segue o caminho normal", async () => {
    const destino = await destinoDoRedirect(
      salvarTutorAcao(
        { erros: {}, valores: {} },
        formulario({ nome: "Ruth", telefone: "(11) 97777-3434", agendar: "https://exemplo.com/agenda" }),
      ),
    );
    expect(destino).toMatch(/^\/clientes\/[0-9a-f-]{36}$/);
  });
});
