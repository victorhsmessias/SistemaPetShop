/** Código SQLSTATE do erro do Postgres, mesmo quando o Drizzle o embrulha em outro erro. */
export function codigoPgDe(erro: unknown): string | undefined {
  let atual: unknown = erro;
  while (atual instanceof Error) {
    if ("code" in atual && typeof atual.code === "string") return atual.code;
    atual = atual.cause;
  }
  return undefined;
}
