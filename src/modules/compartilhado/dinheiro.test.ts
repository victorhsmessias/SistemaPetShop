import { describe, expect, it } from "vitest";

import { centavosParaTexto, formatarReais, reaisParaCentavos } from "@/modules/compartilhado/dinheiro";

describe("reaisParaCentavos", () => {
  it.each([
    ["45", 4500],
    ["45,00", 4500],
    ["45,5", 4550],
    ["45,05", 4505],
    ["0,99", 99],
    ["0", 0],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["R$ 45,00", 4500],
    ["R$ 1.000,00", 100000],
    [" 70 ", 7000],
    ["1.000.000,00", 100000000],
  ])("%j → %i centavos", (entrada, centavos) => {
    expect(reaisParaCentavos(entrada)).toEqual({ ok: true, centavos });
  });

  it.each([
    ["", "Informe o valor"],
    ["-10", "negativo"],
    ["45.50", "Use vírgula"],
    ["45,505", "inválido"],
    ["abc", "inválido"],
    ["12,3,4", "inválido"],
    ["1.23,00", "inválido"],
    ["1.000.000,01", "alto demais"],
  ])("%j é recusado (%s)", (entrada, trecho) => {
    const resultado = reaisParaCentavos(entrada);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toContain(trecho);
  });
});

describe("centavos para texto", () => {
  it("campo de edição, sem milhar", () => {
    expect(centavosParaTexto(4500)).toBe("45,00");
    expect(centavosParaTexto(5)).toBe("0,05");
    expect(centavosParaTexto(123456)).toBe("1234,56");
  });

  it("ida e volta não perde centavos", () => {
    for (const centavos of [0, 1, 99, 100, 4550, 123456, 99_999_999]) {
      expect(reaisParaCentavos(centavosParaTexto(centavos))).toEqual({ ok: true, centavos });
    }
  });

  it("exibição em reais", () => {
    expect(formatarReais(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatarReais(0).replace(/\s/g, " ")).toBe("R$ 0,00");
    expect(formatarReais(8200).replace(/\s/g, " ")).toBe("R$ 82,00");
    expect(formatarReais(5).replace(/\s/g, " ")).toBe("R$ 0,05");
  });
});
