#!/bin/sh
# SÓ PARA O TESTE AUTOMATIZADO (npm run test:backup), montado no serviço "ferramenta" de
# docker-compose.backup-teste.yml. Roda o comando com "espiões" na frente do PATH para cada programa que backup.sh e
# restaurar.sh chamam: cada espião anota os argumentos com que foi chamado (o que aparece no ps da VPS), numa linha
# por chamada, e executa o programa de verdade. No fim, imprime as anotações entre marcadores, para o teste conferir
# que nenhuma senha, nem a credencial do S3, nem a URL do heartbeat foram parar nos argumentos.
#   sh /espiao/espiar-argumentos.sh backup.sh
set -u

pasta=$(mktemp -d)
registro="$pasta/argumentos.log"
: > "$registro"
for programa in pg_dump pg_restore psql age rclone wget curl; do
  # A linha inteira (com a quebra) vai numa escrita só, em modo de acréscimo: num pipe (pg_dump | age | rclone) os
  # programas começam juntos, e duas escritas por linha (o texto e depois a quebra) deixavam as linhas se misturarem.
  cat > "$pasta/$programa" <<FIM
#!/bin/sh
linha=\$(printf '%s' "$programa \$*" | tr '\n' ' ')
printf '%s\n' "\$linha" >> "$registro"
PATH="\${PATH#$pasta:}" exec $programa "\$@"
FIM
  chmod +x "$pasta/$programa"
done

PATH="$pasta:$PATH" "$@"
codigo=$?

echo "=== argumentos ==="
cat "$registro"
echo "=== fim dos argumentos ==="
exit "$codigo"
