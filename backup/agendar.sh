#!/bin/sh
# Agendador do backup (comando padrão da imagem): roda backup.sh todo dia em BACKUP_HORARIO (HH:MM, padrão 03:00),
# no fuso TZ (padrão America/Sao_Paulo, sem horário de verão: 03:00 em São Paulo = 06:00 UTC).
# Não depende do app nem do pg-boss. Se um backup falhar, segue para o próximo dia; o heartbeat que não chega faz o
# monitor externo avisar.
set -eu

HORARIO="${BACKUP_HORARIO:-03:00}"
case "$HORARIO" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *) echo "agendador: BACKUP_HORARIO inválido (use HH:MM)." >&2; exit 2 ;;
esac

# Como PID 1 do container, o sh ignora o SIGTERM se não houver trap: sem isto, parar o serviço levaria 10 s e um
# SIGKILL. O sleep roda em segundo plano para o trap valer na hora (wait é interrompido pelo sinal).
trap 'echo "agendador: encerrado."; exit 0' TERM INT

echo "agendador: backup diário às $HORARIO ($(date '+%Z'), fuso ${TZ:-UTC})."
while true; do
  agora=$(date +%s)
  alvo=$(date -d "$(date '+%Y-%m-%d') $HORARIO" +%s)
  if [ "$alvo" -le "$agora" ]; then alvo=$((alvo + 86400)); fi
  echo "agendador: próximo backup em $(date -d "@$alvo" '+%Y-%m-%d %H:%M %Z')."
  sleep $((alvo - agora)) &
  wait $!
  if ! backup.sh; then
    echo "agendador: o backup falhou; tento de novo amanhã. O monitor do heartbeat vai avisar." >&2
  fi
done
