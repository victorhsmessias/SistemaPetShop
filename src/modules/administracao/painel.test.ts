import { spawnSync } from "node:child_process";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import {
  apagarEmpresas,
  apagarUsuarias,
  conexaoMigrador,
  criarDona as criarDonaDeTeste,
  criarEmpresaComDados,
  emailTeste,
  entrar,
  requisicaoAuth,
  type DadosEmpresa,
} from "@/db/testes/apoio";
import { user } from "@/modules/acesso/schema";
import { NaoAutenticadoError, obterSessao } from "@/modules/acesso/sessao";
import { auditoria } from "@/modules/auditoria/schema";
import {
  criarDona,
  criarEmpresaComDona,
  encerrarSessoes,
  listarEmpresas,
  redefinirSenha,
  type ResultadoCriacao,
} from "@/modules/administracao/empresas";
import { AcessoNegadoError } from "@/modules/administracao/guarda";
import { DadosInvalidosError } from "@/modules/administracao/usuarias";

const SENHA_ADMIN = "senha-do-admin-123";
const SENHA_PROVISORIA = "provisoria-123";

let emailAdmin: string;
let adminId: string;
let cabecalhosAdmin: Headers;
let criada: Extract<ResultadoCriacao, { situacao: "completa" }>;
let emailDona: string;
let semDona: DadosEmpresa;
let outra: DadosEmpresa;
let emailDonaOutra: string;
const empresasCriadas: string[] = [];

async function comoMigrador<T>(fn: (banco: ReturnType<typeof conexaoMigrador>["banco"]) => Promise<T>) {
  const { pool, banco } = conexaoMigrador();
  try {
    return await fn(banco);
  } finally {
    await pool.end();
  }
}

/** Roda o comando de verdade (`npm run criar-admin`), com as respostas pela entrada padrão. */
function rodarCriarAdmin(email: string, senha: string, confirmacao = senha) {
  return spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/criar-admin.mts"], {
    input: `${email}\n${senha}\n${confirmacao}\n`,
    encoding: "utf8",
    env: process.env,
    timeout: 60_000,
  });
}

beforeAll(async () => {
  emailAdmin = emailTeste("admin");
  const resultado = rodarCriarAdmin(emailAdmin, SENHA_ADMIN);
  expect(resultado.stderr).toBe("");
  expect(resultado.status).toBe(0);

  cabecalhosAdmin = new Headers({ cookie: await entrar(emailAdmin, SENHA_ADMIN) });
  adminId = (await obterSessao(cabecalhosAdmin))!.usuarioId;

  semDona = await criarEmpresaComDados("Painel sem dona");
  outra = await criarEmpresaComDados("Painel outra");
  emailDonaOutra = emailTeste("dona-outra");
  await criarDonaDeTeste(outra.empresaId, emailDonaOutra, SENHA_PROVISORIA);
  empresasCriadas.push(semDona.empresaId, outra.empresaId);

  emailDona = emailTeste("dona");
  const resultadoCriacao = await criarEmpresaComDona(cabecalhosAdmin, {
    nome: "[teste] Painel Banho Feliz",
    fusoHorario: "America/Recife",
    dona: { nome: "Maria", email: emailDona, senha: SENHA_PROVISORIA },
  });
  empresasCriadas.push(resultadoCriacao.empresaId);
  expect(resultadoCriacao.situacao).toBe("completa");
  criada = resultadoCriacao as typeof criada;
}, 120_000);

afterAll(async () => {
  await apagarEmpresas(empresasCriadas);
  await apagarUsuarias([emailAdmin].filter(Boolean));
  await encerrarConexoes();
});

