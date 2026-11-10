# 0012 — Dados padrão da empresa criados por trigger com SECURITY DEFINER

- Status: aceito
- Contexto: cada empresa precisa nascer com as formas de pagamento (Pix, Dinheiro, Débito e Crédito) e as categorias de receita ("Atendimentos" e "Pacotes"). Quem cria a empresa é o painel do administrador, com o papel `plataforma`, que não tem acesso às tabelas de negócio (regra 1). O `comEmpresa` também não serve: só pode ser importado pelo módulo de sessão, e o `empresaId` só vem da sessão da dona (regra 2).
- Decisão:
  - Uma trigger `AFTER INSERT ON empresa` (`empresa_dados_padrao`) chama a função `criar_dados_padrao_da_empresa()`.
  - A função é `SECURITY DEFINER` e pertence ao `migrador`, dono das tabelas. Ela grava com `empresa_id = NEW.id` explícito. O dono não passa pelo RLS enquanto as tabelas não tiverem `FORCE ROW LEVEL SECURITY`.
  - `search_path` fixo (`pg_catalog, public`) e nomes de tabela qualificados. A função não recebe nenhuma entrada além de `NEW.id`, e os valores são fixos.
  - `REVOKE ALL ... FROM PUBLIC` na função. Por ser função de trigger, ela também não pode ser chamada direto.
  - O teste de estrutura falha se aparecer outra função `SECURITY DEFINER` em `public` ou função sem `search_path` fixo.
  - A mesma migration preenche as empresas que já existiam. Índices únicos de nome (`forma_pagamento (empresa_id, nome)` e `categoria (empresa_id, tipo, nome)`) tornam o preenchimento idempotente.
- Alternativas consideradas:
  - Criação tardia pelo app, no primeiro acesso da dona: dois acessos ao mesmo tempo duplicariam as linhas, uma gravação ficaria escondida numa leitura e a empresa ficaria sem dados até o primeiro acesso.
  - Permissão à `plataforma` para inserir em `forma_pagamento` e `categoria`: quebra a regra de a plataforma não tocar em tabela de negócio (ADR 0002 e modelo de dados).
  - O painel chamar `comEmpresa` com o id da empresa recém-criada: quebra a regra 2 e o ESLint, e não é atômico. Se o segundo passo falhar, a empresa fica sem os dados.
- Consequências:
  - Positivas: a criação é atômica com a empresa e vale para qualquer caminho (painel, comando, testes). Nenhum papel ganha permissão nova.
  - Negativas: há código rodando com os poderes do dono das tabelas. Ele fica pequeno, sem entrada externa e vigiado pelo teste de estrutura. Se um dia as tabelas ganharem `FORCE ROW LEVEL SECURITY`, a função terá de definir `app.empresa_id` antes de gravar.
