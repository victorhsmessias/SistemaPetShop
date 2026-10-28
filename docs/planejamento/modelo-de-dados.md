# Modelo de dados — Marco 1

Versão 1 · 28/10/2026 · Detalha a seção 3 do planejamento para as tabelas do M1. Base: ADRs 0002 (multiempresa com RLS), 0008 (auditoria) e 0010 (login).

## Convenções

- Nomes em português, no singular, em snake_case. As tabelas do Better Auth mantêm os nomes padrão.
- Chave primária `id uuid`, gerada pelo banco. No Better Auth, `advanced.database.generateId: "uuid"` usa o mesmo tipo ([Better Auth, banco de dados](https://better-auth.com/docs/concepts/database)).
- Dinheiro em centavos (`integer`, nunca negativo).
- Momentos em `timestamptz`. O dia de um lançamento é `date`, calculado no fuso da empresa.
- Status e tipos em `text` com `check`, mais fácil de evoluir que `enum`.
- Toda tabela tem `criado_em` e `atualizado_em`.
- Toda tabela de negócio tem `empresa_id`, preenchido pelo contexto da transação (ver "Isolamento por empresa").

## Tabelas

### empresa

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| nome | text | obrigatório |
| fuso_horario | text | padrão `America/Sao_Paulo` |
| status | text | `ativa` ou `suspensa`; padrão `ativa` |
| horario_resumo | time | padrão `07:00`; usado no M3 |

### Tabelas do Better Auth: user, session, account e verification

- **Criação:** pela CLI do Better Auth, com o plugin admin ([plugin admin](https://www.better-auth.com/docs/plugins/admin)). A senha fica em `account.password`, com hash da própria biblioteca.
- **Campos do plugin admin:** em `user`, `role`, `banned`, `banReason` e `banExpires`; em `session`, `impersonatedBy`.
- **Campo próprio:** `empresa_id` em `user` (uuid, referência a `empresa`), declarado em `additionalFields` com `input: false`. Assim nenhuma chamada pública grava o campo; só o painel do administrador.
- **`role`:** `admin` para o administrador da plataforma, que não tem empresa, e `user` para a dona. Restrição: `role = 'admin' or empresa_id is not null`.
- **Cadastro público bloqueado:** pelo gancho `databaseHooks.user.create.before`, como recomenda a documentação ([cadastro desligado](https://www.better-auth.com/docs/errors/signup_disabled)). Só a criação feita pelo painel passa, com `createUser`. Conferir na implementação como o gancho reconhece a chamada do painel.
- **Ações do administrador:** redefine senha com `setUserPassword`. Para suporte, entra como a usuária com `impersonateUser`, que grava o id do administrador em `session.impersonatedBy`; o app usa esse id como autor na auditoria.
- **Fora do RLS:** o login acontece antes de existir empresa no contexto. Só o Better Auth e o painel mexem nessas tabelas.

### tutor

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| nome | text | obrigatório |
| telefone | text | formato +55…; único na empresa; vazio depois da anonimização |
| observacoes | text | opcional |
| anonimizado_em | timestamptz | preenchido na anonimização (H12) |

Índices: único em (empresa_id, telefone) e único em (empresa_id, id), que serve às chaves compostas. A busca por nome não precisa de índice especial: cada empresa tem poucos registros.

### pet

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| tutor_id | uuid | chave composta → tutor |
| nome | text | obrigatório |
| especie | text | `cao`, `gato` ou `outro`; padrão `cao` |
| raca | text | opcional |
| porte | text | `P`, `M`, `G` ou `GG` |
| observacoes | text | comportamento, alergias |
| ativo | boolean | padrão true |

Índice: (empresa_id, tutor_id).

### servico

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| nome | text | obrigatório |
| preco_centavos | integer | ≥ 0 |
| duracao_min | integer | > 0 |
| ativo | boolean | padrão true |

### atendimento

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| pet_id | uuid | chave composta → pet |
| inicio | timestamptz | obrigatório |
| fim | timestamptz | depois de `inicio`; vem da soma das durações e pode ser ajustado |
| status | text | `agendado`, `confirmado`, `em_atendimento`, `pronto`, `concluido`, `cancelado` ou `faltou` |
| observacoes | text | opcional |
| confirmado_em | timestamptz | opcional |
| concluido_em | timestamptz | obrigatório quando `concluido` |
| lembrete_enviado_em | timestamptz | usado no M3 |

Índices: (empresa_id, inicio) para a agenda e (empresa_id, pet_id). O vínculo com pacote (`pacote_venda_id`) entra no M2.

### atendimento_item

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| atendimento_id | uuid | chave composta → atendimento |
| servico_id | uuid | chave composta → servico |
| descricao | text | nome do serviço, copiado no agendamento |
| preco_centavos | integer | copiado do catálogo; editável |
| duracao_min | integer | copiado do catálogo; editável |

### forma_pagamento

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| nome | text | Pix, Dinheiro, Débito e Crédito criadas junto com a empresa |
| taxa_percentual | numeric(5,2) | padrão 0; usado no M3 |
| ativa | boolean | padrão true |

### categoria

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| nome | text | obrigatório |
| tipo | text | `receita` ou `despesa` |
| ativa | boolean | padrão true |

Criadas junto com a empresa: "Atendimentos" e "Pacotes", do tipo receita. As de despesa entram no M3.

### lancamento

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| tipo | text | `receita` ou `despesa` |
| descricao | text | obrigatório |
| valor_centavos | integer | > 0 |
| taxa_centavos | integer | ≥ 0; padrão 0; usado no M3 |
| data | date | dia do pagamento, no fuso da empresa |
| status | text | `pago`, `a_receber` ou `cancelado` |
| origem | text | `atendimento`, `pacote`, `despesa_fixa` ou `manual` |
| atendimento_id | uuid | chave composta → atendimento; obrigatório quando a origem é atendimento |
| forma_pagamento_id | uuid | chave composta → forma_pagamento; obrigatória em receita paga |
| categoria_id | uuid | chave composta → categoria |
| motivo_cancelamento | text | obrigatório quando cancelado |

Restrições:

- Índice único em `atendimento_id`, só entre lançamentos não cancelados: um atendimento gera no máximo uma receita válida.
- `check`: cancelado exige motivo; origem atendimento exige `atendimento_id`; receita paga exige forma de pagamento.

Índice: (empresa_id, data).

### auditoria

| Coluna | Tipo | Regra |
|---|---|---|
| id | bigint | gerado em sequência |
| empresa_id | uuid | empresa afetada |
| usuario_id | uuid | quem fez; em acesso de suporte, o administrador |
| tabela | text | obrigatório |
| registro_id | uuid | obrigatório |
| acao | text | `criou` ou `alterou` |
| antes | jsonb | vazio ao criar |
| depois | jsonb | obrigatório |
| quando | timestamptz | padrão `now()` |

- **Gravação:** por trigger em `lancamento`, `atendimento`, `atendimento_item` e `empresa` (e em `pacote_venda` no M2). A trigger lê o autor em `app.usuario_id`. Assim nenhuma alteração escapa por esquecimento no código.
- **Eventos sem alteração de tabela**, como o início de um acesso de suporte, são inseridos pelo próprio app.
- **Imutável:** ninguém altera nem apaga linhas da auditoria.

Índice: (empresa_id, quando).

## Isolamento por empresa

### Papéis no banco

| Papel | Usado por | Acesso |
|---|---|---|
| `migrador` | migrations | dono das tabelas; nunca usado com o app rodando |
| `app` | telas, API e Better Auth | tabelas de negócio só da empresa da transação (RLS); `empresa`, só a própria; tabelas do Better Auth, sem RLS |
| `plataforma` | painel do administrador e despacho das tarefas | todas as empresas e as tabelas do Better Auth; nenhum acesso às tabelas de negócio |

Nenhum desses papéis é superusuário ou tem `BYPASSRLS`, e só o `migrador` é dono de tabelas. O app confere isso ao iniciar e não sobe se estiver errado.

### Regras

1. **Política por tabela:** toda tabela de negócio tem RLS ligado e uma política para o papel `app`, que vale para leitura e escrita.
2. **Empresa da transação:** é dada por `nullif(current_setting('app.empresa_id', true), '')::uuid`. O `nullif` evita erro quando a variável fica vazia numa conexão reaproveitada. Sem empresa definida, nenhuma linha aparece e nenhuma gravação passa.
3. **Valor padrão:** `empresa_id` usa essa mesma expressão como padrão. O código não informa a empresa ao inserir e, se tentar informar outra, a política barra.
4. **Chaves compostas:** chaves estrangeiras entre tabelas de negócio incluem `empresa_id`, por exemplo `(empresa_id, tutor_id)` → `tutor (empresa_id, id)`. A checagem de chave estrangeira não passa pelo RLS; sem a chave composta, um registro poderia apontar para outra empresa.
5. **Um único caminho até o banco:** toda operação de negócio passa por uma função do app que abre a transação, define `app.empresa_id` e `app.usuario_id` com `set_config(..., true)` e executa o trabalho. O `true` limita os valores à transação, o que é seguro com pool de conexões. Nenhum módulo acessa o banco por fora dela.
6. **Empresa suspensa:** a função recusa empresa suspensa. Ao suspender, o painel também chama `banUser` nas usuárias da empresa, o que derruba as sessões abertas.

Padrão aplicado a cada tabela de negócio (exemplo com `tutor`):

```sql
alter table tutor enable row level security;

create policy tutor_isolamento on tutor
  for all to app
  using (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)
  with check (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);

alter table tutor
  alter column empresa_id set default nullif(current_setting('app.empresa_id', true), '')::uuid;
```

Na tabela `empresa`, a política do `app` compara `id`, e não `empresa_id`. O papel `plataforma` tem uma política que libera todas as linhas.

### Permissões por tabela

| Tabela | `app` | `plataforma` |
|---|---|---|
| empresa | ler a própria | ler, criar e alterar |
| tutor, pet, servico, atendimento, forma_pagamento, categoria, lancamento | ler, criar e alterar; nunca apagar | sem acesso |
| atendimento_item | ler, criar, alterar e apagar | sem acesso |
| auditoria | criar e ler | criar |
| user, session, account, verification | tudo, pelo Better Auth | ler e alterar |

Nada é apagado, exceto itens de atendimento:

- Tutor é anonimizado.
- Pet, serviço, forma de pagamento e categoria são desativados.
- Atendimento e lançamento são cancelados.

## Onde cada regra é garantida

**O banco garante:**

- isolamento entre empresas;
- vínculos sempre dentro da mesma empresa;
- uma receita válida por atendimento;
- motivo em todo cancelamento de lançamento;
- nada apagado, exceto itens de atendimento;
- valores nunca negativos e fim depois do início;
- auditoria de toda alteração no financeiro e nos atendimentos.

**O app garante:**

- transições de status;
- itens alterados só antes de concluir;
- aviso de horário ocupado;
- telefone normalizado para +55…;
- cópia de preço e duração do catálogo;
- dia do lançamento no fuso da empresa.

## Concluir atendimento: a transação mais importante do M1

Tudo numa única transação:

1. Confere se o status permite concluir. Vale qualquer status ativo (agendado, confirmado, em atendimento ou pronto), para ela não precisar passar por todos durante o dia.
2. Grava `status = concluido` e `concluido_em`.
3. Se o atendimento for avulso, cria a receita: soma dos itens, forma de pagamento escolhida e data de hoje no fuso da empresa.
4. As triggers registram as alterações na auditoria.

Dois toques quase simultâneos em "concluir" podem passar juntos pelo passo 1. O índice único da receita barra o segundo, e o app avisa que o atendimento já foi concluído.

## Teste de isolamento (obrigatório no CI)

**Preparação:** empresas A e B, cada uma com tutor, pet, serviço, atendimento, item, forma de pagamento, categoria e lançamento.

**Com o papel `app` e a empresa A na transação, para cada tabela de negócio:**

1. Listar devolve só linhas de A.
2. Inserir com `empresa_id` de B falha.
3. Inserir em A apontando para um registro de B (por exemplo, pet com tutor de B) falha.
4. Alterar uma linha de B não atinge nenhuma linha.

**Sem empresa na transação:** listar não devolve nada e inserir falha.

**Com o papel `plataforma`:** ler uma tabela de negócio dá erro de permissão.

**Verificações de estrutura**, que pegam uma tabela nova esquecida:

5. Toda tabela com `empresa_id` tem RLS ligado e política para `app`.
6. Toda chave estrangeira entre tabelas com `empresa_id` inclui `empresa_id`.
7. `app` e `plataforma` não são superusuários, não têm `BYPASSRLS` e não são donos de nenhuma tabela.
8. `app` não apaga em nenhuma tabela de negócio, exceto `atendimento_item`, nem altera ou apaga a auditoria.

## Próximos marcos

- **M2:** `pacote_tipo`, `pacote_tipo_servico`, `pacote_venda` e a coluna `pacote_venda_id` em `atendimento`.
- **M3:** `despesa_fixa` e `inscricao_push`. Passam a ser usados `taxa_percentual`, `horario_resumo`, `lembrete_enviado_em` e o status `a_receber`.
