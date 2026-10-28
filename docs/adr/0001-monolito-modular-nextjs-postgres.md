# 0001 — Monolito modular em Next.js com Postgres

- Status: aceito
- Contexto: uma pessoa desenvolve e mantém o produto, com volume baixo (algumas dezenas de empresas). Next.js já faz parte da stack do desenvolvedor.
- Decisão: um app Next.js com TypeScript (telas e API), dividido em módulos por domínio, sobre Postgres, acessado com Drizzle ORM.
- Alternativas consideradas:
  - Next.js e Fastify separados.
  - Microsserviços.
  - Prisma no lugar do Drizzle.
- Consequências:
  - Positivas: um deploy, um repositório e transações simples entre módulos. O Drizzle facilita a transação por requisição que o RLS exige (ADR 0002).
  - Negativas: os módulos precisam de disciplina para o código não se emaranhar. Escalar partes separadamente exigiria extrair módulos depois.
