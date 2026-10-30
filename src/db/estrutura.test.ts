import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemasDoPapel, situacaoDoPapel } from "@/db/verificar-papeis";

// Verificações de estrutura (docs/planejamento/modelo-de-dados.md, itens 5 a 8).
// Leem o catálogo do Postgres: uma tabela nova entra nas verificações sem mudar este arquivo.

/** Únicas tabelas de negócio em que o app pode apagar (modelo de dados, "Permissões por tabela"). */
const PODE_APAGAR = new Set(["atendimento_item"]);

/**
 * Tabelas do Better Auth: ficam fora do RLS por decisão do modelo de dados, porque o login acontece
 * antes de haver empresa na transação. `user` tem empresa_id e mesmo assim não é tabela de negócio.
 * Só o Better Auth (papel app) escreve nelas; a plataforma só lê `user`. Não acrescente outras aqui.
 */
const TABELAS_BETTER_AUTH = ["user", "session", "account", "verification"];

/** `nullif(current_setting('app.empresa_id', true), '')::uuid` como o Postgres a exibe. */
const EXPRESSAO_EMPRESA = "(NULLIF(current_setting('app.empresa_id'::text, true), ''::text))::uuid";

let cliente: Client;
let tabelasDeNegocio: string[];

beforeAll(async () => {
  cliente = new Client({ connectionString: process.env.DATABASE_URL_MIGRADOR });
  await cliente.connect();
  const { rows } = await cliente.query<{ tabela: string }>(
    `select c.relname as tabela
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and c.relname <> all ($1)
      order by 1`,
    [TABELAS_BETTER_AUTH],
  );
  tabelasDeNegocio = rows.map((r) => r.tabela);
});

afterAll(async () => {
  await cliente?.end();
});

