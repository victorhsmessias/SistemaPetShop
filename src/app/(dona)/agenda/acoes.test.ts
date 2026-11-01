import { and, eq } from "drizzle-orm";
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
import { auditoria } from "@/modules/auditoria/schema";
import { criarServico } from "@/modules/catalogo/servicos";

// As Server Actions da agenda, chamadas diretamente, como um atacante faria sem passar pela tela.
// Só a leitura dos cabeçalhos da requisição e a revalidação de cache do Next são substituídas;
// sessão, RLS e banco são os de verdade.
const requisicao = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requisicao.cookie ? { cookie: requisicao.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { agendarAcao, editarHorarioAcao, editarObservacoesAcao, editarServicosAcao, mudarStatusAcao } = await import(
  "@/app/(dona)/agenda/acoes"
);
const { salvarPetAcao, salvarTutorAcao } = await import("@/app/(dona)/acoes");

const SENHA = "senha-de-teste-123";
const DIA = "2026-12-01";
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

async function idsDoDia(dados: DadosEmpresa, dia = DIA) {
  return (await daEmpresa(dados, (tx) => listarAgenda(tx, dia))).atendimentos;
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
  ])("%s", async (_nome, chamar) => {
    expect(await destinoDoRedirect(chamar())).toBe("/login");
  });

  it("e nada é agendado", async () => {
    await destinoDoRedirect(agendarAcao(vazio, agendamento("06:00")));
    expect(await idsDoDia(a)).toEqual([]);
  });

  it("o administrador é mandado para /admin", async () => {
    requisicao.cookie = cookieAdmin;
    expect(await destinoDoRedirect(agendarAcao(vazio, agendamento("06:00")))).toBe("/admin");
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
    const [atendimento] = await idsDoDia(a);
    expect(await mudarStatusAcao({}, formulario({ id: atendimento!.id, de: "confirmado", para: "agendado" }))).toEqual({});
    const repetido = await mudarStatusAcao({}, formulario({ id: atendimento!.id, de: "confirmado", para: "agendado" }));
    expect(repetido.erro).toContain("acabou de ser alterado");
    expect((await daEmpresa(a, (tx) => obterAtendimento(tx, atendimento!.id)))!.status).toBe("agendado");
  });

  it("horário ocupado volta como aviso, com os dados digitados; confirmado, agenda", async () => {
    const aviso = await agendarAcao(vazio, agendamento("10:00", { observacoes: "Chega mais cedo" }));
    expect(aviso.conflitos).toEqual([expect.objectContaining({ horario: "09:00–10:30", petNome: "Pet Agenda Ações A" })]);
    expect(aviso.valores).toMatchObject({ hora: "10:00", observacoes: "Chega mais cedo", [`preco_${tosaId}`]: "40,00" });
    expect(aviso.servicos).toEqual([a.servicoId, tosaId]);

    const destino = await destinoDoRedirect(
      agendarAcao(aviso, agendamento("10:00", { horarioAvisado: aviso.horarioAvisado! })),
    );
    expect(destino).toBe(`/agenda?dia=${DIA}`);
    expect(await idsDoDia(a)).toHaveLength(2);
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
    expect(status.erro).toBe("Atendimento não encontrado.");

    // Trocar os serviços apagaria o item atual da B, se a troca passasse.
    const servicos = await editarServicosAcao(
      vazio,
      formulario({ id: b.atendimentoId, servico: [tosaId], [`preco_${tosaId}`]: "1,00", [`duracao_${tosaId}`]: "10" }),
    );
    expect(servicos.erros.geral).toBe("Atendimento não encontrado.");

    const horario = await editarHorarioAcao(
      vazio,
      formulario({ id: b.atendimentoId, dia: DIA, hora: "08:00", termino: "09:00" }),
    );
    expect(horario.erros.geral).toBe("Atendimento não encontrado.");

    const observacoes = await editarObservacoesAcao(vazio, formulario({ id: b.atendimentoId, observacoes: "invasão" }));
    expect(observacoes.erros.geral).toBe("Atendimento não encontrado.");

    const deB = await daEmpresa(b, (tx) => obterAtendimento(tx, b.atendimentoId));
    expect(deB).toMatchObject({ status: "agendado", observacoes: null });
    expect(deB!.itens.map((i) => i.id)).toEqual([b.itemId]);
    expect(deB!.inicio.toISOString()).toBe("2026-11-10T13:00:00.000Z");
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
