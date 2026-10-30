-- Busca sem diferenciar acentos (H1: tutor, pet e telefone). Desde o Postgres 13 a extensão é
-- "trusted": o dono do banco (migrador) cria sem ser superusuário. As funções ficam em public,
-- com EXECUTE para PUBLIC (padrão), então o app usa unaccent() nas consultas.

CREATE EXTENSION IF NOT EXISTS unaccent;
