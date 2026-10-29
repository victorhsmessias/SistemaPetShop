-- Permissões das tabelas do Better Auth (docs/planejamento/modelo-de-dados.md, "Permissões por tabela").
-- Ficam fora do RLS: o login acontece antes de haver empresa na transação.
-- Toda escrita passa pelo Better Auth, com o papel app. A plataforma só lê `user`:
-- `account` guarda o hash das senhas.

REVOKE ALL ON "user", "session", "account", "verification" FROM PUBLIC;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification" TO app;
--> statement-breakpoint

GRANT SELECT ON "user" TO plataforma;
