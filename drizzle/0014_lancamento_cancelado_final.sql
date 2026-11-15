-- Lançamento cancelado é estado final (planejamento, "Estados": a receber -> pago; qualquer um -> cancelado).
-- Nenhum caminho do app tira um lançamento de cancelado: desfazer a conclusão cancela a receita, e concluir de
-- novo cria outra. O banco passa a garantir isso: uma linha cancelada não muda mais (status, valor, motivo...).
-- Compatível com a versão anterior do app, que nunca altera lançamento cancelado.
-- Função comum (sem SECURITY DEFINER), com search_path fixo como toda função nossa (src/db/estrutura.test.ts).

CREATE FUNCTION lancamento_cancelado_final() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'cancelado' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Lançamento cancelado não pode ser alterado.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'lancamento_cancelado_final', TABLE = 'lancamento';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lancamento_cancelado_final() FROM PUBLIC;
--> statement-breakpoint

CREATE TRIGGER lancamento_cancelado_final
  BEFORE UPDATE ON "lancamento"
  FOR EACH ROW EXECUTE FUNCTION lancamento_cancelado_final();
