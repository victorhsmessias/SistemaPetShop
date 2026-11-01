// Status do atendimento (H7 e planejamento, "Estados"). O app garante as transições; o banco garante
// que confirmado_em é coerente com o status. "concluido" entra com o pagamento, na próxima sessão.

export const STATUS = [
  "agendado",
  "confirmado",
  "em_atendimento",
  "pronto",
  "concluido",
  "cancelado",
  "faltou",
] as const;

export type StatusAtendimento = (typeof STATUS)[number];

export const NOMES_DOS_STATUS: Record<StatusAtendimento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  pronto: "Pronto",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

/** Texto do botão que leva a cada status. */
export const ACOES_DOS_STATUS: Partial<Record<StatusAtendimento, string>> = {
  confirmado: "Confirmar",
  em_atendimento: "Começar o atendimento",
  pronto: "Marcar como pronto",
  cancelado: "Cancelar",
  faltou: "Marcar falta",
};

const PROXIMOS: Record<StatusAtendimento, readonly StatusAtendimento[]> = {
  agendado: ["confirmado", "em_atendimento", "cancelado", "faltou"],
  confirmado: ["em_atendimento", "cancelado", "faltou"],
  em_atendimento: ["pronto"],
  pronto: [],
  concluido: [],
  cancelado: [],
  faltou: [],
};

export function ehStatus(valor: unknown): valor is StatusAtendimento {
  return STATUS.includes(valor as StatusAtendimento);
}

export function proximosStatus(status: StatusAtendimento): readonly StatusAtendimento[] {
  return PROXIMOS[status];
}

/**
 * Status anterior, deduzido sem coluna nova (modelo de dados, "Desfazer um toque errado"). Reabrir um
 * cancelado ou uma falta é o mesmo que desfazer. Desfazer "concluido" fica para quando o pagamento entrar.
 */
export function statusAnterior(status: StatusAtendimento, confirmadoEm: Date | null): StatusAtendimento | null {
  switch (status) {
    case "confirmado":
      return "agendado";
    case "em_atendimento":
    case "cancelado":
    case "faltou":
      return confirmadoEm ? "confirmado" : "agendado";
    case "pronto":
      return "em_atendimento";
    default:
      return null;
  }
}

/** Itens, horário e serviços só mudam enquanto o atendimento está ativo. */
export function atendimentoAtivo(status: StatusAtendimento): boolean {
  return status === "agendado" || status === "confirmado" || status === "em_atendimento" || status === "pronto";
}

export type Mudanca = { status: StatusAtendimento; confirmadoEm: Date | null };

/**
 * Confere se o atendimento pode ir de `atual` para `para`, avançando ou desfazendo, e devolve o que gravar.
 * Confirmar grava confirmado_em; desfazer a confirmação limpa. Os outros mantêm o valor.
 */
export function avaliarMudanca(
  atual: { status: StatusAtendimento; confirmadoEm: Date | null },
  para: StatusAtendimento,
  agora: Date = new Date(),
): { ok: true; mudanca: Mudanca; desfazendo: boolean } | { ok: false; erro: string } {
  if (PROXIMOS[atual.status].includes(para)) {
    return {
      ok: true,
      desfazendo: false,
      mudanca: { status: para, confirmadoEm: para === "confirmado" ? agora : atual.confirmadoEm },
    };
  }
  if (statusAnterior(atual.status, atual.confirmadoEm) === para) {
    return {
      ok: true,
      desfazendo: true,
      mudanca: { status: para, confirmadoEm: para === "agendado" ? null : atual.confirmadoEm },
    };
  }
  return {
    ok: false,
    erro: `Não dá para passar de "${NOMES_DOS_STATUS[atual.status]}" para "${NOMES_DOS_STATUS[para]}".`,
  };
}
