import { inspect } from "node:util";

import { eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import {
  argumentosSegurosDoLog,
  ehErroDoBanco,
  ErroDoBancoError,
  limparErroDoBanco,
  resumoDoErro,
  textoDoResumo,
} from "@/db/erro-do-banco";
import { codigoPgDe } from "@/db/erros";
import { apagarEmpresas, criarEmpresaComDados, usuarioTeste, type DadosEmpresa } from "@/db/testes/apoio";
import { registrarLogDoLogin } from "@/modules/acesso/auth";
import { tutor } from "@/modules/cadastros/schema";

// Nenhum dado pessoal nem de senha nos logs: o erro do banco que chega ao log leva só código, restrição e tabela.

const NOME = "Rita Moreira";
const TELEFONE = "+5531988887777";
const HASH = "a1b2c3d4e5f6:9f8e7d6c5b4a3210fedcba9876543210";

/** Erro do pg como o driver entrega: valores no `detail`. */
function erroDoPg() {
  return Object.assign(new Error('duplicate key value violates unique constraint "tutor_empresa_id_telefone_key"'), {
    code: "23505",
    constraint: "tutor_empresa_id_telefone_key",
    table: "tutor",
    detail: `Key (empresa_id, telefone)=(x, ${TELEFONE}) already exists.`,
  });
}

/** O que o Drizzle lança: consulta e parâmetros na mensagem, o erro do pg na causa. */
function erroDoDrizzle(params: unknown[]) {
  return new DrizzleQueryError('insert into "tutor" ("nome", "telefone") values ($1, $2)', params, erroDoPg());
}

/** O que o console.error mostraria do valor (mensagem, pilha e propriedades). */
const comoNoLog = (valor: unknown) => (typeof valor === "string" ? valor : inspect(valor, { depth: 5 }));

function semDadosPessoais(texto: string) {
  expect(texto).not.toContain(NOME);
  expect(texto).not.toContain(TELEFONE);
  expect(texto).not.toContain(HASH);
}

describe("resumoDoErro", () => {
  it("de um erro do Drizzle leva só código, restrição e tabela, sem parâmetros, consulta nem detalhe", () => {
    const resumo = resumoDoErro(erroDoDrizzle([NOME, TELEFONE, HASH]));
    expect(resumo).toEqual({
      nome: "ErroDoBanco",
      codigo: "23505",
      restricao: "tutor_empresa_id_telefone_key",
      tabela: "tutor",
    });
    semDadosPessoais(textoDoResumo(resumo));
    expect(textoDoResumo(resumo)).not.toContain("insert into");
  });

  it("de um erro do pg sozinho também não leva o detalhe", () => {
    semDadosPessoais(textoDoResumo(resumoDoErro(erroDoPg())));
  });

  it("de um erro de conexão embrulhado pelo Drizzle não leva os parâmetros", () => {
    const conexao = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5436"), { code: "ECONNREFUSED" });
    const erro = new DrizzleQueryError("select 1", [NOME, TELEFONE], conexao);
    expect(ehErroDoBanco(erro)).toBe(true);
    const texto = textoDoResumo(resumoDoErro(erro));
    semDadosPessoais(texto);
    expect(texto).toContain("ECONNREFUSED");
  });

  it("de um erro nosso (sem banco) mantém a mensagem", () => {
    expect(resumoDoErro(new Error("Cadastro público desativado."))).toEqual({
      nome: "Error",
      mensagem: "Cadastro público desativado.",
    });
  });
});

describe("limparErroDoBanco", () => {
  it("troca o erro do banco por um limpo, sem causa, com o contexto e o código preservado", () => {
    const limpo = limparErroDoBanco(erroDoDrizzle([NOME, TELEFONE, HASH]), "na empresa E1");
    expect(limpo).toBeInstanceOf(ErroDoBancoError);
    expect((limpo as Error).cause).toBeUndefined();
    expect(codigoPgDe(limpo)).toBe("23505");
    expect((limpo as Error).message).toContain("na empresa E1");
    semDadosPessoais(comoNoLog(limpo));
  });

  it("deixa passar os erros que não são do banco (redirect do Next, validação)", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    expect(limparErroDoBanco(redirect, "x")).toBe(redirect);
  });
});

describe("log do Better Auth", () => {
  it("registra o resumo do erro e omite os outros argumentos (linhas, corpo da requisição)", () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      registrarLogDoLogin("error", "Failed to create user", erroDoDrizzle(["dona@x.com", HASH]), {
        email: "dona@x.com",
        password: HASH,
      });
      const saida = espiao.mock.calls.flat().map(comoNoLog).join(" ");
      expect(saida).toContain("23505");
      expect(saida).not.toContain("dona@x.com");
      semDadosPessoais(saida);
    } finally {
      espiao.mockRestore();
    }
  });

  it("os argumentos seguros nunca levam textos nem objetos", () => {
    expect(argumentosSegurosDoLog([TELEFONE, { nome: NOME }, 3])).toEqual(["[omitido]", "[omitido]", 3]);
  });
});

describe("erro real do banco dentro do comEmpresa", () => {
  let a: DadosEmpresa;

  beforeAll(async () => {
    a = await criarEmpresaComDados("Logs");
  });

  afterAll(async () => {
    if (a) await apagarEmpresas([a.empresaId]);
    await encerrarConexoes();
  });

  it("telefone repetido: o erro que sai tem a empresa e a restrição, e não o nome nem o telefone", async () => {
    const telefone = await comEmpresa(a.empresaId, usuarioTeste, async (tx) => {
      const [existente] = await tx.select({ telefone: tutor.telefone }).from(tutor).where(eq(tutor.id, a.tutorId));
      return existente!.telefone;
    });

    const erro = await comEmpresa(a.empresaId, usuarioTeste, (tx) =>
      tx.insert(tutor).values({ nome: `[teste] ${NOME}`, telefone }),
    ).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(ErroDoBancoError);
    expect(codigoPgDe(erro)).toBe("23505");
    const noLog = comoNoLog(erro);
    expect(noLog).toContain(a.empresaId);
    expect(noLog).toMatch(/restrição tutor_/);
    expect(noLog).not.toContain(telefone);
    semDadosPessoais(noLog);
  });
});
