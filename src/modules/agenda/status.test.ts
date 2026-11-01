import { describe, expect, it } from "vitest";

import { avaliarMudanca, proximosStatus, statusAnterior, STATUS, type StatusAtendimento } from "@/modules/agenda/status";

const AGORA = new Date("2026-11-10T12:00:00Z");
const ANTES = new Date("2026-11-09T18:00:00Z");

describe("transições", () => {
  it("seguem o diagrama de estados, sem concluir nesta sessão", () => {
    expect(proximosStatus("agendado")).toEqual(["confirmado", "em_atendimento", "cancelado", "faltou"]);
    expect(proximosStatus("confirmado")).toEqual(["em_atendimento", "cancelado", "faltou"]);
    expect(proximosStatus("em_atendimento")).toEqual(["pronto"]);
    for (const fim of ["pronto", "concluido", "cancelado", "faltou"] as const) expect(proximosStatus(fim)).toEqual([]);
  });

  it("confirmar grava confirmado_em; começar direto do agendado não", () => {
    expect(avaliarMudanca({ status: "agendado", confirmadoEm: null }, "confirmado", AGORA)).toEqual({
      ok: true,
      desfazendo: false,
      mudanca: { status: "confirmado", confirmadoEm: AGORA },
    });
    expect(avaliarMudanca({ status: "agendado", confirmadoEm: null }, "em_atendimento", AGORA)).toMatchObject({
      mudanca: { status: "em_atendimento", confirmadoEm: null },
    });
  });

  it("recusa pular etapas ou voltar sem ser desfazer", () => {
    const recusadas: [StatusAtendimento, StatusAtendimento][] = [
      ["agendado", "pronto"],
      ["agendado", "concluido"],
      ["confirmado", "pronto"],
      ["em_atendimento", "cancelado"],
      ["em_atendimento", "faltou"],
      ["pronto", "cancelado"],
      ["pronto", "confirmado"],
      ["cancelado", "faltou"],
      ["agendado", "agendado"],
    ];
    for (const [de, para] of recusadas) {
      expect(avaliarMudanca({ status: de, confirmadoEm: ANTES }, para).ok, `${de} → ${para}`).toBe(false);
    }
  });
});

describe("desfazer um toque errado", () => {
  it("confirmado volta para agendado e limpa confirmado_em", () => {
    expect(avaliarMudanca({ status: "confirmado", confirmadoEm: ANTES }, "agendado")).toEqual({
      ok: true,
      desfazendo: true,
      mudanca: { status: "agendado", confirmadoEm: null },
    });
  });

  it("em atendimento, cancelado e faltou voltam para confirmado se já tinha confirmado, senão para agendado", () => {
    for (const status of ["em_atendimento", "cancelado", "faltou"] as const) {
      expect(statusAnterior(status, ANTES)).toBe("confirmado");
      expect(statusAnterior(status, null)).toBe("agendado");
    }
    expect(avaliarMudanca({ status: "cancelado", confirmadoEm: ANTES }, "confirmado")).toMatchObject({
      ok: true,
      desfazendo: true,
      mudanca: { status: "confirmado", confirmadoEm: ANTES },
    });
    // Reabrir para o status errado é recusado.
    expect(avaliarMudanca({ status: "cancelado", confirmadoEm: ANTES }, "agendado").ok).toBe(false);
    expect(avaliarMudanca({ status: "faltou", confirmadoEm: null }, "confirmado").ok).toBe(false);
  });

  it("pronto volta para em atendimento; agendado e concluído não têm anterior", () => {
    expect(statusAnterior("pronto", null)).toBe("em_atendimento");
    expect(statusAnterior("agendado", null)).toBeNull();
    expect(statusAnterior("concluido", ANTES)).toBeNull();
  });

  it("o resultado de toda mudança respeita os checks de confirmado_em do banco", () => {
    for (const status of STATUS) {
      for (const confirmadoEm of [null, ANTES]) {
        if (status === "confirmado" && !confirmadoEm) continue;
        if (status === "agendado" && confirmadoEm) continue;
        for (const para of STATUS) {
          const r = avaliarMudanca({ status, confirmadoEm }, para, AGORA);
          if (!r.ok) continue;
          if (r.mudanca.status === "confirmado") expect(r.mudanca.confirmadoEm).not.toBeNull();
          if (r.mudanca.status === "agendado") expect(r.mudanca.confirmadoEm).toBeNull();
        }
      }
    }
  });
});
