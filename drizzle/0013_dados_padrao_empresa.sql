-- Formas de pagamento e categorias padrão nascem com cada empresa (ADR 0012).
--
-- A empresa é criada pelo papel plataforma, que não tem acesso às tabelas de negócio. Por isso a trigger chama
-- uma função SECURITY DEFINER: ela roda como o dono das tabelas (migrador), que não passa pelo RLS enquanto as
-- tabelas não tiverem FORCE ROW LEVEL SECURITY. Cuidados:
-- - search_path fixo, para ninguém trocar as tabelas por outras com o mesmo nome;
-- - nenhuma entrada além de NEW.id: os valores são fixos;
-- - REVOKE ALL FROM PUBLIC (função de trigger não pode ser chamada direto, mas fica explícito);
-- - src/db/estrutura.test.ts barra qualquer outra função SECURITY DEFINER e search_path aberto.

CREATE FUNCTION criar_dados_padrao_da_empresa() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.forma_pagamento (empresa_id, nome)
  VALUES (NEW.id, 'Pix'), (NEW.id, 'Dinheiro'), (NEW.id, 'Débito'), (NEW.id, 'Crédito');

  INSERT INTO public.categoria (empresa_id, nome, tipo)
  VALUES (NEW.id, 'Atendimentos', 'receita'), (NEW.id, 'Pacotes', 'receita');

  RETURN NULL;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION criar_dados_padrao_da_empresa() FROM PUBLIC;
--> statement-breakpoint

CREATE TRIGGER empresa_dados_padrao
  AFTER INSERT ON "empresa"
  FOR EACH ROW EXECUTE FUNCTION criar_dados_padrao_da_empresa();
--> statement-breakpoint

-- Preenchimento das empresas que já existem. Idempotente pelos índices únicos de nome.
INSERT INTO "forma_pagamento" (empresa_id, nome)
SELECT e.id, f.nome
  FROM "empresa" e
 CROSS JOIN (VALUES ('Pix'), ('Dinheiro'), ('Débito'), ('Crédito')) AS f(nome)
ON CONFLICT (empresa_id, nome) DO NOTHING;
--> statement-breakpoint

INSERT INTO "categoria" (empresa_id, nome, tipo)
SELECT e.id, c.nome, 'receita'
  FROM "empresa" e
 CROSS JOIN (VALUES ('Atendimentos'), ('Pacotes')) AS c(nome)
ON CONFLICT (empresa_id, tipo, nome) DO NOTHING;
