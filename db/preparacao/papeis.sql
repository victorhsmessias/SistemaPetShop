-- Preparação do banco: cria os papéis e o banco. Rodar UMA vez, como superusuário (postgres).
--
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v senha_migrador=... -v senha_app=... -v senha_plataforma=... \
--     -f db/preparacao/papeis.sql
--
-- Nenhum papel é superusuário nem tem BYPASSRLS (docs/planejamento/modelo-de-dados.md).
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

create database banho_e_tosa owner migrador;

revoke all on database banho_e_tosa from public;
grant connect on database banho_e_tosa to migrador, app, plataforma;
