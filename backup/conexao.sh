# shellcheck shell=sh
# Incluído (com ".") por backup.sh e restaurar.sh. Tira a senha da URL de conexão antes de chamar pg_dump, psql e
# pg_restore: os argumentos de um processo aparecem no ps da VPS para qualquer usuário, e o ambiente dele só para o
# mesmo usuário e o root. Os programas recebem a URL sem senha e a senha por PGPASSWORD (libpq).
#
#   separar_senha "$URL"   define URL_SEM_SENHA e exporta PGPASSWORD (já sem o %XX da URL)
#
# Se a URL não tem senha, URL_SEM_SENHA é a própria URL e PGPASSWORD não muda.

# Desfaz o %XX da URL (por exemplo %40 -> @). Barras invertidas ficam como estão.
decodificar_url() {
  printf '%b' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/%\([0-9A-Fa-f][0-9A-Fa-f]\)/\\x\1/g')"
}

# shellcheck disable=SC2034 # URL_SEM_SENHA é lida pelo script que inclui este arquivo
separar_senha() {
  _url=$1
  URL_SEM_SENHA=$_url
  case "$_url" in
    *://*) ;;
    *) return 0 ;;
  esac
  _esquema=${_url%%://*}
  _resto=${_url#*://}
  # Autoridade: usuario:senha@host:porta, até a primeira barra (o resto é o banco e os parâmetros).
  _autoridade=${_resto%%/*}
  _caminho=${_resto#"$_autoridade"}
  case "$_autoridade" in
    *@*) ;;
    *) return 0 ;;
  esac
  _credenciais=${_autoridade%@*}
  _servidor=${_autoridade##*@}
  case "$_credenciais" in
    *:*)
      PGPASSWORD=$(decodificar_url "${_credenciais#*:}")
      export PGPASSWORD
      URL_SEM_SENHA="$_esquema://${_credenciais%%:*}@$_servidor$_caminho"
      ;;
  esac
  unset _url _esquema _resto _autoridade _caminho _credenciais _servidor
}
