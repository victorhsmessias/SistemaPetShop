import { describe, expect, it } from "vitest";

import { formatarTelefone, normalizarTelefone } from "@/modules/cadastros/telefone";

describe("normalizarTelefone", () => {
  it.each([
    ["(11) 98765-4321", "+5511987654321"],
    ["11987654321", "+5511987654321"],
    ["11 9 8765 4321", "+5511987654321"],
    ["+55 (11) 98765-4321", "+5511987654321"],
    ["55 11 98765-4321", "+5511987654321"],
    ["5511987654321", "+5511987654321"],
    ["(11) 3456-7890", "+551134567890"],
    ["551134567890", "+551134567890"],
    // DDD 55 (Santa Maria, RS): com 10 ou 11 dígitos, o 55 é DDD, não o país.
    ["(55) 3222-1234", "+555532221234"],
    ["55 99876-5432", "+5555998765432"],
    ["+55 55 99876-5432", "+5555998765432"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toEqual({ ok: true, telefone: esperado });
  });

  it.each([
    ["", "Informe o telefone"],
    ["   ", "Informe o telefone"],
    ["98765-4321", "DDD e número"],
    ["1234", "DDD e número"],
    ["(11) 98765-43210", "DDD e número"],
    ["+55 11 98765-43210", "DDD e número"],
    ["(01) 98765-4321", "DDD inválido"],
    ["011 98765-4321", "DDD e número"], // prefixo de operadora não é aceito: confunde o DDD
    ["(10) 98765-4321", "DDD inválido"],
    ["(11) 88765-4321", "começa com 9"],
    ["+1 415 555 2671", "Brasil"],
    ["11 9876a-4321", "só pode ter números"],
  ])("%j é recusado (%s)", (entrada, trecho) => {
    const resultado = normalizarTelefone(entrada);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toContain(trecho);
  });
});

describe("formatarTelefone", () => {
  it("formata celular, fixo e vazio", () => {
    expect(formatarTelefone("+5511987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("+551134567890")).toBe("(11) 3456-7890");
    expect(formatarTelefone(null)).toBe("");
  });
});
