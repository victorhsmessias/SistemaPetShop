-- Preparação do banco: cria os papéis e o banco. Rodar UMA vez, como superusuário (postgres).
--
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v senha_migrador=... -v senha_app=... -v senha_plataforma=... -v senha_backup=... \
--     -f db/preparacao/papeis.sql
--
-- Nenhum papel é superusuário. Só o backup tem BYPASSRLS, e só lê (docs/planejamento/modelo-de-dados.md e ADR 0013).
-- O banco pertence ao migrador: no Postgres 15+ só o dono do banco cria tabelas em public.

\set ON_ERROR_STOP on

-- Dono das tabelas; usado só pelas migrations.
create role migrador login password :'senha_migrador'
  nosuperuser nocreatedb nocreaterole nobypassrls;

-- App: telas, API e Better Auth. Sujeito ao RLS.
create role app login password :'senha_app'
  nosuperuser nocreatedb nocreaterole nobypassrls noinherit;

-- Painel do administrador e tarefas entre empresas. Sem acesso às tabelas de negócio.
create role plataforma login password :'senha_plataforma'
  nosuperuser nocreatedb nocreaterole nobypassrls noinherit;

-- Backup (pg_dump): lê todas as tabelas de todas as empresas, sem passar pelo RLS, e não escreve nada.
-- pg_read_all_data dá SELECT em toda tabela e sequência (inclusive as futuras); BYPASSRLS deixa o pg_dump ler as
-- linhas de todas as empresas. Criar papel com BYPASSRLS exige superusuário: por isso fica aqui.
create role backup login password :'senha_backup'
  nosuperuser nocreatedb nocreaterole bypassrls;
grant pg_read_all_data to backup;

create database banho_e_tosa owner migrador;

revoke all on database banho_e_tosa from public;
grant connect on database banho_e_tosa to migrador, app, plataforma, backup;
