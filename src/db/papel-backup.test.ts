import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import { apagarEmpresas, criarEmpresaComDados, esperarErroPg, SQLSTATE, type DadosEmpresa } from "@/db/testes/apoio";

// Papel backup (ADR 0013), conectado de verdade: lê as linhas de todas as empresas (é o que o pg_dump precisa) e
// não consegue gravar, apagar nem mudar a estrutura.

let a: DadosEmpresa;
let b: DadosEmpresa;
let backup: Client;

beforeAll(async () => {
  a = await criarEmpresaComDados("Backup A");
  b = await criarEmpresaComDados("Backup B");
  const url = process.env.DATABASE_URL_BACKUP;
  if (!url) throw new Error("DATABASE_URL_BACKUP não definida (veja .env.example).");
  backup = new Client({ connectionString: url });
  await backup.connect();
});

afterAll(async () => {
  await backup?.end();
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

describe("papel backup", () => {
  it("lê as linhas das duas empresas, sem empresa na transação (BYPASSRLS)", async () => {
    const { rows } = await backup.query<{ empresa_id: string }>(
      "select distinct empresa_id from tutor where empresa_id = any($1) order by 1",
      [[a.empresaId, b.empresaId]],
    );
    expect(rows.map((r) => r.empresa_id)).toEqual([a.empresaId, b.empresaId].sort());
  });

  it("lê também a auditoria e o controle das migrations", async () => {
    await expect(backup.query("select count(*) from auditoria")).resolves.toBeDefined();
    await expect(backup.query("select count(*) from drizzle.__drizzle_migrations")).resolves.toBeDefined();
  });

  it("não grava, não altera e não apaga", async () => {
    await esperarErroPg(
      backup.query("insert into tutor (empresa_id, nome, telefone) values ($1, '[teste] x', '+5531999990000')", [
        a.empresaId,
      ]),
      SQLSTATE.semPermissao,
    );
    await esperarErroPg(backup.query("update tutor set nome = nome where id = $1", [a.tutorId]), SQLSTATE.semPermissao);
    await esperarErroPg(backup.query("delete from lancamento where id = $1", [a.lancamentoId]), SQLSTATE.semPermissao);
    await esperarErroPg(backup.query("truncate auditoria"), SQLSTATE.semPermissao);
  });

  it("não muda a estrutura nem assume outro papel", async () => {
    await esperarErroPg(backup.query("create table teste_backup (id int)"), SQLSTATE.semPermissao);
    await esperarErroPg(backup.query("alter table tutor add column x int"), SQLSTATE.semPermissao);
    await esperarErroPg(backup.query("drop table tutor"), SQLSTATE.semPermissao);
    await esperarErroPg(backup.query("set role migrador"), SQLSTATE.semPermissao);
  });
});
