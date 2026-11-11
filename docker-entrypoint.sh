#!/bin/sh
# Entrada da imagem do app (Dockerfile, ADR 0015). O container inicia como root só para ler a credencial do
# migrador, que fica num arquivo legível só pelo root (montagem de arquivo do EasyPanel em ARQUIVO_MIGRADOR, dentro
# de /segredos, pasta 0700 do root criada pela imagem). Ao subir o servidor (comando padrão "node server.js"):
#   1. confere que o arquivo existe e que o usuário node não consegue lê-lo;
#   2. aplica as migrations como migrador (dist/migrar.mjs lê o arquivo; a credencial nunca vira variável de
#      ambiente), com trava consultiva;
#   3. se falharem, sai com erro: o servidor novo não sobe, e o deploy sem queda mantém a versão anterior;
#   4. só então troca para o usuário node (su do busybox, que já vem na imagem: faz exec, o servidor continua
#      sendo o PID 1) e inicia o servidor, que não tem como ler o arquivo (regra 1 do CLAUDE.md).
# Outros comandos (por exemplo "node dist/criar-admin.mjs") também rodam como node, sem migrar.
set -eu

ARQUIVO_MIGRADOR=/segredos/database_url_migrador

como_node() {
  # "$0" do sh -c é só o nome do processo; "$@" é o comando, sem passar por outro shell.
  exec su -s /bin/sh node -c 'exec "$@"' docker-entrypoint "$@"
}

if [ -n "${DATABASE_URL_MIGRADOR+x}" ]; then
  echo "O container não vai iniciar: DATABASE_URL_MIGRADOR não é mais aceita no ambiente (ela chegaria ao healthcheck" \
    "e a qualquer docker exec). Apague a variável do serviço e monte a credencial no arquivo $ARQUIVO_MIGRADOR" \
    "(docs/operacao/variaveis.md)." >&2
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  if [ "$#" -eq 2 ] && [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
    echo "O app não vai iniciar: o container precisa subir como root para migrar (ele troca para o usuário node" \
      "antes de iniciar o servidor). Não defina outro usuário no serviço." >&2
    exit 1
  fi
  exec "$@"
fi

if [ "$#" -eq 2 ] && [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  if [ ! -f "$ARQUIVO_MIGRADOR" ]; then
    echo "O app não vai iniciar: falta o arquivo $ARQUIVO_MIGRADOR com a URL do migrador (docs/operacao/variaveis.md)." >&2
    exit 1
  fi
  # shellcheck disable=SC2016 # o $1 expande no sh do usuário node, não aqui
  if su -s /bin/sh node -c 'test -r "$1"' docker-entrypoint "$ARQUIVO_MIGRADOR"; then
    echo "O app não vai iniciar: o usuário node consegue ler $ARQUIVO_MIGRADOR. Monte o arquivo nesse caminho exato" \
      "(a pasta /segredos da imagem é só do root)." >&2
    exit 1
  fi
  if ! node dist/migrar.mjs "$ARQUIVO_MIGRADOR"; then
    echo "O app não vai iniciar: as migrations falharam (veja a mensagem acima)." >&2
    exit 1
  fi
fi

como_node "$@"
