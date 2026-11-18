import { describe, expect, it } from "vitest";

import { calcularFim, conflitos, distribuirEmColunas, seSobrepoem, somarItens } from "@/modules/agenda/calculos";
import type { StatusAtendimento } from "@/modules/agenda/status";

const as = (hora: string) => new Date(`2026-11-10T${hora}:00Z`);

describe("fim do atendimento", () => {
  it("é o início mais a soma das durações", () => {
    expect(calcularFim(as("12:00"), [60, 30]).toISOString()).toBe("2026-11-10T13:30:00.000Z");
  });

  it("atravessa a meia-noite sem problema", () => {
    expect(calcularFim(as("23:30"), [45]).toISOString()).toBe("2026-11-11T00:15:00.000Z");
  });
});

describe("sobreposição", () => {
  it("encostar não é sobrepor", () => {
    expect(seSobrepoem({ inicio: as("09:00"), fim: as("10:00") }, { inicio: as("10:00"), fim: as("11:00") })).toBe(false);
  });

  it("um minuto em comum já sobrepõe; dentro e por fora também", () => {
    expect(seSobrepoem({ inicio: as("09:00"), fim: as("10:01") }, { inicio: as("10:00"), fim: as("11:00") })).toBe(true);
    expect(seSobrepoem({ inicio: as("09:00"), fim: as("12:00") }, { inicio: as("10:00"), fim: as("11:00") })).toBe(true);
    expect(seSobrepoem({ inicio: as("10:15"), fim: as("10:30") }, { inicio: as("10:00"), fim: as("11:00") })).toBe(true);
  });

  it("cancelados e faltas não ocupam; o próprio atendimento não conta na edição", () => {
    const existente = (id: string, status: StatusAtendimento) => ({ id, status, inicio: as("09:00"), fim: as("10:00") });
    const existentes = [
      existente("a", "agendado"),
      existente("b", "cancelado"),
      existente("c", "faltou"),
      existente("d", "pronto"),
    ];
    const novo = { inicio: as("09:30"), fim: as("10:30") };
    expect(conflitos(novo, existentes).map((c) => c.id)).toEqual(["a", "d"]);
    expect(conflitos(novo, existentes, "a").map((c) => c.id)).toEqual(["d"]);
  });
});

describe("blocos lado a lado", () => {
  it("sem sobreposição, cada bloco ocupa a largura toda", () => {
    expect(
      distribuirEmColunas([
        { id: "a", inicioMin: 0, fimMin: 60 },
        { id: "b", inicioMin: 60, fimMin: 120 },
      ]),
    ).toEqual([
      { id: "a", coluna: 0, colunas: 1, grupo: 0 },
      { id: "b", coluna: 0, colunas: 1, grupo: 1 },
    ]);
  });

  it("dois sobrepostos ficam em duas colunas; o terceiro reaproveita a coluna livre", () => {
    const resultado = distribuirEmColunas([
      { id: "a", inicioMin: 0, fimMin: 60 },
      { id: "b", inicioMin: 30, fimMin: 90 },
      { id: "c", inicioMin: 60, fimMin: 120 },
    ]);
    expect(resultado).toEqual([
      { id: "a", coluna: 0, colunas: 2, grupo: 0 },
      { id: "b", coluna: 1, colunas: 2, grupo: 0 },
      { id: "c", coluna: 0, colunas: 2, grupo: 0 },
    ]);
  });

  it("três no mesmo horário ficam em três colunas, e o grupo seguinte volta a uma", () => {
    const resultado = distribuirEmColunas([
      { id: "a", inicioMin: 0, fimMin: 60 },
      { id: "b", inicioMin: 0, fimMin: 60 },
      { id: "c", inicioMin: 10, fimMin: 40 },
      { id: "d", inicioMin: 120, fimMin: 150 },
    ]);
    expect(resultado.map((r) => [r.id, r.coluna, r.colunas, r.grupo])).toEqual([
      ["a", 0, 3, 0],
      ["b", 1, 3, 0],
      ["c", 2, 3, 0],
      ["d", 0, 1, 1],
    ]);
  });

  it("bloco curto usa o fim visual de 22 min: não fica por baixo do seguinte", () => {
    // 10 min de serviço, desenhado com 44 px (22 min); o próximo começa 15 min depois.
    const resultado = distribuirEmColunas([
      { id: "curto", inicioMin: 0, fimMin: 10 },
      { id: "seguinte", inicioMin: 15, fimMin: 75 },
    ]);
    expect(resultado).toEqual([
      { id: "curto", coluna: 0, colunas: 2, grupo: 0 },
      { id: "seguinte", coluna: 1, colunas: 2, grupo: 0 },
    ]);
  });
});

describe("total do atendimento", () => {
  it("é a soma dos preços dos itens, em centavos", () => {
    expect(somarItens([{ precoCentavos: 5000 }, { precoCentavos: 3200 }, { precoCentavos: 1 }])).toBe(8201);
  });

  it("sem itens, ou só com itens de cortesia, é zero", () => {
    expect(somarItens([])).toBe(0);
    expect(somarItens([{ precoCentavos: 0 }])).toBe(0);
  });
});
