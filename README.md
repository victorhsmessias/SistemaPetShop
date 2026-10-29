# banho-e-tosa

Sistema web (SaaS) para pequenos banho e tosa organizarem agenda, pacotes e financeiro. Várias empresas usam
o mesmo app e o mesmo banco Postgres, isoladas por Row Level Security (RLS).

Planejamento, modelo de dados e decisões: pasta [`docs/`](docs/).

## Requisitos

- Node.js 22.12 ou mais novo, com npm 11.6.2 ou mais novo (`npm install -g npm@11.6.2`; o npm 10 que vem
  com o Node 22 não aceita o `package-lock.json`)
- Docker com Docker Compose

## Rodar do zero

1. **Instale as dependências**

   ```bash
   npm ci
   ```

2. **Crie o `.env`** a partir do modelo e preencha as senhas

   ```bash
   cp .env.example .env
   ```

   Gere uma senha para cada campo `SENHA_*` e para `POSTGRES_PASSWORD`, por exemplo com:

   ```bash
   node -e "console.log(require('crypto').randomBytes(18).toString('hex'))"
   ```

   Monte as três URLs com as senhas dos papéis correspondentes:

   ```
   DATABASE_URL=postgres://app:<SENHA_APP>@localhost:5435/banho_e_tosa
   DATABASE_URL_PLATAFORMA=postgres://plataforma:<SENHA_PLATAFORMA>@localhost:5435/banho_e_tosa
   DATABASE_URL_MIGRADOR=postgres://migrador:<SENHA_MIGRADOR>@localhost:5435/banho_e_tosa
   ```

   Preencha também o Better Auth:

   ```
   BETTER_AUTH_SECRET=<64 caracteres hex: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   BETTER_AUTH_URL=http://localhost:3000
   BETTER_AUTH_TRUSTED_PROXIES=
   ```

   O `.env` nunca vai para o git.

3. **Suba o Postgres**

   ```bash
   docker compose up -d --wait
   ```

   Na primeira vez (volume vazio), o container roda `db/preparacao/papeis.sql`, que cria o banco
   `banho_e_tosa` e os papéis `migrador`, `app` e `plataforma`.

4. **Rode as migrations** (sempre como `migrador`, o dono das tabelas)

   ```bash
   npm run db:migrate
   ```

5. **Rode os testes**

   ```bash
   npm test
   ```

   São testes de integração contra o Postgres local: incluem os testes de isolamento entre empresas.

6. **Crie o administrador da plataforma**

   ```bash
   npm run criar-admin
   ```

   O comando pede e-mail e senha no terminal (a senha não aparece enquanto você digita). Não existe rota
   pública para criar administrador, nem cadastro público: as donas são criadas pelo painel.

7. **Suba o app**

   ```bash
   npm run dev
   ```

   Abra <http://localhost:3000>. Ao iniciar, o app confere os papéis de `DATABASE_URL` e
   `DATABASE_URL_PLATAFORMA` e se recusa a subir se algum for superusuário, tiver `BYPASSRLS` ou puder agir
   como dono de alguma tabela, explicando o motivo no terminal.

8. **Primeiro uso**
   - Entre com o administrador: você cai em `/admin`.
   - Em "Nova empresa", crie a empresa junto com a dona e uma senha provisória.
   - A dona entra com essa senha e cai na página inicial da empresa dela. Para trocar a senha, use
     "Redefinir senha" no painel (ainda não há e-mail transacional).
   - Login: no máximo 5 tentativas por minuto por IP.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | App em modo de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`) |
| `npm test` | Testes (Vitest) contra o Postgres |
| `npm run db:generate -- --name=<descricao>` | Gera uma migration a partir dos schemas |
| `npm run db:migrate` | Aplica as migrations como `migrador` |
| `npm run criar-admin` | Cria o administrador da plataforma (pede e-mail e senha) |

## Papéis do banco

| Papel | Variável | Uso |
|---|---|---|
| `migrador` | `DATABASE_URL_MIGRADOR` | Dono das tabelas; só migrations. O app não usa. |
| `app` | `DATABASE_URL` | App e Better Auth. Nas tabelas de negócio, só a empresa da transação (RLS). |
| `plataforma` | `DATABASE_URL_PLATAFORMA` | Painel do administrador: empresas, leitura de `user` e criação na auditoria. |

Nenhum deles é superusuário nem tem `BYPASSRLS`. Detalhes em `docs/planejamento/modelo-de-dados.md`.

## Problemas comuns

- **Porta 5435 ocupada:** defina outra em `PORTA_POSTGRES` no `.env` e ajuste a porta nas três URLs.
- **Mudei as senhas no `.env` e a conexão falha:** o script dos papéis só roda com o volume vazio. Para
  recriar o banco local do zero (apaga os dados): `docker compose down -v` e repita os passos 3 e 4.
- **O app não sobe e fala em "permissão demais":** alguma URL aponta para `migrador` ou `postgres`. Use os
  papéis `app` e `plataforma`.

- **Login falha com erro de origem (403) ou o cookie não aparece:** `BETTER_AUTH_URL` precisa ser exatamente
  a URL aberta no navegador (protocolo, host e porta).

## Pendências do deploy

- **Proxy do EasyPanel e limite de tentativas:** em produção o app fica atrás do proxy. Preencha
  `BETTER_AUTH_TRUSTED_PROXIES` com o IP (ou faixa CIDR) do proxy. Sem isso, o Better Auth não identifica o IP
  de cada cliente e todos dividem o mesmo limite: 5 senhas erradas de qualquer pessoa bloqueiam o login de
  todo mundo por um minuto. Confirme no log que o aviso "could not determine a client IP" não aparece.
- **`criar-admin` dentro do container de produção:** o comando precisa rodar onde estão as variáveis de
  produção, com o `tsx` e o código-fonte disponíveis na imagem (por exemplo, pelo console do serviço no
  EasyPanel: `npm run criar-admin`). Definir isso ao montar a imagem.
- `BETTER_AUTH_URL` com `https://` e o domínio de produção; `BETTER_AUTH_SECRET` novo, só no EasyPanel. Em
  produção o cookie de sessão sai com `Secure` e `HttpOnly`.

## CI

O GitHub Actions (`.github/workflows/ci.yml`) sobe um Postgres descartável, roda o script dos papéis e as
migrations e depois lint, checagem de tipos e testes. Se um teste de isolamento falhar, o build falha. O segredo
do Better Auth é gerado na hora, só para o job.
