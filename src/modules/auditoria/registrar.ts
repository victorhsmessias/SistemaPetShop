import type { Transacao } from "@/db/clientes";
import { auditoria } from "@/modules/auditoria/schema";

/** Nenhum dado de senha vai para a auditoria (ADR 0011). */
const CAMPO_PROIBIDO = /senha|password|hash|token|secret/i;

export type Evento = {
  /** Empresa afetada; null só em eventos da plataforma. Omitido: a empresa da transação. */
  empresaId?: string | null;
  tabela: string;
  registroId: string;
  acao: "criou" | "alterou";
  antes?: Record<string, unknown> | null;
  depois: Record<string, unknown>;
};

function semSenha(dados: Record<string, unknown> | null | undefined, onde: string) {
  if (!dados) return;
  for (const chave of Object.keys(dados)) {
    if (CAMPO_PROIBIDO.test(chave)) throw new Error(`Auditoria recusou o campo "${chave}" em ${onde}.`);
  }
}

/**
 * Evento explícito, para ações que não passam pela trigger auditar() (ex.: as do Better Auth).
 * O autor vem de app.usuario_id da transação (comEmpresa ou comPlataforma).
 */
export async function registrarEvento(tx: Transacao, evento: Evento): Promise<void> {
  semSenha(evento.antes, "antes");
  semSenha(evento.depois, "depois");
  await tx.insert(auditoria).values({
    ...(evento.empresaId !== undefined ? { empresaId: evento.empresaId } : {}),
    tabela: evento.tabela,
    registroId: evento.registroId,
    acao: evento.acao,
    antes: evento.antes ?? null,
    depois: evento.depois,
  });
}
