-- Auditoria (ADR 0008 e docs/planejamento/modelo-de-dados.md): permissões, trigger genérica e trigger em empresa.

REVOKE ALL ON "auditoria" FROM PUBLIC;
--> statement-breakpoint

-- Imutável: app lê e cria só na própria empresa (política auditoria_isolamento); plataforma só cria.
GRANT SELECT, INSERT ON "auditoria" TO app;
--> statement-breakpoint
GRANT INSERT ON "auditoria" TO plataforma;
--> statement-breakpoint

-- Grava antes e depois de cada linha criada ou alterada. O autor vem do default de usuario_id
-- (app.usuario_id da transação). Argumento: a coluna com a empresa afetada (`empresa_id`; em empresa, `id`).
-- SECURITY INVOKER (padrão): roda com o papel de quem alterou, então o RLS da auditoria continua valendo.
CREATE FUNCTION auditar() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  depois jsonb := to_jsonb(NEW);
BEGIN
  INSERT INTO auditoria (empresa_id, tabela, registro_id, acao, antes, depois)
  VALUES (
    (depois ->> TG_ARGV[0])::uuid,
    TG_TABLE_NAME,
    (depois ->> 'id')::uuid,
    CASE TG_OP WHEN 'INSERT' THEN 'criou' ELSE 'alterou' END,
    CASE TG_OP WHEN 'UPDATE' THEN to_jsonb(OLD) END,
    depois
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION auditar() FROM PUBLIC;
--> statement-breakpoint

CREATE TRIGGER empresa_auditoria
  AFTER INSERT OR UPDATE ON "empresa"
  FOR EACH ROW EXECUTE FUNCTION auditar('id');
