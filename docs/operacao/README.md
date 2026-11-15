# Operação (runbook)

Como colocar no ar, atualizar, voltar uma versão, restaurar um backup e manter o banho-e-tosa no EasyPanel. Para a
primeira configuração, siga antes o [checklist de lançamento](checklist-lancamento.md). As variáveis estão em
[variaveis.md](variaveis.md). As decisões estão nos ADRs 0003 (hospedagem), 0013 (backup), 0014 (deploy) e 0015
(credencial do migrador).

## Visão geral

| Serviço no EasyPanel | Imagem | O que faz |
|---|---|---|
| `postgres` | `postgres:18` | Banco do produto, só na rede interna. Um por ambiente. |
| `app` | `ghcr.io/victorhsmessias/banho-e-tosa:<homologacao ou producao>` | App Next.js na porta 3000. Na subida, migra como `migrador` (credencial no arquivo `/segredos/database_url_migrador`, legível só pelo root) e só então inicia o servidor como o usuário `node`. |
| `backup` | `ghcr.io/victorhsmessias/banho-e-tosa-backup:<homologacao ou producao>` | Todo dia às 03:00 de São Paulo: `pg_dump` criptografado com age e enviado ao R2. |

Fluxo de uma mudança:

1. PR → CI (lint, tipos, testes com isolamento, ponta a ponta, teste da imagem e teste do backup).
2. Merge na `main` → CI publica `sha-<commit>` e `homologacao` → gatilho → a homologação sobe.
3. Tag `vX.Y.Z` na `main` → aprovação no GitHub → a mesma imagem ganha `vX.Y.Z` e `producao` → gatilho → a
   produção sobe.

Em cada subida, o `docker-entrypoint.sh` migra antes de o servidor novo entrar. Se a migration falhar, o container
sai com erro, e o deploy sem queda mantém a versão anterior no ar.

### Credencial do migrador e o Shell do app

A URL do `migrador` (dono das tabelas) não é variável de ambiente: é uma montagem de arquivo do serviço `app` em
`/segredos/database_url_migrador`, numa pasta que só o root abre (ADR 0015). O container sobe como root, migra e
troca para o usuário `node`; o servidor e o healthcheck rodam como `node` e não leem o arquivo.

- O Shell do EasyPanel (e o `docker exec`) entra como **root**, que lê o arquivo. Para qualquer comando de rotina,
  rode como `node`: `su -s /bin/sh node -c '<comando>'` (no terminal da VPS: `docker exec -u node`).
- Trocar a senha do `migrador` ou o nome do banco: edite o conteúdo da montagem e faça o deploy.
- Nunca crie a variável `DATABASE_URL_MIGRADOR` no serviço `app`: o container recusa subir com ela.

## Regra das migrations

**Toda migration precisa ser compatível com a versão anterior do app.** Durante o deploy, a versão antiga continua
atendendo sobre o schema novo, e um rollback é só voltar a imagem, sem restaurar o banco. Na prática:

- acrescentar coluna nula ou com padrão, tabela, índice ou trigger: pode;
- renomear ou apagar coluna ou tabela, mudar tipo, tornar `not null` uma coluna que a versão anterior não preenche:
  em duas versões. Na primeira, o código para de usar (ou passa a preencher). Na seguinte, a migration remove ou
  restringe;
- migration nunca é editada depois de commitada: crie outra.

## Primeiro deploy

Siga o [checklist de lançamento](checklist-lancamento.md), na ordem. Resumo:

