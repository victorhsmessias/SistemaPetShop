import { describe, expect, it } from "vitest";

import {
  diasDaSemana,
  ehDia,
  ehHora,
  ehMes,
  hojeNoFuso,
  inicioDoDia,
  instanteNoFuso,
  mesDoDia,
  noFuso,
  primeiroDiaDoMes,
  rotuloCurtoDoDia,
  rotuloDoDia,
  rotuloDoMes,
  segundaDaSemana,
  somarDias,
  somarMeses,
} from "@/modules/agenda/fuso";

describe("dia e hora digitados → instante", () => {
  it("São Paulo é UTC-3", () => {
    expect(instanteNoFuso("2026-11-10", "09:00", "America/Sao_Paulo").toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("Manaus é UTC-4: a mesma hora digitada é outro instante", () => {
    expect(instanteNoFuso("2026-11-10", "09:00", "America/Manaus").toISOString()).toBe("2026-11-10T13:00:00.000Z");
  });

  it("perto da meia-noite, o instante cai no dia seguinte em UTC", () => {
    expect(instanteNoFuso("2026-11-10", "23:30", "America/Sao_Paulo").toISOString()).toBe("2026-11-11T02:30:00.000Z");
    expect(instanteNoFuso("2026-11-10", "23:59", "America/Manaus").toISOString()).toBe("2026-11-11T03:59:00.000Z");
    expect(instanteNoFuso("2026-11-11", "00:00", "America/Manaus").toISOString()).toBe("2026-11-11T04:00:00.000Z");
  });

  it("virada de ano", () => {
    expect(instanteNoFuso("2026-12-31", "22:00", "America/Manaus").toISOString()).toBe("2027-01-01T02:00:00.000Z");
  });

  it("fuso com horário de verão: hora que não existe vai para depois do pulo; repetida fica com a primeira", () => {
    // Nova York, 08/03/2026: o relógio pula de 02:00 para 03:00.
    expect(instanteNoFuso("2026-03-08", "02:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
    // Nova York, 01/11/2026: 01:30 acontece duas vezes; a primeira ainda é no horário de verão (UTC-4).
    expect(instanteNoFuso("2026-11-01", "01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("ida e volta dá o mesmo dia e hora", () => {
    for (const fuso of ["America/Sao_Paulo", "America/Manaus", "America/Noronha", "America/Rio_Branco"]) {
      for (const hora of ["00:00", "00:15", "12:00", "23:45"]) {
        expect(noFuso(instanteNoFuso("2026-11-10", hora, fuso), fuso)).toMatchObject({ dia: "2026-11-10", hora });
      }
    }
  });
});

describe("instante → dia e hora no fuso da empresa", () => {
  const instante = new Date("2026-11-11T02:30:00Z");

  it("o mesmo instante é outro dia em São Paulo e em UTC", () => {
    expect(noFuso(instante, "America/Sao_Paulo")).toEqual({ dia: "2026-11-10", hora: "23:30", minutos: 23 * 60 + 30 });
    expect(noFuso(instante, "America/Manaus")).toMatchObject({ dia: "2026-11-10", hora: "22:30" });
    expect(noFuso(instante, "UTC")).toMatchObject({ dia: "2026-11-11", hora: "02:30" });
  });

  it("meia-noite aparece como 00:00, não 24:00", () => {
    expect(noFuso(new Date("2026-11-11T03:00:00Z"), "America/Sao_Paulo")).toMatchObject({
      dia: "2026-11-11",
      hora: "00:00",
      minutos: 0,
    });
  });

  it("hoje é o dia no fuso da empresa, não no do servidor", () => {
    const agora = new Date("2026-11-11T03:30:00Z");
    expect(hojeNoFuso("America/Sao_Paulo", agora)).toBe("2026-11-11");
    expect(hojeNoFuso("America/Manaus", agora)).toBe("2026-11-10");
  });

  it("o dia começa à meia-noite do fuso", () => {
    expect(inicioDoDia("2026-11-10", "America/Manaus").toISOString()).toBe("2026-11-10T04:00:00.000Z");
    expect(inicioDoDia("2026-11-10", "America/Sao_Paulo").toISOString()).toBe("2026-11-10T03:00:00.000Z");
  });
});

describe("dias e semanas", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("a semana vai de segunda a domingo", () => {
    // 01/11/2026 é domingo: a semana dele começa na segunda, 26/10.
    expect(segundaDaSemana("2026-11-01")).toBe("2026-10-26");
    expect(segundaDaSemana("2026-11-02")).toBe("2026-11-02");
    expect(segundaDaSemana("2026-11-04")).toBe("2026-11-02");
    expect(diasDaSemana("2026-11-04")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("rótulo em português", () => {
    expect(rotuloDoDia("2026-11-02")).toBe("segunda-feira, 2 de novembro");
  });

  it("confere o formato do dia e da hora", () => {
    expect(ehDia("2026-11-10")).toBe(true);
    expect(ehDia("2026-02-30")).toBe(false);
    expect(ehDia("10/11/2026")).toBe(false);
    expect(ehHora("09:05")).toBe(true);
    expect(ehHora("24:00")).toBe(false);
    expect(ehHora("9:05")).toBe(false);
  });

  it("recusa dias com ano fora de 2000 a 2100, mas os vizinhos dos extremos continuam calculados", () => {
    expect(ehDia("2000-01-01")).toBe(true);
    expect(ehDia("2100-12-31")).toBe(true);
    expect(ehDia("1999-12-31")).toBe(false);
    expect(ehDia("2101-01-01")).toBe(false);
    expect(ehDia("9999-12-31")).toBe(false);
    expect(ehDia("0000-01-01")).toBe(false);
    expect(ehDia("0050-05-05")).toBe(false);
    expect(somarDias("2100-12-31", 1)).toBe("2101-01-01");
    expect(somarDias("2000-01-01", -1)).toBe("1999-12-31");
    expect(diasDaSemana("2100-12-31").map(rotuloCurtoDoDia)).toHaveLength(7);
  });
});

describe("dia do lançamento", () => {
  it("concluir às 23h30 em Manaus lança no dia local, não no dia seguinte do UTC", () => {
    const concluidoEm = instanteNoFuso("2026-11-10", "23:30", "America/Manaus");
    expect(concluidoEm.toISOString()).toBe("2026-11-11T03:30:00.000Z");
    expect(hojeNoFuso("America/Manaus", concluidoEm)).toBe("2026-11-10");
  });
});

describe("meses", () => {
  it("reconhece AAAA-MM", () => {
    expect(ehMes("2026-11")).toBe(true);
    expect(ehMes("2026-13")).toBe(false);
    expect(ehMes("2026-1")).toBe(false);
    expect(ehMes(undefined)).toBe(false);
  });

  it("recusa anos fora de 2000 a 2100, que quebrariam a conta e a consulta", () => {
    expect(ehMes("2000-01")).toBe(true);
    expect(ehMes("2100-12")).toBe(true);
    expect(ehMes("1999-12")).toBe(false);
    expect(ehMes("2101-01")).toBe(false);
    expect(ehMes("9999-12")).toBe(false);
    expect(ehMes("0000-01")).toBe(false);
    expect(ehMes("0050-05")).toBe(false);
    expect(somarMeses("2100-12", 1)).toBe("2101-01");
    expect(somarMeses("2000-01", -1)).toBe("1999-12");
  });

  it("mês do dia, primeiro dia e navegação atravessando o ano", () => {
    expect(mesDoDia("2026-11-30")).toBe("2026-11");
    expect(primeiroDiaDoMes("2026-11")).toBe("2026-11-01");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
  });

  it("rótulo em português", () => {
    expect(rotuloDoMes("2026-11")).toBe("novembro de 2026");
  });
});