describe("comando criar-admin", () => {
  it("cria o administrador sem empresa, passando pela barreira do cadastro", async () => {
    const [admin] = await comoMigrador((banco) => banco.select().from(user).where(eq(user.email, emailAdmin)));
    expect(admin).toMatchObject({ role: "admin", empresaId: null });
  });

  it("registra a criação na auditoria, sem empresa e sem dado de senha", async () => {
    const [evento] = await comoMigrador((banco) =>
      banco
        .select()
        .from(auditoria)
        .where(and(eq(auditoria.tabela, "user"), eq(auditoria.registroId, adminId))),
    );
    expect(evento).toMatchObject({ acao: "criou", empresaId: null, usuarioId: null });
    expect(evento!.depois).toMatchObject({ role: "admin", origem: "criar-admin" });
    expect(JSON.stringify(evento)).not.toContain(SENHA_ADMIN);
  });

  it("recusa senhas que não conferem e e-mail repetido", () => {
    const diferente = rodarCriarAdmin(emailTeste("admin"), SENHA_ADMIN, "outra-senha-123");
    expect(diferente.status).toBe(1);
    expect(diferente.stderr).toContain("As senhas não conferem");

    const repetido = rodarCriarAdmin(emailAdmin, SENHA_ADMIN);
    expect(repetido.status).toBe(1);
    expect(repetido.stderr).toContain("já está em uso");
  });
});

describe("criar empresa com a dona", () => {
  it("a empresa e a dona existem, e a dona entra na empresa dela", async () => {
    const sessao = await obterSessao(new Headers({ cookie: await entrar(emailDona, SENHA_PROVISORIA) }));
    expect(sessao).toMatchObject({ role: "user", empresaId: criada.empresaId, usuarioId: criada.donaId });
  });

  it("grava na auditoria a empresa e a dona, com o administrador como autor", async () => {
    const eventos = await comoMigrador((banco) =>
      banco.select().from(auditoria).where(eq(auditoria.empresaId, criada.empresaId)).orderBy(auditoria.id),
    );
    expect(eventos.map((e) => [e.tabela, e.acao, e.usuarioId])).toEqual([
      ["empresa", "criou", adminId],
      ["user", "criou", adminId],
    ]);
    expect(eventos[1]!.registroId).toBe(criada.donaId);
    expect(JSON.stringify(eventos)).not.toContain(SENHA_PROVISORIA);
  });

  it("e-mail em uso é recusado antes de criar a empresa", async () => {
    const antes = (await listarEmpresas(cabecalhosAdmin)).length;
    await expect(
      criarEmpresaComDona(cabecalhosAdmin, {
        nome: "[teste] Repetida",
        fusoHorario: "America/Sao_Paulo",
        dona: { nome: "Outra", email: emailDona, senha: SENHA_PROVISORIA },
      }),
    ).rejects.toThrow(DadosInvalidosError);
    expect(await listarEmpresas(cabecalhosAdmin)).toHaveLength(antes);
  });

  it("a lista mostra a empresa com a dona", async () => {
    const empresas = await listarEmpresas(cabecalhosAdmin);
    const item = empresas.find((e) => e.id === criada.empresaId);
    expect(item).toMatchObject({ nome: "[teste] Painel Banho Feliz", fusoHorario: "America/Recife", status: "ativa" });
    expect(item!.usuarias.map((u) => u.email)).toEqual([emailDona]);
  });
});

describe("criar dona para empresa sem usuária", () => {
  it("cria uma vez e recusa a segunda", async () => {
    const email = emailTeste("dona-tardia");
    const donaId = await criarDona(cabecalhosAdmin, semDona.empresaId, {
      nome: "Tardia",
      email,
      senha: SENHA_PROVISORIA,
    });
    expect((await obterSessao(new Headers({ cookie: await entrar(email, SENHA_PROVISORIA) })))?.usuarioId).toBe(
      donaId,
    );

    await expect(
      criarDona(cabecalhosAdmin, semDona.empresaId, {
        nome: "Segunda",
        email: emailTeste("segunda"),
        senha: SENHA_PROVISORIA,
      }),
    ).rejects.toThrow("já tem uma usuária");
  });
});

