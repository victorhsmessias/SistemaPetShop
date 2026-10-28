# 0002 — Multiempresa com banco compartilhado e isolamento por RLS

- Status: aceito
- Contexto: o sistema é um produto para vários banho e tosa, numa única VPS, com a primeira cliente como piloto. Vazar dados entre empresas é o pior erro possível. Esta decisão substitui a sugestão anterior, de uma instalação por cliente, que valia para um sistema sob medida.
- Decisão: banco único com `empresa_id` em toda tabela de negócio e Row Level Security no Postgres. Cada requisição define a empresa da sessão dentro de uma transação. O app usa um usuário do banco que não é dono das tabelas nem ignora o RLS.
- Alternativas consideradas:
  - Uma instalação (app e banco) por empresa.
  - Um schema por empresa.
  - Filtro só no código, sem RLS.
- Consequências:
  - Positivas: um deploy e uma migration valem para todas as empresas. O banco garante o isolamento mesmo se uma consulta esquecer o filtro. Empresa nova não exige infraestrutura nova.
  - Negativas: toda consulta precisa rodar dentro da transação com a empresa definida. Migrations, tarefas e o painel do administrador usam outro usuário do banco e precisam de cuidado próprio. Exige testes de isolamento no CI.
