# banho-e-tosa

SaaS para pequenos banho e tosa: agenda, pacotes e financeiro. Várias empresas no mesmo app e no mesmo
Postgres, isoladas por RLS. A primeira cliente é uma piloto que trabalha sozinha e usa iPhone.

## Fonte da verdade

Os documentos em `docs/` mandam. Leia a parte relevante antes de mexer no que ela cobre:

- `docs/planejamento/sistema-banho-e-tosa.md`: escopo, requisitos (H1 a H13), arquitetura e marcos.
- `docs/planejamento/modelo-de-dados.md`: tabelas, isolamento, papéis, permissões, Better Auth e teste de isolamento.
- `docs/adr/`: decisões (0001 a 0011).

Se um pedido contradisser os documentos, valem os documentos: avise da contradição. Mudar uma decisão exige
um ADR novo em `docs/adr/` (próximo número, mesmo formato), não editar o antigo em silêncio.

## Stack (versões fixadas no package.json)

- Next.js 16 (App Router), TypeScript estrito, ESLint 9, npm 11.6.2+. O Next 16 difere do que você conhece:
  consulte `node_modules/next/dist/docs/` antes de usar uma API do Next. O `AGENTS.md` é gerado pelo `next dev`.
- Drizzle ORM 0.45 + drizzle-kit, driver `pg`. RLS com `.enableRLS()` (o `pgTable.withRLS` do site é da 1.0).
- Better Auth 1.7 (e-mail e senha + plugin admin). Código-fonte em `node_modules/better-auth/dist` quando a
  documentação não bastar. Schema das tabelas gerado pela CLI oficial (cabeçalho de `acesso/schema.ts`).
- Vitest 5 com Postgres de verdade, sem mocks de banco. `tsx` roda os comandos em `scripts/` (`.mts`).
- TypeScript fica na 6.0 e ESLint na 9 porque `typescript-eslint` e plugins do `eslint-config-next` ainda
  não aceitam TS 7 / ESLint 10.
- Não instale bibliotecas fora da stack dos ADRs sem perguntar.

## Organização

- `src/modules/<modulo>/`: código por domínio. Cada módulo é dono das suas tabelas (`schema.ts`).
  - `empresas`, `cadastros` (tutor, pet);
  - `acesso`: Better Auth (`auth.ts`), tabelas do login, sessão (`sessao.ts`), cliente do navegador;
  - `auditoria`: tabela e `registrarEvento`;
  - `administracao`: painel do administrador (`exigirAdmin`, empresas, usuárias, criar administrador).
- `src/db/`: `clientes.ts` (pools), `com-empresa.ts`, `com-plataforma.ts`, `rls.ts`, `verificar-papeis.ts`,
  `testes/apoio.ts`.
- `src/app/`: telas e Server Actions; regra de negócio fica nos módulos. `scripts/criar-admin.mts`.
- `drizzle/`: migrations (geradas e SQL próprias). `db/preparacao/papeis.sql`: cria papéis e banco.
- Crie só o que a tarefa usa.

## Regras (inegociáveis)

1. **Papéis.** `migrador` é dono das tabelas e só roda migrations. `app` (DATABASE_URL) é sujeito ao RLS e é o
   papel do Better Auth. `plataforma` administra empresas, só lê `user`, só cria na `auditoria` e não tem
   acesso às tabelas de negócio. Nenhum é superusuário nem tem BYPASSRLS. O app não lê `DATABASE_URL_MIGRADOR`.
2. **O `empresaId` só vem da sessão.** Rotas e ações da dona usam `comEmpresaDaSessao(cabecalhos, fn)`
   (`src/modules/acesso/sessao.ts`), nunca um `empresaId` do corpo, da URL ou de formulário. `comEmpresa` só é
   importada pelo módulo `acesso` (exceção futura: tarefas agendadas do M3). O ESLint barra; não desligue.
3. **Acesso conferido em cada página e em cada ação do servidor, nunca só no layout.** O Next.js renderiza
   layout e página em paralelo, e o layout não roda nas Server Actions. Em `/admin`: `conferirAdminOuRedirecionar`
   em toda página e `exigirAdmin` no início de cada função do módulo `administracao`.
4. **Cliente `plataforma`** só por `comPlataforma(usuarioId, fn)`, que grava o autor para a auditoria, e só no
   módulo `administracao` e no comando `criar-admin`. `bancoApp` só em `src/db` e no `auth.ts`.
5. **Cadastro público bloqueado.** Usuárias só nascem pelo `createUser` do plugin admin (painel ou
   `criar-admin`): `disableSignUp` + gancho `user.create.before` que só aceita `/admin/create-user`.
   A dona nasce já com `empresa_id` (restrição `user_role_empresa_check`).
6. **Nenhum dado de senha** vai para a auditoria nem para os logs (`registrarEvento` recusa campos de senha).
7. **Toda tabela de negócio nova** tem `empresa_id`, RLS no padrão, chaves compostas e entra no teste de
   isolamento. Se o modelo de dados manda auditá-la, ganha a trigger na mesma migration (checklist abaixo).
