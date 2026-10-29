import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import {
  apagarEmpresas,
  conexaoMigrador,
  criarDona,
  criarEmpresaComDados,
  emailTeste,
  entrar,
  ipTeste,
  requisicaoAuth,
  type DadosEmpresa,
} from "@/db/testes/apoio";
import { auth } from "@/modules/acesso/auth";
import { user } from "@/modules/acesso/schema";

const SENHA = "senha-de-teste-123";

let a: DadosEmpresa;
let b: DadosEmpresa;
let emailDona: string;
let donaId: string;

beforeAll(async () => {
  a = await criarEmpresaComDados("Login A");
  b = await criarEmpresaComDados("Login B");
  emailDona = emailTeste("dona");
  donaId = await criarDona(a.empresaId, emailDona, SENHA);
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

async function lerUsuaria(email: string) {
  const { pool, banco } = conexaoMigrador();
  try {
    const [linha] = await banco.select().from(user).where(eq(user.email, email));
    return linha;
  } finally {
    await pool.end();
  }
}

describe("cadastro público", () => {
  it("falha pela rota HTTP e não cria a usuária", async () => {
    const email = emailTeste("intrusa");
    const resposta = await requisicaoAuth("/sign-up/email", { email, password: SENHA, name: "Intrusa" });
    expect(resposta.status).toBeGreaterThanOrEqual(400);
    expect(await lerUsuaria(email)).toBeUndefined();
  });

  it("falha pela API do servidor", async () => {
    const email = emailTeste("intrusa");
    await expect(auth.api.signUpEmail({ body: { email, password: SENHA, name: "Intrusa" } })).rejects.toThrow();
    expect(await lerUsuaria(email)).toBeUndefined();
  });

  it("segunda barreira: o gancho recusa criar usuária fora do createUser do plugin admin", async () => {
    const email = emailTeste("intrusa");
    const contexto = await auth.$context;
    // Mesmo alegando origem "admin": o gancho olha o caminho da chamada, não esse campo.
    await expect(
      contexto.internalAdapter.createUser({ email, name: "Intrusa", emailVerified: false }, { method: "admin" }),
    ).rejects.toThrow("Cadastro público desativado");
    expect(await lerUsuaria(email)).toBeUndefined();
  });
});

describe("login", () => {
  it("entra com a senha certa", async () => {
    const resposta = await requisicaoAuth("/sign-in/email", { email: emailDona, password: SENHA });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.getSetCookie().join(";")).toMatch(/session_token=.+HttpOnly/i);
  });

  it("não entra com a senha errada", async () => {
    const resposta = await requisicaoAuth("/sign-in/email", { email: emailDona, password: "senha-errada-123" });
    expect(resposta.status).toBe(401);
    expect(resposta.headers.getSetCookie()).toEqual([]);
  });

  it("limita a 5 tentativas por minuto por IP", async () => {
    const ip = ipTeste();
    const status: number[] = [];
    for (let i = 0; i < 6; i++) {
      const resposta = await requisicaoAuth(
        "/sign-in/email",
        { email: emailDona, password: "senha-errada-123" },
        { ip },
      );
      status.push(resposta.status);
    }
    expect(status).toEqual([401, 401, 401, 401, 401, 429]);

    // Outro IP continua podendo entrar.
    const outroIp = await requisicaoAuth("/sign-in/email", { email: emailDona, password: SENHA });
    expect(outroIp.status).toBe(200);
  });
});

describe("a dona não muda empresa nem papel pela API do Better Auth", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await entrar(emailDona, SENHA);
  });

  it("update-user recusa empresaId", async () => {
    const resposta = await requisicaoAuth("/update-user", { empresaId: b.empresaId }, { cookie });
    expect(resposta.status).toBe(400);
  });

  it("update-user recusa role", async () => {
    const resposta = await requisicaoAuth("/update-user", { role: "admin" }, { cookie });
    expect(resposta.status).toBe(400);
  });

  it("as rotas do plugin admin recusam a dona", async () => {
    const definirPapel = await requisicaoAuth("/admin/set-role", { userId: donaId, role: "admin" }, { cookie });
    expect(definirPapel.status).toBe(403);

    const criar = await requisicaoAuth(
      "/admin/create-user",
      { email: emailTeste("outra"), password: SENHA, name: "Outra", data: { empresaId: b.empresaId } },
      { cookie },
    );
    expect(criar.status).toBe(403);
  });

  it("empresa_id e role continuam os mesmos", async () => {
    const dona = await lerUsuaria(emailDona);
    expect(dona).toMatchObject({ empresaId: a.empresaId, role: "user" });
  });
});
