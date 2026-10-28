-- Permissões dos papéis (docs/planejamento/modelo-de-dados.md, "Permissões por tabela").
-- As políticas de RLS ficam no schema do Drizzle; os GRANTs ficam aqui, porque o Drizzle não os gerencia.
-- Tabela de negócio nova: conceder a `app` só select, insert e update. Nunca delete (exceção: atendimento_item).

REVOKE ALL ON "empresa", "tutor", "pet" FROM PUBLIC;
--> statement-breakpoint

-- empresa: o app só lê a própria linha (política empresa_propria); a plataforma administra todas.
GRANT SELECT ON "empresa" TO app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "empresa" TO plataforma;
--> statement-breakpoint

-- Tabelas de negócio: o app lê, cria e altera, sem apagar. A plataforma não tem acesso.
GRANT SELECT, INSERT, UPDATE ON "tutor", "pet" TO app;
