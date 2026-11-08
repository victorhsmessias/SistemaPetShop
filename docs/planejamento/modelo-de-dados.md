# Modelo de dados — Marco 1

Versão 1.7 · 07/11/2026 · Detalha a seção 3 do planejamento para as tabelas do M1. Base: ADRs 0002 (multiempresa com RLS), 0008 (auditoria), 0010 (login) e 0012 (dados padrão da empresa).

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

- **Criação:** pela CLI do Better Auth, com o plugin admin ([plugin admin](https://www.better-auth.com/docs/plugins/admin)). A senha fica em `account.password`, com hash da própria biblioteca. A CLI não aceita a chave estrangeira para `empresa`; essa chave, as datas em `timestamptz` e a restrição de `role` são editadas à mão no schema gerado, listadas no cabeçalho do arquivo e conferidas pelos testes de estrutura.
- **Campos do plugin admin:** em `user`, `role`, `banned`, `banReason` e `banExpires`; em `session`, `impersonatedBy`.
- **Campo próprio:** `empresa_id` em `user` (uuid, referência a `empresa`), declarado em `additionalFields` com `input: false`. Nenhuma chamada do navegador grava o campo. O painel grava na criação da dona, pelo `createUser` chamado no servidor, que aceita o campo.
- **`role`:** `admin` para o administrador da plataforma, que não tem empresa, e `user` para a dona. Restrição: `role = 'admin' or empresa_id is not null`. Por isso a dona já nasce com a empresa.
- **Cadastro público bloqueado:** por `emailAndPassword.disableSignUp: true` ([e-mail e senha](https://www.better-auth.com/docs/authentication/email-password)). Como segunda barreira, o gancho `databaseHooks.user.create.before` só aceita criações vindas do painel, reconhecidas pelo caminho da chamada, e do comando de criar administrador.
- **Criar empresa e dona:** a empresa é gravada primeiro e a dona depois, em passos separados. Antes, o painel confere se o e-mail está livre. Se a dona falhar, a empresa fica sem usuária e o painel oferece criar a dona.
- **Limite de tentativas:** 5 logins por minuto por IP, contados em memória, já que há uma instância só. O login passa pela rota HTTP do Better Auth, porque chamadas `auth.api` feitas no servidor não contam no limite ([limite de tentativas](https://better-auth.com/docs/concepts/rate-limit)). Atrás do proxy do EasyPanel, `advanced.ipAddress.trustedProxies` precisa apontar para o proxy; senão o limite pode não separar os clientes.
- **Cookie e segredo:** o cookie de sessão sai `Secure` quando `BETTER_AUTH_URL` é https, e não pelo `NODE_ENV`, porque o Safari descarta cookie `Secure` em `http://localhost`. Em produção, o app não sobe sem https (localhost fica de fora, para o teste de ponta a ponta) nem com `BETTER_AUTH_SECRET` curto.
- **Ações do administrador:** redefine senha com `setUserPassword` e, em seguida, encerra as sessões abertas da usuária com `revokeUserSessions`, porque o `setUserPassword` não faz isso sozinho ([plugin admin](https://www.better-auth.com/docs/plugins/admin)). Se o encerramento falhar, o painel oferece a ação "Encerrar sessões", também registrada na auditoria, sem precisar redefinir a senha de novo. Para suporte, entra como a usuária com `impersonateUser`, que grava o id do administrador em `session.impersonatedBy`; o app usa esse id como autor na auditoria.
- **Auditoria das ações de login (ADR 0011):** o Better Auth grava pela própria conexão, então esses eventos ficam fora da transação da ação. A redefinição de senha grava um evento antes e outro com o resultado. A criação de usuária grava o evento logo depois e, se essa gravação falhar, a usuária é removida. Nenhum evento leva dado de senha.
- **Fora do RLS:** o login acontece antes de existir empresa no contexto. Só o Better Auth escreve nessas tabelas; o papel `plataforma` apenas lê `user`. Como `user` tem `empresa_id` e mesmo assim fica fora do RLS, os testes de estrutura excluem as quatro tabelas do Better Auth por uma lista explícita.

### tutor

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| nome | text | obrigatório |
| telefone | text | formato +55…; único na empresa; nulo depois da anonimização, para a regra de único não barrar outras anonimizações |
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
| confirmado_em | timestamptz | gravado ao confirmar; obrigatório quando `confirmado` e vazio quando `agendado` |
| concluido_em | timestamptz | obrigatório quando `concluido` |
| lembrete_enviado_em | timestamptz | usado no M3 |

Índices: (empresa_id, inicio) para a agenda e (empresa_id, pet_id). O vínculo com pacote (`pacote_venda_id`) entra no M2.

**Desfazer um toque errado.** O status anterior é deduzido, sem coluna nova. Reabrir um cancelado ou uma falta é o mesmo que desfazer:

- `confirmado` volta para `agendado` e limpa `confirmado_em`;
- `em_atendimento`, `cancelado` e `faltou` voltam para `confirmado` se `confirmado_em` estiver preenchido, senão para `agendado`;
- `pronto` volta para `em_atendimento`;
- `concluido` volta ao status que o atendimento tinha antes de concluir, lido da auditoria (o `antes` do último evento em que ele passou a `concluido`), e limpa `concluido_em`. Na mesma transação, a receita é cancelada com motivo obrigatório. Concluir de novo cria uma receita nova. Detalhes em "Concluir atendimento".

**Horário ocupado.** No aviso de sobreposição, `cancelado` e `faltou` não ocupam horário.

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

Índice: único em (empresa_id, atendimento_id, servico_id), porque cada serviço aparece uma vez no atendimento. Ao trocar os serviços, os mantidos são alterados, os novos são inseridos e os retirados são apagados.

### forma_pagamento

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| nome | text | Pix, Dinheiro, Débito e Crédito criadas junto com a empresa |
| taxa_percentual | numeric(5,2) | de 0 a 100; padrão 0; usado no M3 |
| ativa | boolean | padrão true |

Índices: único em (empresa_id, nome) e único em (empresa_id, id).

### categoria

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid | chave |
| empresa_id | uuid | da transação |
| nome | text | obrigatório |
| tipo | text | `receita` ou `despesa` |
| ativa | boolean | padrão true |

Criadas junto com a empresa: "Atendimentos" e "Pacotes", do tipo receita. As de despesa entram no M3. Índices: único em (empresa_id, tipo, nome), que deixa a busca de "Atendimentos" sem ambiguidade, e único em (empresa_id, id).

**Dados padrão da empresa (ADR 0012).** A trigger `empresa_dados_padrao`, `AFTER INSERT ON empresa`, chama a função `criar_dados_padrao_da_empresa()`, que cria as formas de pagamento e as categorias acima. A empresa é criada pelo papel `plataforma`, sem acesso às tabelas de negócio, então a função é `SECURITY DEFINER` e pertence ao `migrador`, dono das tabelas, que não passa pelo RLS enquanto as tabelas não tiverem `FORCE ROW LEVEL SECURITY`. Ela tem `search_path` fixo, não recebe entrada além do id da empresa e é a única função desse tipo (teste de estrutura). A criação é atômica com a empresa. A migration que a criou preencheu as empresas existentes.

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
| categoria_id | uuid | chave composta → categoria; obrigatório |
| motivo_cancelamento | text | obrigatório quando cancelado |

Restrições:

- Índice único em `atendimento_id`, só entre lançamentos não cancelados: um atendimento gera no máximo uma receita válida.
- `check`: cancelado exige motivo (não vazio); origem atendimento exige `atendimento_id`; receita paga exige forma de pagamento.
- A descrição da receita de atendimento é genérica ("Atendimento"). Nunca leva nome nem telefone do tutor, para a anonimização (H12) não deixar rastro. A tela liga o pet pelo `atendimento_id`.

Índice: (empresa_id, data).

### auditoria

| Coluna | Tipo | Regra |
|---|---|---|
| id | bigint | gerado em sequência |
| empresa_id | uuid | empresa afetada; nulo só em eventos da plataforma, como criar o administrador |
| usuario_id | uuid | quem fez; em acesso de suporte, o administrador |
| tabela | text | obrigatório |
| registro_id | uuid | obrigatório |
| acao | text | `criou`, `alterou` ou `removeu` |
| antes | jsonb | vazio ao criar |
| depois | jsonb | obrigatório; `{}` ao remover |
| quando | timestamptz | padrão `now()` |

- **Gravação:** por trigger em `lancamento`, `atendimento`, `atendimento_item` e `empresa` (e em `pacote_venda` no M2), ao criar e ao alterar. Em `atendimento_item`, a única tabela de negócio em que se apaga, a trigger também registra a remoção. A trigger lê o autor em `app.usuario_id`. Assim nenhuma alteração escapa por esquecimento no código.
- **Eventos sem alteração de tabela**, como o início de um acesso de suporte, são inseridos pelo próprio app.
- **Imutável:** ninguém altera nem apaga linhas da auditoria.
- **Texto livre e anonimização (H12).** A tabela `tutor` não é auditada, então nome e telefone do tutor não chegam à auditoria por ela. Os campos de texto livre auditados chegam: `atendimento.observacoes` e `lancamento.motivo_cancelamento` ficam copiados em `antes` e `depois`, e a auditoria continua imutável.
  - **Prevenção:** esses campos são para o serviço e para o motivo, não para dados do tutor. A tela do motivo de desfazer a conclusão avisa para não escrever nome nem telefone do cliente.
  - **Pendente:** o que a anonimização faz com esse texto na auditoria será decidido num ADR junto com a H12, no M4.

Índice: (empresa_id, quando).

## Isolamento por empresa

### Papéis no banco

| Papel | Usado por | Acesso |
|---|---|---|
| `migrador` | migrations | dono das tabelas; nunca usado com o app rodando |
| `app` | telas, API e Better Auth | tabelas de negócio só da empresa da transação (RLS); `empresa`, só a própria; tabelas do Better Auth, sem RLS |
| `plataforma` | painel do administrador e despacho das tarefas | todas as empresas e leitura de `user`; nenhum acesso às tabelas de negócio |

Nenhum desses papéis é superusuário ou tem `BYPASSRLS`, e só o `migrador` é dono de tabelas. O app confere isso ao iniciar e não sobe se estiver errado.

### Regras

1. **Política por tabela:** toda tabela de negócio tem RLS ligado e uma política para o papel `app`, que vale para leitura e escrita.
2. **Empresa da transação:** é dada por `nullif(current_setting('app.empresa_id', true), '')::uuid`. O `nullif` evita erro quando a variável fica vazia numa conexão reaproveitada. Sem empresa definida, nenhuma linha aparece e nenhuma gravação passa.
3. **Valor padrão:** `empresa_id` usa essa mesma expressão como padrão. O código não informa a empresa ao inserir e, se tentar informar outra, a política barra.
4. **Chaves compostas:** chaves estrangeiras entre tabelas de negócio incluem `empresa_id`, por exemplo `(empresa_id, tutor_id)` → `tutor (empresa_id, id)`. A checagem de chave estrangeira não passa pelo RLS; sem a chave composta, um registro poderia apontar para outra empresa.
5. **Um único caminho até o banco:** toda operação de negócio passa por uma função do app que abre a transação, define `app.empresa_id` e `app.usuario_id` com `set_config(..., true)` e executa o trabalho. O `true` limita os valores à transação, o que é seguro com pool de conexões. Nenhum módulo acessa o banco por fora dela. Uma regra do ESLint impede importar `comEmpresa` fora do módulo de sessão e dos testes; as tarefas agendadas do M3 vão entrar como exceção. No módulo de administração, o ESLint só permite `comPlataforma`, nunca o cliente `plataforma` direto, para toda ação ter autor na auditoria.
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
| user, session, account, verification | tudo, pelo Better Auth | ler `user`; nada nas outras |

O `plataforma` não escreve nas tabelas do Better Auth: toda escrita passa pela biblioteca, e `account` guarda o hash das senhas.

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
- receita paga sempre com forma de pagamento, e receita de atendimento sempre com o atendimento;
- formas de pagamento e categorias padrão criadas com cada empresa (trigger);
- nada apagado, exceto itens de atendimento;
- valores nunca negativos e fim depois do início;
- um item por serviço em cada atendimento;
- `confirmado_em` coerente com o status;
- auditoria de toda alteração no financeiro e nos atendimentos, inclusive a remoção de itens.

**O app garante:**

- transições de status e o status anterior para desfazer, inclusive o de antes da conclusão, lido da auditoria;
- conclusão só por uma função, com a forma de pagamento ativa e da empresa, o valor igual à soma dos itens e o dia no fuso da empresa;
- mudança de status gravada só se o status ainda for o que a tela mostrava, o que barra toque duplo e página desatualizada;
- itens alterados só enquanto o atendimento não estiver concluído, cancelado ou com falta;
- aviso de horário ocupado, sem contar cancelados e faltas;
- telefone normalizado para +55… e conferido: sem zero na frente, DDD sem zero e celular de 11 dígitos começando com 9;
- todo atendimento com pelo menos um serviço;
- `fim` do atendimento recalculado quando os serviços mudam, com ajuste à mão permitido depois;
- datas e horas digitadas e exibidas no fuso da empresa, nunca no fuso do servidor;
- cópia de preço e duração do catálogo;
- dia do lançamento no fuso da empresa;
- acesso conferido em cada página e ação do servidor, nunca só no layout, porque o Next.js renderiza layout e página em paralelo.

## Concluir atendimento: a transação mais importante do M1

Só pela função de conclusão do módulo `agenda`. Tudo numa única transação:

1. Confere se o status permite concluir. Vale qualquer status ativo (agendado, confirmado, em atendimento ou pronto), para ela não precisar passar por todos durante o dia. O status e o total precisam ser os que a tela mostrava.
2. Grava `status = concluido` e `concluido_em`, com o `UPDATE` condicionado ao status lido.
3. Se o atendimento for avulso, cria a receita: soma dos itens, forma de pagamento escolhida (obrigatória, ativa e da empresa), status `pago`, categoria "Atendimentos" e data de hoje no fuso da empresa.
4. As triggers registram as alterações na auditoria.

**Total zero.** O banco exige valor maior que zero. O atendimento é concluído sem receita e sem pedir forma de pagamento, e a tela avisa que não houve receita.

**Toque duplo.** Dois toques quase simultâneos passam juntos pelo passo 1. No passo 2, o segundo espera a trava da linha e, depois, o status já não é o lido, então nada é gravado. O índice único da receita é a segunda barreira. Nos dois casos, o app avisa "este atendimento já foi concluído", sem erro técnico.

**Desfazer a conclusão.** Também numa única transação: volta ao status que o atendimento tinha antes de concluir (o `antes` do último evento de conclusão na auditoria; sem evento, deduz por `confirmado_em`), limpa `concluido_em` e cancela a receita com motivo obrigatório. Sem receita (total zero), não pede motivo. A receita cancelada fica no histórico. Concluir de novo cria outra.

## Teste de isolamento (obrigatório no CI)

**Preparação:** empresas A e B, cada uma com tutor, pet, serviço, atendimento, item, forma de pagamento, categoria e lançamento.

**Com o papel `app` e a empresa A na transação, para cada tabela de negócio:**

1. Listar devolve só linhas de A.
2. Inserir com `empresa_id` de B falha.
3. Inserir em A apontando para um registro de B (por exemplo, pet com tutor de B) falha.
4. Alterar uma linha de B não atinge nenhuma linha. Apagar um item de atendimento de B também não.

**Sem empresa na transação:** listar não devolve nada e inserir falha.

**Com o papel `plataforma`:** ler uma tabela de negócio dá erro de permissão.

**Verificações de estrutura**, que pegam uma tabela nova esquecida:

5. Toda tabela com `empresa_id` tem RLS ligado e política para `app`, exceto as tabelas do Better Auth, excluídas por uma lista explícita.
6. Toda chave estrangeira entre tabelas com `empresa_id` inclui `empresa_id`.
7. `app` e `plataforma` não são superusuários, não têm `BYPASSRLS` e não são donos de nenhuma tabela.
8. `app` não apaga em nenhuma tabela de negócio, exceto `atendimento_item`, nem altera ou apaga a auditoria.
9. Entre as tabelas do Better Auth, `plataforma` só tem permissão de leitura em `user`.
10. O schema do Better Auth mantém as edições feitas à mão: chave estrangeira de `user.empresa_id` para `empresa`, restrição de `role` e datas em `timestamptz`.

## Próximos marcos

- **M2:** `pacote_tipo`, `pacote_tipo_servico`, `pacote_venda` e a coluna `pacote_venda_id` em `atendimento`.
- **M3:** `despesa_fixa` e `inscricao_push`. Passam a ser usados `taxa_percentual`, `horario_resumo`, `lembrete_enviado_em` e o status `a_receber`.
