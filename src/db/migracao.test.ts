import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";

import { aplicarMigracoes, CHAVE_DA_TRAVA } from "@/db/migracao";

// Migração com trava consultiva, contra o banco local (já migrado: as chamadas não têm nada a aplicar). A corrida
// de dois containers num banco vazio é provada no teste da imagem (npm run test:imagem).

const url = () => {
  const valor = process.env.DATABASE_URL_MIGRADOR;
  if (!valor) throw new Error("DATABASE_URL_MIGRADOR não definida.");
  return valor;
};

describe("aplicarMigracoes", () => {
  it("duas ao mesmo tempo terminam bem (uma espera a outra)", async () => {
    await expect(Promise.all([aplicarMigracoes({ url: url() }), aplicarMigracoes({ url: url() })])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });

  it("com a trava presa por outra conexão, espera; desiste depois do limite, e funciona quando ela é solta", async () => {
    const outra = new Client({ connectionString: url() });
    await outra.connect();
    try {
      await outra.query("select pg_advisory_lock($1)", [CHAVE_DA_TRAVA]);
      const aoEsperar = vi.fn();
      await expect(aplicarMigracoes({ url: url(), esperaMaximaMs: 1500, aoEsperar })).rejects.toThrow(/trava/);
      expect(aoEsperar).toHaveBeenCalledTimes(1);

      const esperando = aplicarMigracoes({ url: url(), esperaMaximaMs: 10_000 });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await outra.query("select pg_advisory_unlock($1)", [CHAVE_DA_TRAVA]);
      await expect(esperando).resolves.toBeUndefined();
    } finally {
      await outra.end();
    }
  });

  it("solta a trava no fim: outra conexão consegue pegá-la", async () => {
    await aplicarMigracoes({ url: url() });
    const outra = new Client({ connectionString: url() });
    await outra.connect();
    try {
      const { rows } = await outra.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [CHAVE_DA_TRAVA]);
      expect(rows[0]?.ok).toBe(true);
      await outra.query("select pg_advisory_unlock($1)", [CHAVE_DA_TRAVA]);
    } finally {
      await outra.end();
    }
  });

  it("com a senha errada, falha (e o entrypoint não sobe o app)", async () => {
    const errada = new URL(url());
    errada.password = "senha-errada";
    await expect(aplicarMigracoes({ url: errada.toString() })).rejects.toThrow();
  });
});
