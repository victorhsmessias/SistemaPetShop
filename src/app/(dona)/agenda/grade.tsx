import Link from "next/link";

import { urlDoAgendamento, urlDoDia } from "@/app/(dona)/agenda/retorno";
import { SeloDeStatus } from "@/app/componentes/selo-status";
import type { AtendimentoDaAgenda } from "@/modules/agenda/atendimentos";
import { DURACAO_VISUAL_MINIMA_MIN, distribuirEmColunas, ocupaHorario } from "@/modules/agenda/calculos";
import { inicioDoDia, noFuso, rotuloCurtoDoDia, rotuloDoDia, somarDias, type Dia } from "@/modules/agenda/fuso";

// Grade da agenda (H6): cada atendimento ocupa um bloco do tamanho da sua duração, e os que se sobrepõem
// ficam lado a lado. Faixa padrão das 7h às 20h, crescendo quando há atendimento fora dela.

const PX_POR_MIN_DIA = 2;
const PX_POR_MIN_SEMANA = 1;
const FAIXA_PADRAO = { inicio: 7 * 60, fim: 20 * 60 };
const INTERVALO_DOS_HORARIOS_VAZIOS = 30;
const MINUTOS_NO_DIA = 24 * 60;

type NaGrade = { atendimento: AtendimentoDaAgenda; inicioMin: number; fimMin: number };

/** Posição do atendimento em minutos desde a meia-noite do dia, cortada nas bordas do dia. */
function posicionarNoDia(atendimentos: AtendimentoDaAgenda[], dia: Dia, fuso: string): NaGrade[] {
  const inicioDia = inicioDoDia(dia, fuso).getTime();
  const fimDia = inicioDoDia(somarDias(dia, 1), fuso).getTime();
  const emMinutos = (t: number) => Math.round((Math.min(Math.max(t, inicioDia), fimDia) - inicioDia) / 60_000);
  return atendimentos
    .filter((a) => a.inicio.getTime() < fimDia && a.fim.getTime() > inicioDia)
    .map((a) => ({ atendimento: a, inicioMin: emMinutos(a.inicio.getTime()), fimMin: emMinutos(a.fim.getTime()) }));
}

