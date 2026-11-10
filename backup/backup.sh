#!/bin/sh
# Backup do banco (ADR 0013): pg_dump (formato custom, já compactado) -> age (chave pública) -> R2 (S3).
# Retenção: depois de um envio bem-sucedido, apaga os backups com mais de 31 dias (o Bucket Lock do R2 impede apagar
# antes de 30). Se qualquer passo falhar, sai com código diferente de zero, não apaga nada e não chama o heartbeat.
#
# Variáveis (docs/operacao/variaveis.md):
#   DATABASE_URL_BACKUP            conexão do papel backup (só leitura, BYPASSRLS)
#   BACKUP_AGE_DESTINATARIO        chave PÚBLICA do age (age1...); a privada nunca fica na VPS
#   BACKUP_S3_ENDPOINT             https://<conta>.r2.cloudflarestorage.com
#   BACKUP_S3_BUCKET               nome do bucket
#   BACKUP_S3_ACCESS_KEY_ID        credencial restrita ao bucket
#   BACKUP_S3_SECRET_ACCESS_KEY
#   BACKUP_S3_PROVEDOR             opcional (padrão Cloudflare; o teste local usa Rclone)
#   BACKUP_HEARTBEAT_URL           opcional: chamada no sucesso; no erro, chama <url>/fail (padrão do Healthchecks.io)
#
# Nada aqui imprime valores de variáveis.
set -eu
# O ash do busybox (Alpine), que roda este script, suporta pipefail.
# shellcheck disable=SC3040
set -o pipefail

PREFIXO="banho-e-tosa"
RETENCAO="31d"

registrar() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') backup: $*"; }

for variavel in DATABASE_URL_BACKUP BACKUP_AGE_DESTINATARIO BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET \
  BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
  eval "valor=\${$variavel:-}"
  if [ -z "$valor" ]; then
    registrar "ERRO: $variavel não definida (veja docs/operacao/variaveis.md)." >&2
    exit 2
  fi
done
case "$BACKUP_AGE_DESTINATARIO" in
  age1*) ;;
  *) registrar "ERRO: BACKUP_AGE_DESTINATARIO precisa ser uma chave pública do age (age1...)." >&2; exit 2 ;;
esac

# Destino do rclone só por variáveis de ambiente (sem arquivo de configuração com a credencial).
export RCLONE_CONFIG_DESTINO_TYPE=s3
export RCLONE_CONFIG_DESTINO_PROVIDER="${BACKUP_S3_PROVEDOR:-Cloudflare}"
export RCLONE_CONFIG_DESTINO_ENDPOINT="$BACKUP_S3_ENDPOINT"
export RCLONE_CONFIG_DESTINO_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_DESTINO_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_DESTINO_REGION=auto
# A credencial restrita ao bucket não pode criar nem listar buckets.
export RCLONE_CONFIG_DESTINO_NO_CHECK_BUCKET=true

PASTA="destino:$BACKUP_S3_BUCKET/$PREFIXO"
NOME="$PREFIXO-$(date -u '+%Y-%m-%dT%H%M%SZ').dump.age"
TEMPORARIO="$(mktemp /tmp/backup.XXXXXX)"
SUCESSO=0

encerrar() {
  rm -f "$TEMPORARIO"
  if [ "$SUCESSO" -ne 1 ] && [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
    wget -q -T 10 -O /dev/null "${BACKUP_HEARTBEAT_URL%/}/fail" 2>/dev/null || true
  fi
}
trap encerrar EXIT

inicio=$(date +%s)
registrar "gerando o dump criptografado..."
pg_dump --format=custom --compress=6 --no-password --dbname="$DATABASE_URL_BACKUP" \
  | age --encrypt --recipient "$BACKUP_AGE_DESTINATARIO" > "$TEMPORARIO"
if [ ! -s "$TEMPORARIO" ]; then
  registrar "ERRO: o arquivo do backup ficou vazio." >&2
  exit 1
fi
tamanho=$(wc -c < "$TEMPORARIO" | tr -d ' ')

registrar "enviando $NOME ($tamanho bytes)..."
rclone copyto --retries 3 --low-level-retries 5 "$TEMPORARIO" "$PASTA/$NOME"

registrar "apagando backups com mais de $RETENCAO..."
rclone delete --min-age "$RETENCAO" --include "$PREFIXO-*.dump.age" "$PASTA"

SUCESSO=1
registrar "concluído em $(( $(date +%s) - inicio )) s: $NOME."

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  if ! wget -q -T 10 -O /dev/null "$BACKUP_HEARTBEAT_URL"; then
    registrar "AVISO: o backup foi feito, mas o heartbeat não respondeu (o monitor pode avisar por engano)." >&2
  fi
fi
