# Variáveis de ambiente

Cada variável que o código lê, para que serve, onde se configura e se é segredo. Nenhum valor real vai para o
repositório: em desenvolvimento eles ficam no `.env` (modelo em `.env.example`, ignorado pelo git); em homologação e
produção, nas variáveis de cada serviço do EasyPanel.

O app confere as variáveis ao subir (`src/configuracao/ambiente.ts`, chamado por `src/instrumentation.ts`) e não sobe
se faltar alguma, explicando o que está errado no log, sem repetir valores secretos.

"Homologação e produção" abaixo quer dizer o build de produção (`NODE_ENV=production`, já definido na imagem) servido
fora de `localhost`. O build de produção na máquina (`npm run test:e2e`, `docker-compose.prod.yml`) fica de fora das
regras marcadas com (H/P).

## Serviço do app

| Variável | Para que serve | Onde | Segredo |
|---|---|---|---|
| `DATABASE_URL` | Conexão do papel `app`, sujeito ao RLS: telas, API, Better Auth e `/api/health`. Formato `postgres://app:<senha>@<host>:5432/banho_e_tosa`. Obrigatória. | `.env`; serviço app | sim (senha) |
| `DATABASE_URL_PLATAFORMA` | Conexão do papel `plataforma`: painel do administrador e `criar-admin`. Obrigatória. | `.env`; serviço app | sim (senha) |
| `DATABASE_URL_MIGRADOR` | Conexão do papel `migrador`, dono das tabelas: só as migrations. No serviço app, a imagem migra na subida e **remove a variável antes de iniciar o servidor**; (H/P) se ela chegar ao servidor, o app não sobe (regra 1 do `CLAUDE.md`). Em desenvolvimento também serve para a limpeza dos testes. | `.env`; serviço app | sim (senha) |
| `BETTER_AUTH_SECRET` | Assina os cookies de sessão. No mínimo 32 caracteres aleatórios, um por ambiente; trocar derruba todas as sessões. | `.env`; serviço app | sim |
| `BETTER_AUTH_URL` | URL em que o app é aberto no navegador (protocolo, host e porta exatos). Define o cookie `Secure` quando é https. (H/P) Precisa ser https. Nada no código depende do domínio final: com a URL provisória do EasyPanel, use a URL provisória. | `.env`; serviço app | não |
| `BETTER_AUTH_TRUSTED_PROXIES` | IPs ou faixas CIDR do proxy reverso, separados por vírgula. Com eles o Better Auth acha o IP de cada cliente no `X-Forwarded-For` e aplica o limite de 5 tentativas de login por minuto **por pessoa**. Sem eles, atrás do proxy todos dividem o mesmo limite: cinco senhas erradas de qualquer pessoa bloqueiam o login de todas por um minuto. (H/P) Obrigatória. Faixas abertas (`0.0.0.0/0`, `::/0`) são recusadas: deixariam qualquer um forjar o IP. Como achar a faixa: `docs/operacao/checklist-lancamento.md`, seção "Proxy confiável". | `.env` (vazia); serviço app | não |
| `NODE_ENV` | `production` no build e na imagem (definida no `Dockerfile`). Não configure à mão. | imagem | não |
| `PORT`, `HOSTNAME` | Porta e interface do servidor do Next (`3000` e `0.0.0.0`, definidas no `Dockerfile`). | imagem | não |

## Serviço de backup (imagem `backup/`)

Ver ADR 0013. O serviço de backup não recebe nenhuma variável do app.

| Variável | Para que serve | Onde | Segredo |
|---|---|---|---|
| `DATABASE_URL_BACKUP` | Conexão do papel `backup` (só leitura, `BYPASSRLS`) usada pelo `pg_dump`. Em desenvolvimento, usada pelos testes do papel. | serviço backup; `.env` | sim (senha) |
| `BACKUP_AGE_DESTINATARIO` | Chave **pública** do age (`age1...`) que criptografa o backup. A privada nunca vai para a VPS. | serviço backup | não |
| `BACKUP_S3_ENDPOINT` | Endpoint S3 do R2: `https://<id da conta>.r2.cloudflarestorage.com`. | serviço backup | não |
| `BACKUP_S3_BUCKET` | Nome do bucket do backup. | serviço backup | não |
| `BACKUP_S3_ACCESS_KEY_ID` | Access Key ID do token do R2 restrito a esse bucket ("Object Read & Write"). | serviço backup | sim |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret Access Key do mesmo token. | serviço backup | sim |
| `BACKUP_S3_PROVEDOR` | Opcional. Provedor S3 do rclone; padrão `Cloudflare` (o teste local usa `Rclone`). | serviço backup | não |
| `BACKUP_HEARTBEAT_URL` | Opcional. URL do monitor chamada a cada backup bem-sucedido; no erro, chama `<url>/fail` (padrão do Healthchecks.io). | serviço backup | sim (quem tem a URL pode fingir backups) |
| `BACKUP_HORARIO` | Opcional. Hora do backup diário, `HH:MM`, padrão `03:00`. | serviço backup | não |
| `TZ` | Opcional. Fuso do agendador, padrão `America/Sao_Paulo` (definido na imagem). | serviço backup | não |
| `DATABASE_URL_DESTINO` | Só na restauração: conexão do `migrador` com o banco **separado** que recebe o backup. | linha de comando da restauração | sim (senha) |
| `BACKUP_AGE_CHAVE_ARQUIVO` | Só na restauração: caminho da chave **privada** do age, montada no container só nessa hora. | linha de comando da restauração | o arquivo é |

## Postgres local (só desenvolvimento)

Lidas pelo `docker-compose.yml` e pelo `db/preparacao/docker-init.sh` na primeira subida do volume.

| Variável | Para que serve | Onde | Segredo |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Senha do superusuário `postgres` do container local. | `.env` | sim |
| `SENHA_MIGRADOR`, `SENHA_APP`, `SENHA_PLATAFORMA`, `SENHA_BACKUP` | Senhas dos papéis criados por `db/preparacao/papeis.sql`. Mudá-las depois exige recriar o volume (`docker compose down -v`). | `.env` | sim |
| `PORTA_POSTGRES` | Porta do Postgres no computador (padrão 5435). | `.env` | não |
| `COMPOSE_PROJECT_NAME` | Opcional. Nome do projeto do compose, para mais de uma cópia do repositório na mesma máquina. | `.env` | não |

## Testes

| Variável | Para que serve | Onde | Segredo |
|---|---|---|---|
| `PORTA_E2E` | Opcional. Porta do app no ponta a ponta (padrão 3000). | `.env` | não |
| `E2E_RELOGIO` | Opcional. Hora (`HH:MM`, São Paulo) do relógio do servidor no ponta a ponta; padrão `12:00`. O `npm run test:e2e:meia-noite` usa `23:50` e `00:10`. | linha de comando | não |
| `E2E_SEM_BUILD` | Opcional. Reaproveita o build já feito no ponta a ponta. | linha de comando | não |
| `CI` | Definida pelo GitHub Actions; muda o Playwright para o modo de CI. | GitHub Actions | não |
| `PORTA_IMAGEM` | Opcional. Porta do app no teste da imagem (`npm run test:imagem`), padrão 3006. | linha de comando ou `.env` | não |
| `PORTA_BACKUP_ORIGEM`, `PORTA_BACKUP_DESTINO` | Opcionais. Portas dos dois Postgres do teste do backup (`npm run test:backup`), padrão 5437 e 5438. | linha de comando ou `.env` | não |
