import { inspect } from "node:util";

import { and, eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auth } from "@/modules/acesso/auth";
import { obterSessao } from "@/modules/acesso/sessao";

import { encerrarConexoes } from "@/db/clientes";
import {
  apagarEmpresas,
  apagarUsuarias,
  conexaoMigrador,
  emailTeste,
  entrar,
  requisicaoAuth,
} from "@/db/testes/apoio";
import { user } from "@/modules/acesso/schema";
import { registrarEvento, type Evento } from "@/modules/auditoria/registrar";
import { auditoria } from "@/modules/auditoria/schema";
import { criarAdministrador } from "@/modules/administracao/criar-administrador";
import { criarEmpresaComDona, redefinirSenha } from "@/modules/administracao/empresas";

// ADR 0011: o que acontece quando a gravação na auditoria falha. Só o registro de eventos é
// substituído (para poder falhar de propósito); o banco é o de verdade.
vi.mock("@/modules/auditoria/registrar", async (original) => {
  const real = await original<typeof import("@/modules/auditoria/registrar")>();
  return { registrarEvento: vi.fn(real.registrarEvento) };
});
const registrar = vi.mocked(registrarEvento);

/** Falha na próxima gravação de evento que satisfizer o critério; as outras seguem normais. */
function falharQuando(criterio: (evento: Evento) => boolean) {
  const real = registrar.getMockImplementation()!;
  registrar.mockImplementation(async (tx, evento) => {
    if (criterio(evento)) {
      registrar.mockImplementation(real);
      throw new Error("auditoria indisponível (simulada)");
    }
    return real(tx, evento);
  });
}

const SENHA = "senha-de-teste-123";
let emailAdmin: string;
let cabecalhosAdmin: Headers;
const empresas: string[] = [];

async function usuariaPorEmail(email: string) {
  const { pool, banco } = conexaoMigrador();
  try {
    const [linha] = await banco.select().from(user).where(eq(user.email, email));
    return linha;
  } finally {
    await pool.end();
  }
}

beforeAll(async () => {
  emailAdmin = emailTeste("admin");
  await criarAdministrador({ nome: "Admin", email: emailAdmin, senha: SENHA });
  cabecalhosAdmin = new Headers({ cookie: await entrar(emailAdmin, SENHA) });
});

afterAll(async () => {
  await apagarEmpresas(empresas);
  await apagarUsuarias([emailAdmin].filter(Boolean));
  await encerrarConexoes();
});

describe("auditoria falha ao criar a dona", () => {
  it("a usuária é removida e a empresa fica sem dona", async () => {
    const emailDona = emailTeste("dona");
    falharQuando((e) => e.tabela === "user" && e.acao === "criou");

    const resultado = await criarEmpresaComDona(cabecalhosAdmin, {
      nome: "[teste] Auditoria falhou",
      fusoHorario: "America/Sao_Paulo",
      dona: { nome: "Dona", email: emailDona, senha: SENHA },
    });
    empresas.push(resultado.empresaId);

    expect(resultado).toMatchObject({ situacao: "sem_dona" });
    expect(await usuariaPorEmail(emailDona)).toBeUndefined();
  });
});

describe("auditoria falha ao redefinir a senha", () => {
  let emailDona: string;
  let donaId: string;

  beforeAll(async () => {
    emailDona = emailTeste("dona");
    const resultado = await criarEmpresaComDona(cabecalhosAdmin, {
      nome: "[teste] Redefinição",
      fusoHorario: "America/Sao_Paulo",
      dona: { nome: "Dona", email: emailDona, senha: SENHA },
    });
    empresas.push(resultado.empresaId);
    if (resultado.situacao !== "completa") throw new Error(resultado.erro);
    donaId = resultado.donaId;
  });

  async function situacoes() {
    const { pool, banco } = conexaoMigrador();
    try {
      const eventos = await banco
        .select({ depois: auditoria.depois })
        .from(auditoria)
        .where(and(eq(auditoria.registroId, donaId), eq(auditoria.acao, "alterou")))
        .orderBy(auditoria.id);
      return eventos.map((e) => (e.depois as { situacao: string }).situacao);
    } finally {
      await pool.end();
    }
  }

  it("sem o registro de início, a senha não muda", async () => {
    falharQuando((e) => (e.depois as { situacao?: string }).situacao === "iniciada");
    await expect(redefinirSenha(cabecalhosAdmin, donaId, "nova-senha-789")).rejects.toThrow();

    const nova = await requisicaoAuth("/sign-in/email", { email: emailDona, password: "nova-senha-789" });
    expect(nova.status).toBe(401);
    await entrar(emailDona, SENHA);
    expect(await situacoes()).toEqual([]);
  });

  it("se só o registro do resultado falhar, a senha muda e o início fica registrado", async () => {
    falharQuando((e) => (e.depois as { situacao?: string }).situacao === "concluida");
    await redefinirSenha(cabecalhosAdmin, donaId, "nova-senha-789");

    await entrar(emailDona, "nova-senha-789");
    expect(await situacoes()).toEqual(["iniciada"]);
  });

  it("se o encerramento das sessões falhar, a senha muda e a auditoria registra sessoesEncerradas false", async () => {
    const sessaoAberta = new Headers({ cookie: await entrar(emailDona, "nova-senha-789") });
    const espiao = vi.spyOn(auth.api, "revokeUserSessions").mockRejectedValueOnce(new Error("falha simulada"));

    const resultado = await redefinirSenha(cabecalhosAdmin, donaId, "mais-nova-321");
    espiao.mockRestore();

    expect(resultado).toEqual({ sessoesEncerradas: false });
    await entrar(emailDona, "mais-nova-321");
    expect(await obterSessao(sessaoAberta)).not.toBeNull(); // continua aberta: o painel oferece "Encerrar sessões"
    expect((await situacoes()).slice(-2)).toEqual(["iniciada", "concluida"]);
  });
});

describe("o log da falha não leva dados da usuária nem de senha", () => {
  it("um erro do banco com e-mail e hash nos parâmetros vira só o resumo no console.error", async () => {
    const emailDona = emailTeste("dona-log");
    const hash = "c0ffee:0123456789abcdef0123456789abcdef";
    const real = registrar.getMockImplementation()!;
    registrar.mockImplementation(async (tx, evento) => {
      if (evento.tabela === "user" && evento.acao === "criou") {
        registrar.mockImplementation(real);
        const doPg = Object.assign(new Error("permission denied for table auditoria"), {
          code: "42501",
          table: "auditoria",
          detail: `Failing row contains (${emailDona}, ${hash}).`,
        });
        throw new DrizzleQueryError('insert into "auditoria" values ($1, $2)', [emailDona, hash], doPg);
      }
      return real(tx, evento);
    });
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const resultado = await criarEmpresaComDona(cabecalhosAdmin, {
        nome: "[teste] Log sem dados",
        fusoHorario: "America/Sao_Paulo",
        dona: { nome: "Dona", email: emailDona, senha: SENHA },
      });
      empresas.push(resultado.empresaId);

      const saida = espiao.mock.calls.flat().map((v) => (typeof v === "string" ? v : inspect(v))).join(" ");
      expect(saida).toContain("42501");
      expect(saida).not.toContain(emailDona);
      expect(saida).not.toContain(hash);
      expect(saida).not.toContain(SENHA);
    } finally {
      espiao.mockRestore();
    }
  });
});
