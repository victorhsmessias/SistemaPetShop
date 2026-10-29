import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import { EmpresaIndisponivelError } from "@/db/com-empresa";
import { comPlataforma } from "@/db/com-plataforma";
import {
  apagarEmpresas,
  apagarUsuarias,
  conexaoMigrador,
  criarDona,
  criarEmpresaComDados,
  emailTeste,
  entrar,
  requisicaoAuth,
  type DadosEmpresa,
} from "@/db/testes/apoio";
import { auth, CODIGO_EMPRESA_SUSPENSA, MENSAGEM_EMPRESA_SUSPENSA } from "@/modules/acesso/auth";
import { comEmpresaDaSessao, NaoAutenticadoError, obterSessao, SemEmpresaError } from "@/modules/acesso/sessao";
import { auditoria } from "@/modules/auditoria/schema";
import { tutor } from "@/modules/cadastros/schema";
import { empresa } from "@/modules/empresas/schema";

const SENHA = "senha-de-teste-123";

let a: DadosEmpresa;
let b: DadosEmpresa;
let suspensa: DadosEmpresa;
let emailDonaA: string;
let emailDonaSuspensa: string;
let emailAdmin: string;
let donaAId: string;

const comCookie = (cookie: string) => new Headers({ cookie });

async function suspender(empresaId: string) {
  await comPlataforma(null, (tx) => tx.update(empresa).set({ status: "suspensa" }).where(eq(empresa.id, empresaId)));
}

beforeAll(async () => {
  a = await criarEmpresaComDados("Sessão A");
  b = await criarEmpresaComDados("Sessão B");
  suspensa = await criarEmpresaComDados("Sessão Suspensa");
  emailDonaA = emailTeste("dona-a");
  emailDonaSuspensa = emailTeste("dona-suspensa");
  emailAdmin = emailTeste("admin");
  donaAId = await criarDona(a.empresaId, emailDonaA, SENHA);
  await criarDona(suspensa.empresaId, emailDonaSuspensa, SENHA);
  await auth.api.createUser({ body: { email: emailAdmin, password: SENHA, name: "Admin de teste", role: "admin" } });
});

afterAll(async () => {
  await apagarEmpresas([a, b, suspensa].map((d) => d?.empresaId).filter((id): id is string => Boolean(id)));
  await apagarUsuarias([emailAdmin].filter(Boolean));
  await encerrarConexoes();
});

describe("contexto da sessão", () => {
  it("devolve usuarioId, empresaId e role da dona", async () => {
    const sessao = await obterSessao(comCookie(await entrar(emailDonaA, SENHA)));
    expect(sessao).toEqual({ usuarioId: donaAId, nome: "Dona de teste", empresaId: a.empresaId, role: "user" });
  });

  it("sem cookie não há sessão", async () => {
    expect(await obterSessao(new Headers())).toBeNull();
    await expect(comEmpresaDaSessao(new Headers(), async () => "não devia rodar")).rejects.toThrow(
      NaoAutenticadoError,
    );
  });

  it("dona de A logada só vê tutores de A, da sessão até o RLS", async () => {
    const cabecalhos = comCookie(await entrar(emailDonaA, SENHA));
    const tutores = await comEmpresaDaSessao(cabecalhos, (tx) => tx.select().from(tutor));
    const ids = tutores.map((t) => t.id);

    expect(ids).toContain(a.tutorId);
    expect(ids).not.toContain(b.tutorId);
    expect(new Set(tutores.map((t) => t.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it("o autor da transação é a usuária da sessão", async () => {
    const cabecalhos = comCookie(await entrar(emailDonaA, SENHA));
    const autor = await comEmpresaDaSessao(cabecalhos, async (tx) => {
      const { rows } = await tx.execute<{ autor: string }>("select current_setting('app.usuario_id', true) as autor");
      return rows[0]!.autor;
    });
    expect(autor).toBe(donaAId);
  });

  it("o administrador não tem empresa", async () => {
    const cabecalhos = comCookie(await entrar(emailAdmin, SENHA));
    expect(await obterSessao(cabecalhos)).toMatchObject({ role: "admin", empresaId: null });
    await expect(comEmpresaDaSessao(cabecalhos, async () => "não devia rodar")).rejects.toThrow(SemEmpresaError);
  });
});

describe("empresa suspensa", () => {
  it("a dona não entra e recebe uma mensagem clara", async () => {
    const cookieAntes = await entrar(emailDonaSuspensa, SENHA);
    await suspender(suspensa.empresaId);

    const resposta = await requisicaoAuth("/sign-in/email", { email: emailDonaSuspensa, password: SENHA });
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ code: CODIGO_EMPRESA_SUSPENSA, message: MENSAGEM_EMPRESA_SUSPENSA });
    expect(resposta.headers.getSetCookie()).toEqual([]);

    // A sessão aberta antes da suspensão também é barrada no acesso aos dados.
    await expect(comEmpresaDaSessao(comCookie(cookieAntes), async () => "não devia rodar")).rejects.toThrow(
      EmpresaIndisponivelError,
    );
  });
});

describe("comPlataforma", () => {
  it("define app.usuario_id, que a auditoria grava como autor", async () => {
    const autor = randomUUID();
    await comPlataforma(autor, (tx) =>
      tx.update(empresa).set({ nome: "[teste] Sessão B renomeada" }).where(eq(empresa.id, b.empresaId)),
    );

    const { pool, banco } = conexaoMigrador();
    try {
      const eventos = await banco.select().from(auditoria).where(eq(auditoria.empresaId, b.empresaId));
      expect(eventos.at(-1)).toMatchObject({ acao: "alterou", usuarioId: autor });
    } finally {
      await pool.end();
    }
  });
});
