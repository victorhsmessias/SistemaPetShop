import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { expect } from "vitest";

import { bancoPlataforma } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { auth } from "@/modules/acesso/auth";
import { user } from "@/modules/acesso/schema";
import { auditoria } from "@/modules/auditoria/schema";
import { pet, tutor } from "@/modules/cadastros/schema";
import { servico } from "@/modules/catalogo/schema";
import { empresa } from "@/modules/empresas/schema";

// Apoio aos testes de integração. Roda contra o Postgres de verdade (docker compose ou CI).

export type DadosEmpresa = { empresaId: string; tutorId: string; petId: string; servicoId: string };

/** Conexão como migrador, dono das tabelas: só para ler o catálogo e limpar o que os testes criaram. */
export function conexaoMigrador() {
  const url = process.env.DATABASE_URL_MIGRADOR;
  if (!url) throw new Error("DATABASE_URL_MIGRADOR não definida (veja .env.example).");
  const pool = new Pool({ connectionString: url });
  return { pool, banco: drizzle({ client: pool }) };
}

export const usuarioTeste = randomUUID();

/** Cria uma empresa (pela plataforma) com um tutor, um pet e um serviço (pelo app, dentro de comEmpresa). */
export async function criarEmpresaComDados(nome: string): Promise<DadosEmpresa> {
  const [criada] = await bancoPlataforma()
    .insert(empresa)
    .values({ nome: `[teste] ${nome}` })
    .returning({ id: empresa.id });
  const empresaId = criada!.id;

  return comEmpresa(empresaId, usuarioTeste, async (tx) => {
    const [t] = await tx
      .insert(tutor)
      .values({ nome: `Tutor ${nome}`, telefone: `+5511${String(Date.now()).slice(-8)}${nome.length}` })
      .returning({ id: tutor.id });
    const [p] = await tx
      .insert(pet)
      .values({ tutorId: t!.id, nome: `Pet ${nome}`, porte: "M" })
      .returning({ id: pet.id });
    const [s] = await tx
      .insert(servico)
      .values({ nome: `Banho ${nome}`, precoCentavos: 5000, duracaoMin: 60 })
      .returning({ id: servico.id });
    return { empresaId, tutorId: t!.id, petId: p!.id, servicoId: s!.id };
  });
}

/** Apaga, como migrador, as linhas das empresas criadas pelo teste (e as usuárias delas). */
export async function apagarEmpresas(empresaIds: string[]): Promise<void> {
  if (empresaIds.length === 0) return;
  const { pool, banco } = conexaoMigrador();
  try {
    await banco.transaction(async (tx) => {
      await tx.delete(pet).where(inArray(pet.empresaId, empresaIds));
      await tx.delete(tutor).where(inArray(tutor.empresaId, empresaIds));
      await tx.delete(servico).where(inArray(servico.empresaId, empresaIds));
      await tx.delete(user).where(inArray(user.empresaId, empresaIds)); // session e account em cascata
      await tx.delete(auditoria).where(inArray(auditoria.empresaId, empresaIds));
      await tx.delete(empresa).where(inArray(empresa.id, empresaIds));
    });
  } finally {
    await pool.end();
  }
}

/** Apaga, como migrador, usuárias sem empresa criadas pelo teste (administradores). */
export async function apagarUsuarias(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const { pool, banco } = conexaoMigrador();
  try {
    await banco.transaction(async (tx) => {
      const usuarias = await tx.delete(user).where(inArray(user.email, emails)).returning({ id: user.id });
      const ids = usuarias.map((u) => u.id);
      if (ids.length > 0) await tx.delete(auditoria).where(inArray(auditoria.registroId, ids));
    });
  } finally {
    await pool.end();
  }
}

/** E-mail único por execução, para os testes não colidirem entre si. */
export function emailTeste(prefixo: string): string {
  return `${prefixo}-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`;
}

/** Cria a dona de uma empresa como o painel faz: createUser no servidor, com empresa_id. */
export async function criarDona(empresaId: string, email: string, senha: string): Promise<string> {
  const { user: criada } = await auth.api.createUser({
    body: { email, password: senha, name: "Dona de teste", role: "user", data: { empresaId } },
  });
  return criada.id;
}

/** Chama a rota HTTP do Better Auth, como o navegador faria. */
export function requisicaoAuth(
  caminho: string,
  corpo: unknown,
  opcoes: { cookie?: string; ip?: string } = {},
): Promise<Response> {
  const base = process.env.BETTER_AUTH_URL!;
  return auth.handler(
    new Request(`${base}/api/auth${caminho}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: base,
        "x-forwarded-for": opcoes.ip ?? ipTeste(),
        ...(opcoes.cookie ? { cookie: opcoes.cookie } : {}),
      },
      body: JSON.stringify(corpo),
    }),
  );
}

/** IP aleatório por chamada, para um teste não esbarrar no limite de tentativas de outro. */
export function ipTeste(): string {
  const parte = () => Math.floor(Math.random() * 250) + 1;
  return `10.${parte()}.${parte()}.${parte()}`;
}

/** Entra pela rota HTTP e devolve o cabeçalho Cookie da sessão. */
export async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await requisicaoAuth("/sign-in/email", { email, password: senha });
  expect(resposta.status, "login deveria funcionar").toBe(200);
  return resposta.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** Código SQLSTATE do erro do Postgres, mesmo quando o Drizzle o embrulha em outro erro. */
export function codigoPg(erro: unknown): string | undefined {
  let atual: unknown = erro;
  while (atual instanceof Error) {
    if ("code" in atual && typeof atual.code === "string") return atual.code;
    atual = atual.cause;
  }
  return undefined;
}

/** Espera que a operação falhe com um dos códigos SQLSTATE informados. */
export async function esperarErroPg(operacao: Promise<unknown>, ...codigos: string[]): Promise<void> {
  const erro = await operacao.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erro, "a operação deveria ter falhado").toBeDefined();
  expect(codigos).toContain(codigoPg(erro));
}

export const SQLSTATE = {
  semPermissao: "42501", // permission denied / violação de política de RLS
  chaveEstrangeira: "23503",
  naoNulo: "23502",
} as const;
