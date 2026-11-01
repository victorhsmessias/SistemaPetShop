import { ehDia, ehHora, type Dia, type Hora } from "@/modules/agenda/fuso";
import { ehUuid } from "@/modules/compartilhado/validacao";

// Atalho do agendamento: quando o pet ainda não existe, a dona cadastra tutor e pet e volta para o
// agendamento com ele escolhido. O parâmetro `agendar` leva só o dia e a hora (AAAA-MM-DDTHH:MM) e a URL
// de volta é montada aqui, a partir de valores conferidos: nunca um endereço vindo do navegador.

export type Retorno = { dia?: Dia; hora?: Hora };

/** Lê `agendar=2026-11-20T09:30` (ou só o dia). Inválido ou ausente: null, e o cadastro segue o fluxo normal. */
export function lerRetorno(valor: unknown): Retorno | null {
  if (typeof valor !== "string" || !valor) return null;
  const [dia, hora] = valor.split("T");
  if (!ehDia(dia)) return null;
  return ehHora(hora) ? { dia, hora } : { dia };
}

export function parametroDeRetorno(retorno: Retorno): string {
  return retorno.dia ? `${retorno.dia}${retorno.hora ? `T${retorno.hora}` : ""}` : "";
}

/** /agenda/novo com o dia, a hora e o pet já escolhidos. */
export function urlDoAgendamento(opcoes: Retorno & { petId?: string; busca?: string }): string {
  const busca = new URLSearchParams();
  if (ehDia(opcoes.dia)) busca.set("dia", opcoes.dia);
  if (ehHora(opcoes.hora)) busca.set("hora", opcoes.hora);
  if (ehUuid(opcoes.petId)) busca.set("pet", opcoes.petId);
  if (opcoes.busca) busca.set("busca", opcoes.busca);
  const texto = busca.toString();
  return texto ? `/agenda/novo?${texto}` : "/agenda/novo";
}

export function urlDoDia(dia: Dia): string {
  return `/agenda?dia=${dia}`;
}
