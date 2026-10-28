#!/bin/sh
# Executado pela imagem oficial do Postgres na primeira inicialização (volume vazio).
# Repassa as senhas do .env para o script de preparação.
: "${SENHA_MIGRADOR:?defina SENHA_MIGRADOR no .env}"
: "${SENHA_APP:?defina SENHA_APP no .env}"
: "${SENHA_PLATAFORMA:?defina SENHA_PLATAFORMA no .env}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v senha_migrador="$SENHA_MIGRADOR" \
  -v senha_app="$SENHA_APP" \
  -v senha_plataforma="$SENHA_PLATAFORMA" \
  -f /preparacao/papeis.sql
