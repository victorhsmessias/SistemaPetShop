# syntax=docker/dockerfile:1
# Imagem só do backup (ADR 0013), separada do app: o backup não depende do app estar no ar.
#   pg_dump 18 (o mesmo major do servidor), age (criptografia), rclone (envio ao R2) e tzdata (horário de São Paulo).
#   docker build -t banho-e-tosa-backup backup/
# Comando padrão: agendar.sh, que roda o backup todo dia em BACKUP_HORARIO (fuso TZ).

FROM postgres:18.6-alpine3.24

RUN apk add --no-cache age rclone tzdata

COPY --chmod=755 backup.sh restaurar.sh agendar.sh /usr/local/bin/
COPY --chmod=644 conexao.sh /usr/local/bin/

ENV TZ=America/Sao_Paulo \
    BACKUP_HORARIO=03:00

# Usuário sem privilégio (o postgres da imagem, uid 70). O arquivo temporário do backup fica em /tmp.
USER postgres
WORKDIR /tmp

# A imagem base inicia um servidor Postgres; aqui não: só os scripts.
ENTRYPOINT []
CMD ["agendar.sh"]
