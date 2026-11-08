// Datas e horas no fuso da empresa (empresa.fuso_horario), nunca no fuso do servidor.
// Só com Intl, sem biblioteca: o Temporal ainda não está no Node 22 do CI.
//
// Um "dia" é um texto AAAA-MM-DD e uma "hora" é HH:MM, como chegam dos campos date e time.
// A conta com dias é feita em UTC puro (sem fuso), e só a conversão para instante usa o fuso.

export type Dia = string;
export type Hora = string;
/** AAAA-MM, como no campo month e no ?mes= do Financeiro. */
export type Mes = string;

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatadores.set(fuso, f);
  }
  return f;
}

type Partes = { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number };

function partesNoFuso(instante: Date, fuso: string): Partes {
  const valores: Record<string, number> = {};
  for (const parte of formatador(fuso).formatToParts(instante)) {
    if (parte.type !== "literal") valores[parte.type] = Number(parte.value);
  }
  return {
    ano: valores.year!,
    mes: valores.month!,
    dia: valores.day!,
    hora: valores.hour!,
    minuto: valores.minute!,
    segundo: valores.second!,
  };
}

/** Diferença entre o relógio do fuso e o UTC naquele instante, em minutos (São Paulo: -180). */
function deslocamentoMin(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  const comoSeFosseUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return Math.round((comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000) / MINUTO);
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function lerDia(dia: Dia): { ano: number; mes: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return null;
  const [ano, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(ano, mes - 1, d));
  // Recusa 2026-02-30 e afins, que o Date.UTC rolaria para o mês seguinte.
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d) return null;
  return { ano, mes, d };
}

export function ehDia(valor: unknown): valor is Dia {
  return typeof valor === "string" && lerDia(valor) !== null;
}

export function ehHora(valor: unknown): valor is Hora {
  return typeof valor === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

/** Minutos desde a meia-noite: "09:30" → 570. */
export function minutosDaHora(hora: Hora): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

/**
 * Dia e hora digitados no fuso da empresa → instante (UTC). Num fuso com horário de verão, uma hora que
 * não existe (o relógio pula) vai para depois do pulo, e uma hora repetida fica com a primeira ocorrência.
 */
export function instanteNoFuso(dia: Dia, hora: Hora, fuso: string): Date {
  const d = lerDia(dia);
  if (!d || !ehHora(hora)) throw new Error(`Dia ou hora inválidos: ${dia} ${hora}`);
  const relogio = Date.UTC(d.ano, d.mes - 1, d.d, Number(hora.slice(0, 2)), Number(hora.slice(3, 5)));
  // Candidatos: o relógio menos o deslocamento da véspera e o do dia seguinte (iguais, fora das trocas).
  const candidatos = [...new Set([relogio - DIA, relogio + DIA].map((t) => deslocamentoMin(new Date(t), fuso)))].map(
    (deslocamento) => relogio - deslocamento * MINUTO,
  );
  const validos = candidatos.filter((c) => deslocamentoMin(new Date(c), fuso) === (relogio - c) / MINUTO);
  // Hora repetida: a primeira ocorrência. Hora que não existe: depois do pulo.
  return new Date(validos.length > 0 ? Math.min(...validos) : Math.max(...candidatos));
}

/** Instante → dia e hora no fuso da empresa. */
export function noFuso(instante: Date, fuso: string): { dia: Dia; hora: Hora; minutos: number } {
  const p = partesNoFuso(instante, fuso);
  return {
    dia: `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`,
    hora: `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`,
    minutos: p.hora * 60 + p.minuto,
  };
}

export function hojeNoFuso(fuso: string, agora: Date = new Date()): Dia {
  return noFuso(agora, fuso).dia;
}

/** Primeiro instante do dia no fuso da empresa. O dia vai de inicioDoDia(dia) até inicioDoDia(dia + 1). */
export function inicioDoDia(dia: Dia, fuso: string): Date {
  return instanteNoFuso(dia, "00:00", fuso);
}

export function somarDias(dia: Dia, dias: number): Dia {
  const d = lerDia(dia);
  if (!d) throw new Error(`Dia inválido: ${dia}`);
  return new Date(Date.UTC(d.ano, d.mes - 1, d.d + dias)).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
function diaDaSemana(dia: Dia): number {
  const d = lerDia(dia)!;
  return new Date(Date.UTC(d.ano, d.mes - 1, d.d)).getUTCDay();
}

/** A semana vai de segunda a domingo: devolve a segunda-feira da semana do dia. */
export function segundaDaSemana(dia: Dia): Dia {
  return somarDias(dia, -((diaDaSemana(dia) + 6) % 7));
}

export function diasDaSemana(dia: Dia): Dia[] {
  const segunda = segundaDaSemana(dia);
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

function dataDoDia(dia: Dia): Date {
  const d = lerDia(dia)!;
  return new Date(Date.UTC(d.ano, d.mes - 1, d.d, 12));
}

const formatoDoDia = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const formatoCurto = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "numeric" });
const formatoDiaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "short" });

/** "segunda-feira, 2 de novembro". */
export function rotuloDoDia(dia: Dia): string {
  return formatoDoDia.format(dataDoDia(dia));
}

/** "seg., 2", para o cabeçalho da semana. */
export function rotuloCurtoDoDia(dia: Dia): string {
  return formatoCurto.format(dataDoDia(dia));
}

/** "2 de nov.". */
export function rotuloDiaMes(dia: Dia): string {
  return formatoDiaMes.format(dataDoDia(dia));
}

// ---------------------------------------------------------------------------------------------------------
// Meses (Financeiro). Conta em texto, sem fuso: o mês de um instante vem de noFuso(...).dia.

export function ehMes(valor: unknown): valor is Mes {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
}

export function mesDoDia(dia: Dia): Mes {
  return dia.slice(0, 7);
}

export function primeiroDiaDoMes(mes: Mes): Dia {
  return `${mes}-01`;
}

export function somarMeses(mes: Mes, meses: number): Mes {
  const [ano, m] = [Number(mes.slice(0, 4)), Number(mes.slice(5, 7))];
  return new Date(Date.UTC(ano, m - 1 + meses, 1)).toISOString().slice(0, 7);
}

const formatoDoMes = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });

/** "novembro de 2026". */
export function rotuloDoMes(mes: Mes): string {
  return formatoDoMes.format(dataDoDia(primeiroDiaDoMes(mes)));
}
