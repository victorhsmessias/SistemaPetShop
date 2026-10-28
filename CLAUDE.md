# banho-e-tosa

SaaS para pequenos banho e tosa: agenda, pacotes e financeiro. Várias empresas no mesmo app e no mesmo
Postgres, isoladas por RLS. A primeira cliente é uma piloto que trabalha sozinha e usa iPhone.

## Fonte da verdade

Os documentos em `docs/` mandam. Leia a parte relevante antes de mexer no que ela cobre:

- `docs/planejamento/sistema-banho-e-tosa.md`: escopo, requisitos (H1 a H13), arquitetura e marcos.
- `docs/planejamento/modelo-de-dados.md`: tabelas, isolamento por empresa, papéis, permissões e teste de isolamento.
- `docs/adr/`: decisões aceitas (0001 a 0010).

Se um pedido contradisser os documentos, valem os documentos: avise da contradição. Mudar uma decisão exige
um ADR novo em `docs/adr/` (próximo número, mesmo formato), não editar o antigo em silêncio.

## Stack (versões fixadas no package.json)

- Next.js 16 (App Router), TypeScript estrito, ESLint 9, npm. O Next 16 difere do que você conhece:
  consulte `node_modules/next/dist/docs/` antes de usar uma API do Next. O `AGENTS.md` é gerado pelo `next dev`.
- Drizzle ORM 0.45 + drizzle-kit, driver `pg`. Nesta versão o RLS se liga com `.enableRLS()` na tabela
  (o `pgTable.withRLS` do site é da 1.0).
- Vitest 5 com Postgres de verdade, sem mocks de banco.
- TypeScript fica na 6.0 e ESLint na 9 porque `typescript-eslint` e plugins do `eslint-config-next` ainda
  não aceitam TS 7 / ESLint 10.
- Não instale bibliotecas fora da stack dos ADRs sem perguntar.

## Organização

- `src/modules/<modulo>/`: código por domínio (`empresas`, `cadastros`; depois catálogo, agenda, pacotes,
  financeiro, notificações, administração). Cada módulo é dono das suas tabelas (`schema.ts`).
- `src/db/`: infraestrutura de banco. `clientes.ts` (pools), `com-empresa.ts`, `rls.ts` (expressão e política
  padrão), `verificar-papeis.ts` (checagem na inicialização), `testes/apoio.ts`.
- `drizzle/`: migrations (geradas e SQL próprias). `db/preparacao/papeis.sql`: cria papéis e banco.
- Crie só o que a tarefa usa.

## Regras de banco (inegociáveis)

1. **Papéis.** `migrador` é dono das tabelas e só roda migrations. `app` (DATABASE_URL) é sujeito ao RLS.
   `plataforma` (DATABASE_URL_PLATAFORMA) administra empresas e não tem acesso às tabelas de negócio.
   Nenhum é superusuário nem tem BYPASSRLS. O app não lê `DATABASE_URL_MIGRADOR`.
2. **Um caminho só.** Nenhum acesso a tabela de negócio fora de `comEmpresa(empresaId, usuarioId, fn)`
   (`src/db/com-empresa.ts`). O cliente `bancoPlataforma` só no módulo `src/modules/administracao/` (e testes).
   O ESLint barra os imports proibidos; não desligue a regra.
3. **Toda tabela de negócio nova** tem `empresa_id`, RLS no padrão, chaves compostas e entra no teste de
   isolamento. Siga o checklist abaixo.
4. **Nada é apagado** nas tabelas de negócio: desativar (`ativo`/`ativa`), cancelar (com motivo) ou anonimizar.
   O `app` não recebe `DELETE`. A única exceção prevista é `atendimento_item` (próximas sessões).
5. **Dinheiro** em centavos, `integer`, nunca negativo (`check`). Nada de float.
6. **Datas** em `timestamptz` (UTC no banco), exibidas no fuso da empresa (`empresa.fuso_horario`).
   O dia de um lançamento é `date`, calculado no fuso da empresa.
7. **Status e tipos** em `text` com `check`, nunca `enum`.
8. **Nomes** em português, singular, snake_case no banco; camelCase nas chaves do Drizzle.
   Toda tabela tem `criado_em` e `atualizado_em` (`colunasDeData()`).
9. **Nenhum segredo no repositório.** Valores só no `.env` (ignorado) ou nas variáveis do EasyPanel.

## Checklist: nova tabela de negócio

1. Em `src/modules/<modulo>/schema.ts`, seguindo `src/modules/cadastros/schema.ts`:
   - `empresaId: colunaEmpresaId()` (default = empresa da transação) e `...colunasDeData()`;
   - `unique("<tabela>_empresa_id_id_key").on(t.empresaId, t.id)` para servir de alvo;
   - chaves estrangeiras para outras tabelas de negócio com `foreignKey` composta:
     `columns: [t.empresaId, t.xId]` → `foreignColumns: [x.empresaId, x.id]`;
   - `politicaDeIsolamento("<tabela>")` e `.enableRLS()`.
2. Módulo novo: inclua o schema dele no objeto `schema` de `src/db/clientes.ts`.
3. `npm run db:generate -- --name=<descricao>` e revise o SQL gerado.
4. Permissões numa migration SQL própria: `npx drizzle-kit generate --custom --name=permissoes_<tabela>`.
   Modelo em `drizzle/0001_permissoes.sql`: `REVOKE ALL ... FROM PUBLIC` e `GRANT SELECT, INSERT, UPDATE ... TO app`.
   Nada para `plataforma`.
5. Teste de isolamento do módulo (`src/modules/<modulo>/isolamento.test.ts`, modelo em `cadastros`): com A na
   transação só aparece A; inserir com `empresa_id` de B falha; apontar para registro de B falha; alterar
   linha de B atinge 0 linhas; sem empresa nada aparece e inserir falha; `plataforma` recebe erro de permissão.
6. Inclua a tabela na limpeza de `apagarEmpresas` (`src/db/testes/apoio.ts`), na ordem das chaves.
7. Os testes de estrutura (`src/db/estrutura.test.ts`) pegam a tabela sozinhos. Se falharem, corrija a
   tabela, não o teste. Exceção a "não apaga" só com base no modelo de dados (`PODE_APAGAR`).

Migration nunca é editada depois de commitada: crie outra.

## Comandos

```bash
docker compose up -d --wait   # sobe o Postgres; na 1ª vez cria papéis e banco (db/preparacao)
npm run db:migrate            # aplica as migrations como migrador
npm run db:generate -- --name=<descricao>   # gera migration a partir dos schemas
npm run dev                   # app em http://localhost:3000 (recusa subir com papel privilegiado)
npm run lint
npm run typecheck
npm test                      # integração contra o Postgres local; exige banco no ar e migrado
docker compose down -v        # apaga o banco local (o próximo `up` recria do zero)
```

Postgres local na porta 5435 (`PORTA_POSTGRES` no `.env`). Conexões no `.env` (modelo em `.env.example`).

## Como trabalhar

- Uma etapa por vez. Ao fim de cada uma: `npm run lint`, `npm run typecheck`, `npm test`, mostrar o
  resultado e fazer commit com mensagem em português.
- Antes de concluir algo que toque o banco, rode os testes de isolamento. Build vermelho por isolamento
  nunca é "flaky": é vazamento.
- Confira a documentação oficial da versão instalada em vez de confiar na memória.