/** Faixa de horas exibida: 7h–20h, alargada em horas cheias para caber todos os blocos. */
function faixaDe(blocos: NaGrade[]): { inicio: number; fim: number } {
  let { inicio, fim } = FAIXA_PADRAO;
  for (const b of blocos) {
    inicio = Math.min(inicio, Math.floor(b.inicioMin / 60) * 60);
    fim = Math.max(fim, Math.ceil(Math.max(b.fimMin, b.inicioMin + DURACAO_VISUAL_MINIMA_MIN) / 60) * 60);
  }
  return { inicio, fim: Math.min(fim, MINUTOS_NO_DIA) };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const horaDoMinuto = (min: number) => `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;

function RotulosDasHoras({ faixa, pxPorMin }: { faixa: { inicio: number; fim: number }; pxPorMin: number }) {
  const horas: number[] = [];
  for (let m = faixa.inicio; m < faixa.fim; m += 60) horas.push(m);
  return (
    <div className="grade-horas" aria-hidden="true" style={{ height: (faixa.fim - faixa.inicio) * pxPorMin }}>
      {horas.map((m) => (
        <span key={m} style={{ top: (m - faixa.inicio) * pxPorMin }}>
          {horaDoMinuto(m)}
        </span>
      ))}
    </div>
  );
}

function estiloDoBloco(
  b: NaGrade,
  posicao: { coluna: number; colunas: number },
  faixaInicio: number,
  pxPorMin: number,
  alturaMinima: number,
) {
  return {
    top: (b.inicioMin - faixaInicio) * pxPorMin,
    height: Math.max((b.fimMin - b.inicioMin) * pxPorMin, alturaMinima),
    left: `calc(${(posicao.coluna / posicao.colunas) * 100}% + 2px)`,
    width: `calc(${100 / posicao.colunas}% - 4px)`,
  };
}

/** Agenda do dia: horários vazios tocáveis por baixo e os blocos dos atendimentos ativos por cima. */
export function GradeDoDia({ dia, fuso, atendimentos }: { dia: Dia; fuso: string; atendimentos: AtendimentoDaAgenda[] }) {
  const blocos = posicionarNoDia(
    atendimentos.filter((a) => ocupaHorario(a.status)),
    dia,
    fuso,
  );
  const faixa = faixaDe(blocos);
  const posicoes = new Map(distribuirEmColunas(blocos.map((b) => ({ id: b.atendimento.id, ...b }))).map((p) => [p.id, p]));
  const vazios: number[] = [];
  for (let m = faixa.inicio; m < faixa.fim; m += INTERVALO_DOS_HORARIOS_VAZIOS) vazios.push(m);
  const altura = (faixa.fim - faixa.inicio) * PX_POR_MIN_DIA;

  return (
    <div className="grade grade-dia">
      <RotulosDasHoras faixa={faixa} pxPorMin={PX_POR_MIN_DIA} />
      <div className="grade-corpo" style={{ height: altura }}>
        {vazios.map((m) => (
          <Link
            key={m}
            href={urlDoAgendamento({ dia, hora: horaDoMinuto(m) })}
            className={`horario-vazio${m % 60 === 0 ? " hora-cheia" : ""}`}
            style={{ top: (m - faixa.inicio) * PX_POR_MIN_DIA, height: INTERVALO_DOS_HORARIOS_VAZIOS * PX_POR_MIN_DIA }}
            aria-label={`Agendar às ${horaDoMinuto(m)}`}
          />
        ))}
        {blocos.map((b) => {
          const a = b.atendimento;
          const horario = `${noFuso(a.inicio, fuso).hora}–${noFuso(a.fim, fuso).hora}`;
          return (
            <Link
              key={a.id}
              href={`/agenda/${a.id}`}
              className={`bloco status-${a.status}`}
              style={estiloDoBloco(b, posicoes.get(a.id)!, faixa.inicio, PX_POR_MIN_DIA, 44)}
            >
              <span className="bloco-linha">
                <strong>{a.pet.nome}</strong> · {a.tutor.nome}
              </span>
              {/* Status antes do horário: em bloco estreito, o que se corta é o horário, não o status. */}
              <span className="bloco-linha">
                <SeloDeStatus status={a.status} mini /> · {horario}
              </span>
              {a.pet.observacoes && <span className="bloco-linha bloco-cuidado">⚠ {a.pet.observacoes}</span>}
              <span className="bloco-linha">{a.itens.map((i) => i.descricao).join(", ")}</span>
              {a.observacoes && <span className="bloco-linha suave">{a.observacoes}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Semana de segunda a domingo: blocos compactos mostram a ocupação. O toque é por dia: qualquer ponto de um
 * dia abre a agenda daquele dia (dois blocos lado a lado teriam uns 24 px). Cancelados e faltas não aparecem.
 */
export function GradeDaSemana({
  dias,
  hoje,
  fuso,
  atendimentos,
}: {
  dias: Dia[];
  hoje: Dia;
  fuso: string;
  atendimentos: AtendimentoDaAgenda[];
}) {
  const ativos = atendimentos.filter((a) => ocupaHorario(a.status));
  const porDia = dias.map((dia) => ({ dia, blocos: posicionarNoDia(ativos, dia, fuso) }));
  const faixa = faixaDe(porDia.flatMap((d) => d.blocos));
  const altura = (faixa.fim - faixa.inicio) * PX_POR_MIN_SEMANA;

  return (
    <div className="grade grade-semana">
      <div className="grade-semana-horas">
        <div className="grade-semana-cabecalho" aria-hidden="true" />
        <RotulosDasHoras faixa={faixa} pxPorMin={PX_POR_MIN_SEMANA} />
      </div>
      {porDia.map(({ dia, blocos }) => {
        const posicoes = new Map(distribuirEmColunas(blocos.map((b) => ({ id: b.atendimento.id, ...b }))).map((p) => [p.id, p]));
        const quantos = blocos.length;
        return (
          <Link
            key={dia}
            href={urlDoDia(dia)}
            className={`grade-semana-dia${dia === hoje ? " hoje" : ""}`}
            aria-label={`${rotuloDoDia(dia)}: ${quantos === 0 ? "nenhum atendimento" : quantos === 1 ? "1 atendimento" : `${quantos} atendimentos`}`}
          >
            <span className="grade-semana-cabecalho">{rotuloCurtoDoDia(dia).replace(".", "")}</span>
            <span className="grade-corpo" style={{ height: altura }}>
              {blocos.map((b) => {
                const a = b.atendimento;
                return (
                  <span
                    key={a.id}
                    className={`bloco bloco-compacto status-${a.status}`}
                    style={estiloDoBloco(b, posicoes.get(a.id)!, faixa.inicio, PX_POR_MIN_SEMANA, DURACAO_VISUAL_MINIMA_MIN)}
                  >
                    {a.status === "concluido" ? "✓ " : ""}
                    {noFuso(a.inicio, fuso).hora} {a.pet.observacoes ? "⚠ " : ""}
                    {a.pet.nome}
                  </span>
                );
              })}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
