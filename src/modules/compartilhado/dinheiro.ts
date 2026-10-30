// Dinheiro sempre em centavos (integer) no banco e no código. Reais só na entrada e na exibição.
// Compartilhado: catálogo, agenda, pacotes e financeiro usam.

export type ResultadoValor = { ok: true; centavos: number } | { ok: false; erro: string };

/** Teto de segurança: R$ 1.000.000,00, bem abaixo do limite do integer do Postgres. */
const MAXIMO_CENTAVOS = 100_000_000;

const comMilhar = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/;
const semMilhar = /^\d+(,\d{1,2})?$/;

/**
 * Converte o valor digitado em reais, no formato brasileiro, para centavos.
 * Aceita "45", "45,5", "45,00", "1.234,56" e "R$ 45,00".
 */
export function reaisParaCentavos(entrada: string): ResultadoValor {
  const texto = entrada.replace(/R\$/i, "").replace(/[\s ]/g, "");
  if (!texto) return { ok: false, erro: "Informe o valor." };
  if (texto.startsWith("-")) return { ok: false, erro: "O valor não pode ser negativo." };
  if (!comMilhar.test(texto) && !semMilhar.test(texto)) {
    if (/^\d+\.\d{1,2}$/.test(texto)) return { ok: false, erro: "Use vírgula para os centavos, por exemplo 45,50." };
    return { ok: false, erro: "Valor inválido. Use o formato 45,00." };
  }

  const [inteiro = "0", decimal = ""] = texto.replaceAll(".", "").split(",");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos) || centavos > MAXIMO_CENTAVOS) {
    return { ok: false, erro: "Valor alto demais." };
  }
  return { ok: true, centavos };
}

/** Centavos para o campo de edição: 4500 → "45,00" (sem separador de milhar). */
export function centavosParaTexto(centavos: number): string {
  const inteiro = Math.trunc(centavos / 100);
  const resto = Math.abs(centavos % 100);
  return `${inteiro},${String(resto).padStart(2, "0")}`;
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos para exibição: 123456 → "R$ 1.234,56". */
export function formatarReais(centavos: number): string {
  return moeda.format(centavos / 100);
}