8. **Nada é apagado** nas tabelas de negócio: desativar (`ativo`/`ativa`), cancelar (com motivo) ou anonimizar.
   O `app` não recebe `DELETE`. A única exceção prevista é `atendimento_item`. A auditoria é imutável.
9. **Dinheiro** em centavos, `integer`, nunca negativo (`check`). Nada de float.
10. **Datas** em `timestamptz` (UTC no banco), exibidas no fuso da empresa (`empresa.fuso_horario`).
    O dia de um lançamento é `date`, calculado no fuso da empresa.
11. **Status e tipos** em `text` com `check`, nunca `enum`. Nomes em português, singular, snake_case no banco;
    camelCase nas chaves do Drizzle. Toda tabela tem `criado_em` e `atualizado_em` (`colunasDeData()`).
12. **Nenhum segredo no repositório.** Valores só no `.env` (ignorado) ou nas variáveis do EasyPanel.
13. **Ações do Better Auth** (criar usuária, redefinir senha) auditam fora da transação (ADR 0011): criação
    com evento logo depois e remoção se ele falhar; redefinição com evento antes e outro com o resultado.

## Checklist: nova tabela de negócio

1. Em `src/modules/<modulo>/schema.ts`, seguindo `src/modules/cadastros/schema.ts`:
   - `empresaId: colunaEmpresaId()` (default = empresa da transação) e `...colunasDeData()`;
   - `unique("<tabela>_empresa_id_id_key").on(t.empresaId, t.id)` para servir de alvo;
   - chaves estrangeiras para outras tabelas de negócio com `foreignKey` composta:
     `columns: [t.empresaId, t.xId]` → `foreignColumns: [x.empresaId, x.id]`;
   - `politicaDeIsolamento("<tabela>")` e `.enableRLS()`.
2. Módulo novo: inclua o schema dele no objeto `schema` de `src/db/clientes.ts`.
3. `npm run db:generate -- --name=<descricao>` e revise o SQL gerado.
4. Migration SQL própria (`npx drizzle-kit generate --custom --name=permissoes_<tabela>`), modelo em
   `drizzle/0001_permissoes.sql`: `REVOKE ALL ... FROM PUBLIC` e `GRANT SELECT, INSERT, UPDATE ... TO app`.
   Nada para `plataforma`. Se a tabela é auditada (modelo de dados, seção auditoria), na mesma migration:
   `CREATE TRIGGER <tabela>_auditoria AFTER INSERT OR UPDATE ON <tabela> FOR EACH ROW EXECUTE FUNCTION auditar('empresa_id');`
5. Teste de isolamento do módulo (`src/modules/<modulo>/isolamento.test.ts`, modelo em `cadastros`): com A na
   transação só aparece A; inserir com `empresa_id` de B falha; apontar para registro de B falha; alterar
   linha de B atinge 0 linhas; sem empresa nada aparece e inserir falha; `plataforma` recebe erro de permissão.
6. Inclua a tabela na limpeza de `apagarEmpresas` (`src/db/testes/apoio.ts`), na ordem das chaves
   (a `auditoria` é apagada logo antes de `empresa`).
7. Os testes de estrutura (`src/db/estrutura.test.ts`) pegam a tabela sozinhos. Se falharem, corrija a
   tabela, não o teste. Exceções só com base no modelo de dados (`PODE_APAGAR`, `TABELAS_BETTER_AUTH`).

Migration nunca é editada depois de commitada: crie outra.

## Comandos

```bash
docker compose up -d --wait   # sobe o Postgres; na 1ª vez cria papéis e banco (db/preparacao)
npm run db:migrate            # aplica as migrations como migrador
npm run db:generate -- --name=<descricao>   # gera migration a partir dos schemas
npm run criar-admin           # cria o administrador da plataforma (pede e-mail e senha no terminal)
npm run dev                   # app em http://localhost:3000 (recusa subir com papel privilegiado)
npm run lint
npm run typecheck
npm test                      # integração contra o Postgres local; exige banco no ar e migrado
docker compose down -v        # apaga o banco local (o próximo `up` recria do zero)
```

Postgres local na porta 5435 (`PORTA_POSTGRES` no `.env`). Conexões e Better Auth no `.env` (modelo em
`.env.example`). `BETTER_AUTH_URL` precisa ser a URL em que o app está aberto (padrão `http://localhost:3000`).

## Como trabalhar

- Uma etapa por vez. Ao fim de cada uma: `npm run lint`, `npm run typecheck`, `npm test`, mostrar o
  resultado e fazer commit com mensagem em português.
- Antes de concluir algo que toque o banco ou o login, rode os testes de isolamento. Build vermelho por
  isolamento nunca é "flaky": é vazamento.
- Testes criam dados com prefixo `[teste]` e e-mails `@teste.banho-e-tosa.local` e apagam o que criaram.
- Confira a documentação oficial da versão instalada em vez de confiar na memória.
