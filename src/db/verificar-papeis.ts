import { Client, type ClientBase } from "pg";

import { lerUrl } from "@/db/clientes";

type Situacao = {
  superusuario: string[];
  bypassrls: string[];
  tabelas: string[];
};

/**
 * Lê no catálogo o que torna um papel perigoso para o RLS. Considera também os papéis
 * dos quais ele é membro: quem pode assumir o papel do dono das tabelas escapa do RLS.
 */
export async function situacaoDoPapel(cliente: ClientBase, papel: string): Promise<Situacao> {
  const { rows } = await cliente.query<Situacao>(
    `select
       coalesce((select array_agg(r.rolname::text order by r.rolname) from pg_roles r
                 where r.rolsuper and pg_has_role($1, r.oid, 'MEMBER')), '{}'::text[]) as superusuario,
       coalesce((select array_agg(r.rolname::text order by r.rolname) from pg_roles r
                 where r.rolbypassrls and pg_has_role($1, r.oid, 'MEMBER')), '{}'::text[]) as bypassrls,
       coalesce((select array_agg((n.nspname || '.' || c.relname)::text order by 1) from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 where c.relkind in ('r', 'p')
                   and n.nspname not in ('pg_catalog', 'information_schema')
                   and n.nspname not like 'pg_toast%'
                   and pg_has_role($1, c.relowner, 'MEMBER')), '{}'::text[]) as tabelas`,
    [papel],
  );
  return rows[0]!;
}

export function problemasDoPapel(situacao: Situacao): string[] {
  const problemas: string[] = [];
  if (situacao.superusuario.length > 0)
    problemas.push(`é superusuário ou membro de um (${situacao.superusuario.join(", ")})`);
  if (situacao.bypassrls.length > 0)
    problemas.push(`tem BYPASSRLS ou é membro de quem tem (${situacao.bypassrls.join(", ")})`);
  if (situacao.tabelas.length > 0)
    problemas.push(`é dono, ou membro do dono, de tabelas (${situacao.tabelas.join(", ")})`);
  return problemas;
}

/**
 * Confere os papéis de DATABASE_URL e DATABASE_URL_PLATAFORMA. Com permissão demais,
 * o RLS deixa de isolar as empresas: lança um erro explicando o motivo.
 */
export async function verificarPapeis(): Promise<void> {
  const erros: string[] = [];

  for (const variavel of ["DATABASE_URL", "DATABASE_URL_PLATAFORMA"] as const) {
    const cliente = new Client({ connectionString: lerUrl(variavel), connectionTimeoutMillis: 5000 });
    await cliente.connect();
    try {
      const { rows } = await cliente.query<{ papel: string }>("select current_user as papel");
      const papel = rows[0]!.papel;
      for (const problema of problemasDoPapel(await situacaoDoPapel(cliente, papel))) {
        erros.push(`${variavel} (papel "${papel}") ${problema}.`);
      }
    } finally {
      await cliente.end();
    }
  }

  if (erros.length > 0) {
    throw new Error(
      [
        "O app não vai iniciar: o usuário do banco tem permissão demais e o RLS não isolaria as empresas.",
        ...erros.map((erro) => `  - ${erro}`),
        "Use os papéis app e plataforma criados por db/preparacao/papeis.sql.",
      ].join("\n"),
    );
  }
}

/** Para a inicialização do servidor: em caso de problema, explica e encerra o processo. */
export async function verificarPapeisOuEncerrar(): Promise<void> {
  try {
    await verificarPapeis();
  } catch (erro) {
    console.error(`\n${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exit(1);
  }
}
