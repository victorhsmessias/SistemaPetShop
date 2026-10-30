-- Permissões de servico (docs/planejamento/modelo-de-dados.md, "Permissões por tabela").
-- O app lê, cria e altera; nunca apaga (serviço é desativado). A plataforma não tem acesso.
-- servico não é auditada (o modelo de dados audita lancamento, atendimento, atendimento_item e empresa).

REVOKE ALL ON "servico" FROM PUBLIC;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "servico" TO app;
