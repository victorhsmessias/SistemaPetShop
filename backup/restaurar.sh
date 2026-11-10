#!/bin/sh
# Restaura um backup num banco SEPARADO e vazio (ADR 0013; passo a passo em docs/operacao/README.md).
#   restaurar.sh ultimo                         o backup mais recente do bucket
#   restaurar.sh banho-e-tosa-<data>.dump.age   um backup do bucket, pelo nome
#   restaurar.sh /caminho/arquivo.dump.age      um arquivo local (montado no container)
#
# Antes: o banco de destino existe, pertence ao migrador e está vazio, e os papéis migrador, app, plataforma e
# backup já existem no servidor (o pg_dump não leva os papéis; sem eles as permissões não são restauradas).
#
# Variáveis:
#   DATABASE_URL_DESTINO       conexão do migrador com o banco de destino (separado do de produção)
#   BACKUP_AGE_CHAVE_ARQUIVO   caminho da chave PRIVADA do age, montada só na hora (somente leitura)
#   BACKUP_S3_*                as mesmas do backup.sh, quando o backup vem do bucket
set -eu
# O ash do busybox (Alpine), que roda este script, suporta pipefail.
# shellcheck disable=SC3040
set -o pipefail

PREFIXO="banho-e-tosa"
registrar() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') restauração: $*"; }
falhar() { registrar "ERRO: $*" >&2; exit 1; }

[ "$#" -eq 1 ] || falhar "informe o backup: ultimo, o nome do arquivo no bucket ou um caminho local."
[ -n "${DATABASE_URL_DESTINO:-}" ] || falhar "DATABASE_URL_DESTINO não definida."
[ -n "${BACKUP_AGE_CHAVE_ARQUIVO:-}" ] || falhar "BACKUP_AGE_CHAVE_ARQUIVO não definida."
[ -r "$BACKUP_AGE_CHAVE_ARQUIVO" ] || falhar "não consegui ler a chave privada em BACKUP_AGE_CHAVE_ARQUIVO."

consultar() { psql --no-psqlrc -X -v ON_ERROR_STOP=1 -tA --dbname="$DATABASE_URL_DESTINO" -c "$1"; }

papeis=$(consultar "select count(*) from pg_roles where rolname in ('migrador', 'app', 'plataforma', 'backup')")
[ "$papeis" = "4" ] || falhar "crie antes os papéis migrador, app, plataforma e backup (db/preparacao/papeis.sql)."
tabelas=$(consultar "select count(*) from pg_tables where schemaname in ('public', 'drizzle')")
[ "$tabelas" = "0" ] || falhar "o banco de destino não está vazio ($tabelas tabelas): restaure num banco novo."

origem_remota() {
  export RCLONE_CONFIG_DESTINO_TYPE=s3
  export RCLONE_CONFIG_DESTINO_PROVIDER="${BACKUP_S3_PROVEDOR:-Cloudflare}"
  export RCLONE_CONFIG_DESTINO_ENDPOINT="${BACKUP_S3_ENDPOINT:?defina BACKUP_S3_ENDPOINT}"
  export RCLONE_CONFIG_DESTINO_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:?defina BACKUP_S3_ACCESS_KEY_ID}"
  export RCLONE_CONFIG_DESTINO_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:?defina BACKUP_S3_SECRET_ACCESS_KEY}"
  export RCLONE_CONFIG_DESTINO_REGION=auto
  export RCLONE_CONFIG_DESTINO_NO_CHECK_BUCKET=true
  PASTA="destino:${BACKUP_S3_BUCKET:?defina BACKUP_S3_BUCKET}/$PREFIXO"
}

case "$1" in
  /*)
    [ -r "$1" ] || falhar "arquivo local não encontrado: $1"
    registrar "restaurando o arquivo local $1..."
    ler() { cat "$1"; }
    ;;
  *)
    origem_remota
    NOME="$1"
    if [ "$NOME" = "ultimo" ]; then
      # Os nomes levam a data em UTC (AAAA-MM-DDTHHMMSSZ): o maior é o mais recente.
      NOME=$(rclone lsf --include "$PREFIXO-*.dump.age" "$PASTA" | sort | tail -n 1)
      [ -n "$NOME" ] || falhar "nenhum backup encontrado no bucket."
    fi
    registrar "restaurando $NOME do bucket..."
    ler() { rclone cat "$PASTA/$NOME"; }
    ;;
esac

# --no-owner: tudo fica com o migrador (dono do banco de destino). --exit-on-error: nada de restauração pela metade
# sem aviso. --single-transaction: ou restaura tudo, ou nada.
ler "$1" \
  | age --decrypt --identity "$BACKUP_AGE_CHAVE_ARQUIVO" \
  | pg_restore --no-owner --exit-on-error --single-transaction --dbname="$DATABASE_URL_DESTINO"

registrar "conferência (linhas por tabela):"
consultar "select format('  %s: %s', c.relname,
                  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' order by c.relname"
sem_rls=$(consultar "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id'
                     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
                       and c.relname not in ('user', 'session', 'account', 'verification')")
[ "$sem_rls" = "0" ] || falhar "$sem_rls tabela(s) com empresa_id ficaram sem RLS depois de restaurar."
registrar "concluída. Rode os testes de isolamento contra este banco antes de usá-lo (docs/operacao/README.md)."
