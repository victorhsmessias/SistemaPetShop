-- Permissões e auditoria da agenda (docs/planejamento/modelo-de-dados.md, "Permissões por tabela" e "auditoria").
-- atendimento: o app lê, cria e altera; nunca apaga (atendimento é cancelado).
-- atendimento_item: a única tabela de negócio em que o app apaga. A plataforma não tem acesso a nenhuma das duas.

REVOKE ALL ON "atendimento", "atendimento_item" FROM PUBLIC;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "atendimento" TO app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "atendimento_item" TO app;
--> statement-breakpoint

-- auditar() passa a registrar a remoção: acao 'removeu', antes com a linha apagada e depois = {}.
-- Só atendimento_item usa a trigger em DELETE. As permissões da função (REVOKE ... FROM PUBLIC) são mantidas.
CREATE OR REPLACE FUNCTION auditar() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  linha jsonb := to_jsonb(CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END);
BEGIN
  INSERT INTO auditoria (empresa_id, tabela, registro_id, acao, antes, depois)
  VALUES (
    (linha ->> TG_ARGV[0])::uuid,
    TG_TABLE_NAME,
    (linha ->> 'id')::uuid,
    CASE TG_OP WHEN 'INSERT' THEN 'criou' WHEN 'UPDATE' THEN 'alterou' ELSE 'removeu' END,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN '{}'::jsonb ELSE linha END
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER atendimento_auditoria
  AFTER INSERT OR UPDATE ON "atendimento"
  FOR EACH ROW EXECUTE FUNCTION auditar('empresa_id');
--> statement-breakpoint

CREATE TRIGGER atendimento_item_auditoria
  AFTER INSERT OR UPDATE OR DELETE ON "atendimento_item"
  FOR EACH ROW EXECUTE FUNCTION auditar('empresa_id');
