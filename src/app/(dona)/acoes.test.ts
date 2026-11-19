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
import { obterPet } from "@/modules/cadastros/pets";
import { obterTutor } from "@/modules/cadastros/tutores";
import { obterServico } from "@/modules/catalogo/servicos";

// As Server Actions das telas da dona, chamadas diretamente, como um atacante faria sem passar pela tela.
// Só a leitura dos cabeçalhos da requisição e a revalidação de cache do Next são substituídas;
// sessão, RLS e banco são os de verdade.
const requisicao = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requisicao.cookie ? { cookie: requisicao.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  alternarPetAtivoAcao,
  alternarServicoAtivoAcao,
  cadastrarClienteEPetAcao,
  salvarPetAcao,
  salvarServicoAcao,
  salvarTutorAcao,
} = await import("@/app/(dona)/acoes");

const SENHA = "senha-de-teste-123";
let a: DadosEmpresa;
let b: DadosEmpresa;
let cookieDonaA: string;
let cookieAdmin: string;
let emailAdmin: string;
const vazio = { erros: {}, valores: {} };

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [campo, valor] of Object.entries(campos)) dados.set(campo, valor);
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

beforeAll(async () => {
  a = await criarEmpresaComDados("Ações A");
  b = await criarEmpresaComDados("Ações B");
  const emailDona = emailTeste("dona-a");
  await criarDona(a.empresaId, emailDona, SENHA);
  cookieDonaA = await entrar(emailDona, SENHA);

  emailAdmin = emailTeste("admin");
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

describe("sem sessão, toda ação é recusada e manda para o login", () => {
  it.each([
    ["salvarTutorAcao", () => salvarTutorAcao(vazio, formulario({ nome: "X", telefone: "(11) 98765-4321" }))],
    ["salvarPetAcao", () => salvarPetAcao(vazio, formulario({ tutorId: "", nome: "X", especie: "cao", porte: "P" }))],
    ["alternarPetAtivoAcao", () => alternarPetAtivoAcao(formulario({ petId: "", ativo: "false" }))],
    ["salvarServicoAcao", () => salvarServicoAcao(vazio, formulario({ nome: "X", preco: "1", duracao: "1" }))],
    ["alternarServicoAtivoAcao", () => alternarServicoAtivoAcao(formulario({ id: "", ativo: "false" }))],
    [
      "cadastrarClienteEPetAcao",
      () =>
        cadastrarClienteEPetAcao(
          vazio,
          formulario({ nome: "X", telefone: "(11) 98765-4321", pet_nome: "Y", especie: "cao", porte: "P" }),
        ),
    ],
  ])("%s", async (_nome, chamar) => {
    expect(await destinoDoRedirect(chamar())).toBe("/login");
  });

  it("e nada é gravado", async () => {
    await destinoDoRedirect(salvarTutorAcao(vazio, formulario({ nome: "Fantasma", telefone: "(11) 91111-0000" })));
    await destinoDoRedirect(
      cadastrarClienteEPetAcao(
        vazio,
        formulario({ nome: "Fantasma", telefone: "(11) 91111-0001", pet_nome: "Assombro", especie: "cao", porte: "P" }),
      ),
    );
    const { buscarTutores } = await import("@/modules/cadastros/tutores");
    expect(await daEmpresa(a, (tx) => buscarTutores(tx, "Fantasma"))).toEqual([]);
  });
});

describe("o administrador não usa as ações da dona", () => {
  it("é mandado para /admin", async () => {
    requisicao.cookie = cookieAdmin;
    expect(await destinoDoRedirect(salvarServicoAcao(vazio, formulario({ nome: "X", preco: "1", duracao: "1" })))).toBe(
      "/admin",
    );
  });
});

describe("a dona da empresa A, pelas ações das telas", () => {
  beforeEach(() => {
    requisicao.cookie = cookieDonaA;
  });

  it("cria um tutor na própria empresa e vai para a página dele, com o aviso de sucesso", async () => {
    const destino = await destinoDoRedirect(
      salvarTutorAcao(vazio, formulario({ nome: "Marta", telefone: "(11) 97654-3210", observacoes: "" })),
    );
    expect(destino).toMatch(/^\/clientes\/[0-9a-f-]{36}\?salvo=cliente$/);
    const id = destino.replace("/clientes/", "").replace("?salvo=cliente", "");
    expect(await daEmpresa(a, (tx) => obterTutor(tx, id))).toMatchObject({
      nome: "Marta",
      telefone: "+5511976543210",
      empresaId: a.empresaId,
    });
  });

  it("desativar e reativar pet e serviço voltam com o aviso de sucesso (U5)", async () => {
    expect(await destinoDoRedirect(alternarPetAtivoAcao(formulario({ petId: a.petId, ativo: "false" })))).toBe(
      `/clientes/${a.tutorId}?inativos=1&salvo=pet-desativado`,
    );
    expect(await daEmpresa(a, (tx) => obterPet(tx, a.petId))).toMatchObject({ ativo: false });
    expect(await destinoDoRedirect(alternarPetAtivoAcao(formulario({ petId: a.petId, ativo: "true" })))).toBe(
      `/clientes/${a.tutorId}?salvo=pet-reativado`,
    );
    expect(await daEmpresa(a, (tx) => obterPet(tx, a.petId))).toMatchObject({ ativo: true });

    expect(await destinoDoRedirect(alternarServicoAtivoAcao(formulario({ id: a.servicoId, ativo: "false" })))).toBe(
      "/servicos?inativos=1&salvo=servico-desativado",
    );
    expect(await daEmpresa(a, (tx) => obterServico(tx, a.servicoId))).toMatchObject({ ativo: false });
    expect(await destinoDoRedirect(alternarServicoAtivoAcao(formulario({ id: a.servicoId, ativo: "true" })))).toBe(
      "/servicos?salvo=servico-reativado",
    );
    expect(await daEmpresa(a, (tx) => obterServico(tx, a.servicoId))).toMatchObject({ ativo: true });
  });

  it("volta com as mensagens e os dados digitados quando o formulário tem erro", async () => {
    const estado = await salvarServicoAcao(vazio, formulario({ nome: "Tosa", preco: "45.50", duracao: "abc" }));
    expect(estado.erros).toMatchObject({ preco: expect.stringContaining("vírgula"), duracao: expect.any(String) });
    expect(estado.valores).toMatchObject({ nome: "Tosa", preco: "45.50" });
  });

  it("não altera tutor, pet nem serviço da B, mesmo com os ids certos no formulário", async () => {
    const tutorB = await salvarTutorAcao(
      vazio,
      formulario({ id: b.tutorId, nome: "Invadido", telefone: "(21) 99999-0000" }),
    );
    expect(tutorB.erros.geral).toContain("não encontrado");

    const petB = await salvarPetAcao(
      vazio,
      formulario({ petId: b.petId, tutorId: b.tutorId, nome: "Invadido", especie: "cao", porte: "P" }),
    );
    expect(petB.erros.geral).toContain("não encontrado");

    const servicoB = await salvarServicoAcao(vazio, formulario({ id: b.servicoId, nome: "X", preco: "1", duracao: "1" }));
    expect(servicoB.erros.geral).toContain("não encontrado");

    expect(await destinoDoRedirect(alternarPetAtivoAcao(formulario({ petId: b.petId, ativo: "false" })))).toBe(
      "/clientes",
    );
    // Sem aviso de sucesso: nada foi alterado.
    expect(await destinoDoRedirect(alternarServicoAtivoAcao(formulario({ id: b.servicoId, ativo: "false" })))).toBe(
      "/servicos",
    );

    expect(await daEmpresa(b, (tx) => obterTutor(tx, b.tutorId))).toMatchObject({ nome: "Tutor Ações B" });
    expect(await daEmpresa(b, (tx) => obterPet(tx, b.petId))).toMatchObject({ nome: "Pet Ações B", ativo: true });
    expect(await daEmpresa(b, (tx) => obterServico(tx, b.servicoId))).toMatchObject({ nome: "Banho Ações B", ativo: true });
  });

  it("não cria pet para tutor da B", async () => {
    const estado = await salvarPetAcao(
      vazio,
      formulario({ tutorId: b.tutorId, nome: "Intruso", especie: "cao", porte: "P" }),
    );
    expect(estado.erros.geral).toContain("não encontrado");
  });

  it("um empresa_id no formulário é ignorado: o tutor vai para a empresa da sessão", async () => {
    const destino = await destinoDoRedirect(
      salvarTutorAcao(vazio, formulario({ nome: "Esperto", telefone: "(11) 95555-4444", empresaId: b.empresaId })),
    );
    const id = destino.replace("/clientes/", "").replace("?salvo=cliente", "");
    expect(await daEmpresa(a, (tx) => obterTutor(tx, id))).toMatchObject({ empresaId: a.empresaId });
  });
});