1. Postgres 18 do ambiente, com os quatro papéis e o banco (SQL na seção [Papéis do banco](#papéis-do-banco)).
2. Serviço `app` com tudo o que a subida exige **antes do primeiro deploy**: a faixa do proxy em
   `BETTER_AUTH_TRUSTED_PROXIES`, o domínio provisório com HTTPS em `BETTER_AUTH_URL` e a montagem da credencial do
   migrador; mais os limites e o deploy sem queda ligado. Só então o primeiro deploy.
3. Gatilho de deploy como secret do Environment no GitHub e re-execução do CI da `main`. Até aqui o job
   `deploy-homologacao` fica vermelho de propósito (falta o secret); é esperado e some neste passo.
4. Conferir `https://<url>/api/health` → `{"status":"ok"}` e o log da subida
   (`Migrations: em dia`, sem `could not determine a client IP`).
5. Criar o administrador ([abaixo](#criar-o-administrador-e-uma-empresa)).
6. Serviço `backup`, monitor externo e teste de restauração.

## Deploy de rotina

- **Homologação:** merge na `main`. Acompanhe o CI. O job `deploy-homologacao` só roda com tudo verde. No EasyPanel,
  o log do serviço `app` mostra `Migrations: em dia` e depois o servidor pronto.
- **Produção:** depois de conferir a homologação, crie a tag no commit da `main` que está na homologação:

  ```bash
  git checkout main && git pull
  git tag v1.0.0 && git push origin v1.0.0
  ```

  No GitHub (Actions → execução da tag), aprove o job `deploy-producao`. Ele etiqueta a imagem `sha-<commit>` já
  testada como `v1.0.0` e `producao` e chama o gatilho da produção.
- **Conferir:** `https://<url de produção>/api/health` e o resumo do job, que mostra o digest.

## Rollback

Volta a imagem, nunca o banco: a regra das migrations garante que a versão anterior roda sobre o schema atual.

1. No GitHub (Actions), abra a execução da versão boa e copie a tag `sha-<commit>` do resumo. Também dá para listar
   em Packages → banho-e-tosa.
2. No EasyPanel, serviço `app` → Source → Image: troque `...:producao` por `...:sha-<commit bom>` e faça o deploy.
3. Conferir o `/api/health`.
4. Corrigido o problema, volte a imagem para `...:producao` e lance uma tag nova.

Restaurar o banco só em perda de dados ([abaixo](#restaurar-um-backup)).

## Criar o administrador e uma empresa

O administrador é criado dentro do container do app, onde estão as variáveis do ambiente:

1. EasyPanel → serviço `app` → Shell (`sh`). Ele entra como root.
2. `su -s /bin/sh node -c 'node dist/criar-admin.mjs'` (roda como `node`, sem acesso à credencial do migrador)
3. Informe o e-mail e a senha (a senha não aparece ao digitar).

Depois entre com ele em `https://<url>/login`. Em `/admin`, "Nova empresa" cria a empresa e a dona com uma senha
provisória (formas de pagamento e categorias nascem com a empresa). A redefinição de senha e o encerramento de
sessões também ficam no painel.

## Papéis do banco

O `pg_dump` não leva papéis: eles são criados uma vez por servidor, como superusuário (`postgres`), antes das
migrations e antes de qualquer restauração. No EasyPanel: serviço `postgres` → Shell → `psql -U postgres`, e cole
(troque cada `<SENHA_...>` por uma senha forte e diferente, e guarde as quatro no gerenciador de senhas):

```sql
create role migrador login password '<SENHA_MIGRADOR>' nosuperuser nocreatedb nocreaterole nobypassrls;
-- Limite de conexões do app: ver "Limite de conexões do papel app", abaixo.
create role app login password '<SENHA_APP>' nosuperuser nocreatedb nocreaterole nobypassrls noinherit connection limit 30;
create role plataforma login password '<SENHA_PLATAFORMA>' nosuperuser nocreatedb nocreaterole nobypassrls noinherit;
-- Só leitura, para o backup. BYPASSRLS exige superusuário.
create role backup login password '<SENHA_BACKUP>' nosuperuser nocreatedb nocreaterole bypassrls;
grant pg_read_all_data to backup;

create database banho_e_tosa owner migrador;
revoke all on database banho_e_tosa from public;
grant connect on database banho_e_tosa to migrador, app, plataforma, backup;
```

É o mesmo que o `db/preparacao/papeis.sql` faz. A extensão `unaccent` é criada pela primeira migration, como
`migrador` (dono do banco), e precisa estar disponível:
`select name from pg_available_extensions where name = 'unaccent';` deve devolver uma linha (a imagem oficial do
Postgres traz).

Gere senhas com `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` (só letras e números,
sem problema dentro das URLs).

### Limite de conexões do papel app

O `/api/health` não tem autenticação, e uma rajada de requisições (ou um bug que vaze conexões) não pode esgotar
as conexões do Postgres e derrubar o login. Duas proteções:

- **No app:** as checagens simultâneas do `/api/health` dividem a mesma checagem em andamento, então cada instância
  abre no máximo uma conexão de saúde por vez (`src/db/saude.ts`); nada fica em cache.
- **No banco:** `CONNECTION LIMIT 30` no papel `app`. Conta: durante o deploy sem queda rodam **duas instâncias**
  do app ao mesmo tempo, e cada uma usa até 10 conexões do pool (`CONEXOES_POR_POOL` em `src/db/clientes.ts`), 1 do
  `/api/health` e 1 da conferência dos papéis na subida: 2 × 12 = 24. Os 6 de folga cobrem o `criar-admin` e um
  `psql` de diagnóstico como `app`. O `max_connections` padrão do Postgres é 100: sobram 70 para `plataforma`
  (também até 10 por instância), `migrador`, `backup` e as 3 reservadas ao superusuário, que continua entrando
  mesmo com o app no limite.

Se o limite for atingido, o app recebe `too many connections for role "app"` (no log, `código 53300`) e as telas
falham até conexões se liberarem; os outros papéis e o superusuário seguem entrando. Se isso aparecer com uso
normal, aumente o limite e o pool juntos, sem passar do que o `max_connections` comporta:

```sql
alter role app connection limit <novo valor>;   -- como postgres; vale para as próximas conexões
select rolname, rolconnlimit from pg_roles where rolname = 'app';
```

Mudar o `CONEXOES_POR_POOL` ou rodar mais de duas instâncias do app exige refazer a conta (e o teste em
`src/db/estrutura.test.ts`).

## Restaurar um backup

O backup é restaurado sempre num banco **separado e vazio**, nunca por cima do banco em uso. A chave privada do age
só sai do gerenciador de senhas (ou da segunda cópia) na hora de restaurar, e é apagada depois.

### Teste de restauração (antes do lançamento e depois uma vez por mês)

No computador do Victor, sem tocar na produção. Pré-requisitos:

- Docker, com as portas 5437 e 5438 livres (o banco de destino fica na 5438);
- a chave privada do age num arquivo (por exemplo `C:\restauracao\chave.txt`);
- um token do R2 **só de leitura** ("Object Read only") desse bucket;
- para o passo 3 (testes contra o banco restaurado):
  - o **Node 26** (a versão do `.nvmrc`, `node --version` mostra `v26...`) e o npm 11.6.2 ou mais novo;
  - este repositório na **mesma versão que está em produção**, para os testes conferirem o schema que o backup
    traz: `git fetch --tags` e `git checkout v<versão em produção>` (a tag do último deploy da produção). Antes da
    primeira tag, use o commit da imagem em uso na homologação (`git checkout <commit>`, o `sha-<commit>` do
    resumo do job `publicar`);
  - as dependências instaladas nessa versão: `npm ci`, na raiz do repositório.

1. Suba um Postgres vazio com os papéis (o compose do teste do backup tem um pronto, com senhas descartáveis):

   ```bash
   docker compose -f docker-compose.backup-teste.yml -p restauracao up -d --wait destino
   ```

2. Restaure o backup mais recente. No PowerShell, troque os valores entre `< >`; o comando do Bash é igual, com `\`
   no fim das linhas:

   ```powershell
   docker run --rm --network restauracao_default `
     -e DATABASE_URL_DESTINO=postgres://migrador:teste-migrador@destino:5432/banho_e_tosa `
     -e BACKUP_S3_ENDPOINT=https://<id da conta>.r2.cloudflarestorage.com -e BACKUP_S3_BUCKET=<bucket> `
     -e BACKUP_S3_ACCESS_KEY_ID=<id do token de leitura> -e BACKUP_S3_SECRET_ACCESS_KEY=<segredo do token de leitura> `
     -e BACKUP_AGE_CHAVE_ARQUIVO=/chave/chave.txt -v C:\restauracao:/chave:ro `
     ghcr.io/victorhsmessias/banho-e-tosa-backup:producao restaurar.sh ultimo
   ```

   A saída lista as linhas por tabela e confere o RLS.
3. Rode contra o banco restaurado o mesmo conjunto que o `npm run test:backup` roda no CI:
   `npm run test:banco-restaurado` (todos os `isolamento.test.ts`, o `estrutura.test.ts` e o
   `papel-backup.test.ts`). Eles criam e apagam dados `[teste]` na cópia. As variáveis abaixo valem só para o
   terminal aberto e têm prioridade sobre o `.env`, se houver um. As senhas são as descartáveis do compose do teste.
   `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` precisam existir porque os testes carregam o módulo de login; qualquer
   valor descartável serve (nada aqui toca a produção). No PowerShell, na raiz do repositório:

   ```powershell
   $env:DATABASE_URL="postgres://app:teste-app@localhost:5438/banho_e_tosa"
   $env:DATABASE_URL_PLATAFORMA="postgres://plataforma:teste-plataforma@localhost:5438/banho_e_tosa"
   $env:DATABASE_URL_MIGRADOR="postgres://migrador:teste-migrador@localhost:5438/banho_e_tosa"
   $env:DATABASE_URL_BACKUP="postgres://backup:teste-backup@localhost:5438/banho_e_tosa"
   $env:BETTER_AUTH_SECRET="segredo-descartavel-do-teste-de-restauracao-0000000000"
   $env:BETTER_AUTH_URL="http://localhost:3000"
   npm run test:banco-restaurado
   ```

   No Bash, o mesmo com `export NOME=valor` em cada linha. Todos os arquivos precisam passar; uma falha de
   isolamento no banco restaurado é vazamento, nunca "flaky".

4. Anote a data, o nome do backup, as contagens e o tempo total (a meta é restaurar em até 2 h).
5. Apague tudo: `docker compose -f docker-compose.backup-teste.yml -p restauracao down -v`. Apague também o arquivo da
   chave.

O `npm run test:backup` faz esse caminho inteiro de forma automática, com dados de teste, em todo CI.

### Restauração de verdade (perda de dados)

1. Avise a piloto. Se o banco ainda responde, pare o serviço `app` para ninguém gravar durante a troca.
2. No Postgres do ambiente (Shell → `psql -U postgres`), crie um banco novo. Os papéis já existem no servidor; num
   servidor novo, crie antes os papéis ([acima](#papéis-do-banco)):

   ```sql
   create database banho_e_tosa_restaurado owner migrador;
   revoke all on database banho_e_tosa_restaurado from public;
   grant connect on database banho_e_tosa_restaurado to migrador, app, plataforma, backup;
   ```

3. No EasyPanel, abra o Shell (`sh`) do serviço `backup`. Ele já está na rede interna e tem as variáveis do R2.
   Cole a chave privada num arquivo temporário (só agora ela entra na VPS), rode a restauração e apague a chave:

   ```sh
   umask 077 && cat > /tmp/chave.txt     # cole a chave (as 3 linhas do age-keygen) e tecle Ctrl+D
   DATABASE_URL_DESTINO='postgres://migrador:<SENHA_MIGRADOR>@<host interno do postgres>:5432/banho_e_tosa_restaurado' \
   BACKUP_AGE_CHAVE_ARQUIVO=/tmp/chave.txt restaurar.sh ultimo
   rm -f /tmp/chave.txt
   ```

   Para um backup específico, troque `ultimo` pelo nome do arquivo (`banho-e-tosa-<data>.dump.age`). O host interno
   do Postgres é o mesmo de `DATABASE_URL_BACKUP`.
4. **Confira que a chave saiu da VPS** (`ls /tmp`) e reinicie o serviço `backup`, o que também limpa o `/tmp`.
5. Troque o nome do banco em `DATABASE_URL` e `DATABASE_URL_PLATAFORMA` do serviço `app`, no arquivo montado em
   `/segredos/database_url_migrador` do mesmo serviço e em `DATABASE_URL_BACKUP` do serviço `backup`, para
   `banho_e_tosa_restaurado`. Faça o deploy. Ou, com o app
   parado, renomeie os bancos (`alter database ... rename to ...`).
6. Confira o `/api/health`, entre como a dona e confira a agenda e o financeiro.
7. Guarde o banco antigo até ter certeza; depois `drop database`.

## Limites de memória e CPU sugeridos

A VPS é dividida com outros projetos (ADR 0003). Configure em cada serviço do EasyPanel (Resources): a reserva é o
uso esperado, e o limite é o teto.

| Serviço | Reserva de memória | Limite de memória | Reserva de CPU | Limite de CPU |
|---|---|---|---|---|
| `app` | 256 MB | 512 MB | 0,25 | 1 |
| `postgres` | 512 MB | 1 GB | 0,25 | 1 |
| `backup` | 64 MB | 256 MB | 0 | 0,5 |
| homologação (cada serviço) | metade dos valores acima | metade | 0 | 0,5 |

Esses valores comportam a piloto e algumas dezenas de empresas (carga baixa). Reveja se o app passar de 70% do
limite com frequência (a mesma régua do planejamento para mudar de VPS).

## Monitor e alertas

Ver o [checklist](checklist-lancamento.md#12-monitor-externo-e-teste-de-alerta). Resumo:

| Alerta | Como chega |
|---|---|
| App fora do ar | O UptimeRobot checa `https://<url>/api/health` a cada 5 min, de fora da VPS. Qualquer resposta diferente de 200 (503 com o banco fora, erro de rede, VPS caída) dispara e-mail. |
| Backup que não rodou | O `backup.sh` chama `BACKUP_HEARTBEAT_URL` (Healthchecks.io) a cada sucesso e `<url>/fail` no erro, sem pôr a URL na linha de comando. Sem sinal em 1 dia mais 2 h de tolerância, ou com `/fail`, o Healthchecks.io avisa por e-mail ou Telegram. |
| Tarefa da fila que falhou depois das novas tentativas | A fila (pg-boss) entra no M3. Quando entrar, cada tarefa que esgotar as novas tentativas chama o `/fail` de um check próprio no Healthchecks.io, e o painel do administrador mostra o reprocessamento (ADR 0007). Hoje não há fila. |

## Logs

- EasyPanel → serviço → Logs. O app registra no stdout.
- **Nunca há nome nem telefone de tutor, nem dado de senha**:
  - erros do banco viram só código, restrição, tabela e o identificador da empresa (`src/db/erro-do-banco.ts`);
  - o log do Better Auth passa pelo mesmo resumo;
  - o backup não imprime valores de variáveis.
- Se aparecer `could not determine a client IP`, o `BETTER_AUTH_TRUSTED_PROXIES` está errado
  ([checklist](checklist-lancamento.md#5-proxy-confiável-conferência)).