describe("estrutura do banco", () => {
  it("encontra as tabelas de negócio (sanidade)", () => {
    expect(tabelasDeNegocio).toEqual(expect.arrayContaining(["tutor", "pet"]));
  });

  it("toda tabela com empresa_id tem RLS ligado e política para app no padrão", async () => {
    const { rows } = await cliente.query<{
      tabela: string;
      rls: boolean;
      comando: string | null;
      usando: string | null;
      checando: string | null;
      padrao: string | null;
    }>(
      `select c.relname as tabela, c.relrowsecurity as rls,
              p.polcmd as comando,
              pg_get_expr(p.polqual, p.polrelid) as usando,
              pg_get_expr(p.polwithcheck, p.polrelid) as checando,
              pg_get_expr(d.adbin, d.adrelid) as padrao
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id'
         left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
         left join pg_policy p on p.polrelid = c.oid
                              and (select oid from pg_roles where rolname = 'app') = any (p.polroles)
        where n.nspname = 'public' and c.relname = any ($1)`,
      [tabelasDeNegocio],
    );

    const fora = rows
      .filter(
        (r) =>
          !r.rls ||
          r.comando !== "*" ||
          r.usando !== `(empresa_id = ${EXPRESSAO_EMPRESA})` ||
          r.checando !== `(empresa_id = ${EXPRESSAO_EMPRESA})` ||
          !r.padrao?.includes(EXPRESSAO_EMPRESA),
      )
      .map((r) => r.tabela);
    expect(fora, "tabelas sem RLS, sem política `for all to app` no padrão ou sem o default de empresa_id").toEqual([]);
    expect(new Set(rows.map((r) => r.tabela))).toEqual(new Set(tabelasDeNegocio));
  });

  it("empresa tem RLS: o app só lê a própria linha e a plataforma lê todas", async () => {
    const { rows } = await cliente.query<{ rls: boolean; politicas: string[] }>(
      `select c.relrowsecurity as rls,
              array(select r.rolname || ':' || p.polcmd::text || ':' || pg_get_expr(p.polqual, p.polrelid)
                      from pg_policy p join pg_roles r on r.oid = any (p.polroles)
                     where p.polrelid = c.oid order by 1)::text[] as politicas
         from pg_class c where c.oid = 'public.empresa'::regclass`,
    );
    expect(rows[0]!.rls).toBe(true);
    expect(rows[0]!.politicas).toEqual([`app:r:(id = ${EXPRESSAO_EMPRESA})`, "plataforma:*:true"]);
  });

  it("toda chave estrangeira entre tabelas com empresa_id inclui empresa_id", async () => {
    const { rows } = await cliente.query<{ chave: string }>(
      `select con.conname || ' em ' || con.conrelid::regclass::text as chave
         from pg_constraint con
         join pg_attribute origem on origem.attrelid = con.conrelid and origem.attname = 'empresa_id'
         join pg_attribute destino on destino.attrelid = con.confrelid and destino.attname = 'empresa_id'
        where con.contype = 'f'
          and con.connamespace = 'public'::regnamespace
          and not exists (
            select 1 from unnest(con.conkey, con.confkey) as par(coluna, referenciada)
             where par.coluna = origem.attnum and par.referenciada = destino.attnum
          )`,
    );
    expect(rows.map((r) => r.chave), "chaves estrangeiras sem empresa_id").toEqual([]);
  });

  it.each(["app", "plataforma"])(
    "%s não é superusuário, não tem BYPASSRLS e não é dono de nenhuma tabela",
    async (papel) => {
      expect(problemasDoPapel(await situacaoDoPapel(cliente, papel))).toEqual([]);
    },
  );

  it("app não apaga em nenhuma tabela de negócio", async () => {
    const { rows } = await cliente.query<{ tabela: string }>(
      `select t as tabela from unnest($1::text[]) t
        where has_table_privilege('app', 'public.' || quote_ident(t), 'DELETE')
           or has_table_privilege('app', 'public.' || quote_ident(t), 'TRUNCATE')`,
      [tabelasDeNegocio],
    );
    expect(rows.map((r) => r.tabela).filter((t) => !PODE_APAGAR.has(t))).toEqual([]);
  });

  it("entre as tabelas do Better Auth, plataforma só lê user", async () => {
    const { rows } = await cliente.query<{ permissao: string }>(
      `select t || ':' || p as permissao
         from unnest($1::text[]) t
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
        where has_table_privilege('plataforma', 'public.' || quote_ident(t), p)
        order by 1`,
      [TABELAS_BETTER_AUTH],
    );
    expect(rows.map((r) => r.permissao)).toEqual(["user:SELECT"]);
  });

  // Edições feitas à mão no schema gerado pela CLI (cabeçalho de src/modules/acesso/schema.ts).
  // Se o schema for gerado de novo sem elas, estes testes falham.
  describe("edições à mão no schema do Better Auth", () => {
    it("user.empresa_id tem chave estrangeira para empresa(id)", async () => {
      const { rows } = await cliente.query<{ definicao: string }>(
        `select pg_get_constraintdef(oid) as definicao from pg_constraint
          where conrelid = 'public."user"'::regclass and contype = 'f'`,
      );
      expect(rows.map((r) => r.definicao)).toContain("FOREIGN KEY (empresa_id) REFERENCES empresa(id)");
    });

    it("user tem a restrição de role: admin sem empresa, dona sempre com empresa", async () => {
      const { rows } = await cliente.query<{ definicao: string }>(
        `select pg_get_constraintdef(oid) as definicao from pg_constraint
          where conrelid = 'public."user"'::regclass and conname = 'user_role_empresa_check'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.definicao).toContain("role = 'admin'::text) OR (empresa_id IS NOT NULL)");
      expect(rows[0]!.definicao).toContain("ARRAY['admin'::text, 'user'::text]");
    });

    it("toda data das tabelas do Better Auth é timestamptz", async () => {
      const { rows } = await cliente.query<{ coluna: string }>(
        `select table_name || '.' || column_name as coluna from information_schema.columns
          where table_schema = 'public' and table_name = any ($1)
            and data_type in ('timestamp without time zone', 'date', 'time without time zone')
          order by 1`,
        [TABELAS_BETTER_AUTH],
      );
      expect(rows.map((r) => r.coluna)).toEqual([]);
    });

    it("user.empresa_id é uuid", async () => {
      const { rows } = await cliente.query<{ tipo: string }>(
        `select data_type as tipo from information_schema.columns
          where table_schema = 'public' and table_name = 'user' and column_name = 'empresa_id'`,
      );
      expect(rows[0]?.tipo).toBe("uuid");
    });
  });

  it("as tabelas do Better Auth existem (a lista de exclusão não está desatualizada)", async () => {
    const { rows } = await cliente.query<{ tabela: string }>(
      `select c.relname as tabela from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname = any ($1)`,
      [TABELAS_BETTER_AUTH],
    );
    expect(rows.map((r) => r.tabela).sort()).toEqual([...TABELAS_BETTER_AUTH].sort());
  });

  it("plataforma não tem nenhuma permissão nas tabelas de negócio", async () => {
    const { rows } = await cliente.query<{ tabela: string }>(
      `select t as tabela from unnest($1::text[]) t
        where has_table_privilege('plataforma', 'public.' || quote_ident(t),
                                  'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`,
      [tabelasDeNegocio.filter((t) => t !== "auditoria")],
    );
    expect(rows.map((r) => r.tabela)).toEqual([]);
  });

  it("auditoria é imutável: app só lê e cria; plataforma só cria", async () => {
    const { rows } = await cliente.query<{ permissao: string }>(
      `select papel || ':' || p as permissao
         from unnest(array['app', 'plataforma']) papel
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
        where has_table_privilege(papel, 'public.auditoria', p)
        order by 1`,
    );
    expect(rows.map((r) => r.permissao)).toEqual(["app:INSERT", "app:SELECT", "plataforma:INSERT"]);
  });
});
