-- Permissões e auditoria do financeiro (docs/planejamento/modelo-de-dados.md, "Permissões por tabela" e "auditoria").
-- forma_pagamento, categoria e lancamento: o app lê, cria e altera; nunca apaga (desativar ou cancelar).
-- A plataforma não tem acesso a nenhuma das três.

REVOKE ALL ON "forma_pagamento", "categoria", "lancamento" FROM PUBLIC;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "forma_pagamento", "categoria", "lancamento" TO app;
--> statement-breakpoint

-- Toda criação e alteração de lançamento vai para a auditoria, com o autor da transação.
CREATE TRIGGER lancamento_auditoria
  AFTER INSERT OR UPDATE ON "lancamento"
  FOR EACH ROW EXECUTE FUNCTION auditar('empresa_id');
