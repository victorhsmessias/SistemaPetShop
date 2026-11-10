#!/bin/sh
# Entrada da imagem do app (Dockerfile). Ao subir o servidor (comando padrão "node server.js"):
#   1. aplica as migrations como migrador (dist/migrar.mjs, com trava consultiva);
#   2. se falharem, sai com erro: o servidor novo não sobe, e o deploy sem queda mantém a versão anterior;
#   3. remove DATABASE_URL_MIGRADOR do ambiente e só então inicia o servidor: o app nunca tem a credencial do dono
#      das tabelas (regra 1 do CLAUDE.md; o app também se recusa a subir se ela chegar até ele).
# Outros comandos (por exemplo "node dist/criar-admin.mjs") rodam direto, sem migrar.
set -eu

if [ "$#" -eq 2 ] && [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  if ! node dist/migrar.mjs; then
    echo "O app não vai iniciar: as migrations falharam (veja a mensagem acima)." >&2
    exit 1
  fi
  unset DATABASE_URL_MIGRADOR
fi

exec "$@"