describe("redefinir senha", () => {
  it("troca a senha, encerra as sessões abertas e registra início e conclusão, sem dado de senha", async () => {
    const novaSenha = "nova-senha-456";
    const sessaoAberta = new Headers({ cookie: await entrar(emailDona, SENHA_PROVISORIA) });
    expect(await obterSessao(sessaoAberta)).not.toBeNull();

    expect(await redefinirSenha(cabecalhosAdmin, criada.donaId, novaSenha)).toEqual({ sessoesEncerradas: true });

    // A sessão aberta antes da redefinição deixa de valer.
    expect(await obterSessao(sessaoAberta)).toBeNull();

    const antiga = await requisicaoAuth("/sign-in/email", { email: emailDona, password: SENHA_PROVISORIA });
    expect(antiga.status).toBe(401);
    await entrar(emailDona, novaSenha);

    const eventos = await comoMigrador((banco) =>
      banco
        .select()
        .from(auditoria)
        .where(and(eq(auditoria.registroId, criada.donaId), eq(auditoria.acao, "alterou")))
        .orderBy(auditoria.id),
    );
    expect(eventos.map((e) => [e.usuarioId, e.empresaId, e.depois])).toEqual([
      [adminId, criada.empresaId, { evento: "redefinicao_de_senha", situacao: "iniciada" }],
      [adminId, criada.empresaId, { evento: "redefinicao_de_senha", situacao: "concluida", sessoesEncerradas: true }],
    ]);
    expect(JSON.stringify(eventos)).not.toContain(novaSenha);
  });

  it("encerrar sessões derruba a sessão aberta, mantém a senha e fica na auditoria", async () => {
    const senhaAtual = "nova-senha-456";
    const sessaoAberta = new Headers({ cookie: await entrar(emailDona, senhaAtual) });
    expect(await obterSessao(sessaoAberta)).not.toBeNull();

    await encerrarSessoes(cabecalhosAdmin, criada.donaId);

    expect(await obterSessao(sessaoAberta)).toBeNull();
    await entrar(emailDona, senhaAtual);
    const eventos = await comoMigrador((banco) =>
      banco.select({ depois: auditoria.depois, autor: auditoria.usuarioId }).from(auditoria)
        .where(eq(auditoria.registroId, criada.donaId)).orderBy(auditoria.id),
    );
    expect(eventos.slice(-2)).toEqual([
      { autor: adminId, depois: { evento: "encerramento_de_sessoes", situacao: "iniciada" } },
      { autor: adminId, depois: { evento: "encerramento_de_sessoes", situacao: "concluida" } },
    ]);
  });

  it("senha curta é recusada antes de qualquer registro", async () => {
    await expect(redefinirSenha(cabecalhosAdmin, criada.donaId, "curta")).rejects.toThrow(DadosInvalidosError);
  });
});

describe("a dona não usa o painel", () => {
  let cabecalhosDona: Headers;

  beforeAll(async () => {
    cabecalhosDona = new Headers({ cookie: await entrar(emailDonaOutra, SENHA_PROVISORIA) });
  });

  it("nenhuma ação do painel aceita a sessão da dona", async () => {
    const dona = { nome: "X", email: emailTeste("x"), senha: SENHA_PROVISORIA };
    await expect(listarEmpresas(cabecalhosDona)).rejects.toThrow(AcessoNegadoError);
    await expect(
      criarEmpresaComDona(cabecalhosDona, { nome: "[teste] X", fusoHorario: "America/Sao_Paulo", dona }),
    ).rejects.toThrow(AcessoNegadoError);
    await expect(criarDona(cabecalhosDona, semDona.empresaId, dona)).rejects.toThrow(AcessoNegadoError);
    await expect(redefinirSenha(cabecalhosDona, criada.donaId, "invasao-123")).rejects.toThrow(AcessoNegadoError);
    await expect(encerrarSessoes(cabecalhosDona, criada.donaId)).rejects.toThrow(AcessoNegadoError);
  });

  it("sem sessão, nenhuma ação do painel roda", async () => {
    await expect(listarEmpresas(new Headers())).rejects.toThrow(NaoAutenticadoError);
  });

  it("a senha da vítima não mudou", async () => {
    const resposta = await requisicaoAuth("/sign-in/email", { email: emailDona, password: "invasao-123" });
    expect(resposta.status).toBe(401);
  });
});
