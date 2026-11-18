import Link from "next/link";
import type { CSSProperties } from "react";

import { urlDoAgendamento, urlDoDia } from "@/app/(dona)/agenda/retorno";
import { Icone } from "@/app/componentes/icone";
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

/** Até 2 colunas abaixo de 1024 px (ADR 0016): num grupo com mais, o resto vai para o "+N". */
const COLUNAS_NA_TELA_ESTREITA = 2;

type Posicao = { coluna: number; colunas: number; grupo: number };

/** Topo e altura do bloco, e a coluna na tela larga (--col/--cols) e na estreita (--col-e/--cols-e), pelo CSS. */
function estiloDoBloco(
  b: NaGrade,
  posicao: { coluna: number; colunas: number },
  estreita: { coluna: number; colunas: number },
  faixaInicio: number,
  pxPorMin: number,
  alturaMinima: number,
) {
  return {
    top: (b.inicioMin - faixaInicio) * pxPorMin,
    height: Math.max((b.fimMin - b.inicioMin) * pxPorMin, alturaMinima),
    "--col": posicao.coluna,
    "--cols": posicao.colunas,
    "--col-e": estreita.coluna,
    "--cols-e": estreita.colunas,
  } as CSSProperties;
}

/** Conteúdo do bloco: o nome acessível começa por "Pet · Tutor"; o cuidado vem logo depois do status. */
function ConteudoDoBloco({ a, fuso }: { a: AtendimentoDaAgenda; fuso: string }) {
  const horario = `${noFuso(a.inicio, fuso).hora}–${noFuso(a.fim, fuso).hora}`;
  return (
    <>
      <span className="bloco-linha">
        <strong>{a.pet.nome}</strong> · {a.tutor.nome}
      </span>
      <span className="bloco-linha">
        <SeloDeStatus status={a.status} mini /> · {horario}
      </span>
      {a.pet.observacoes && (
        <span className="bloco-linha bloco-cuidado">
          <Icone nome="alerta" />
          {a.pet.observacoes}
        </span>
      )}
      <span className="bloco-linha">{a.itens.map((i) => i.descricao).join(", ")}</span>
      {a.observacoes && <span className="bloco-linha suave">{a.observacoes}</span>}
    </>
  );
}

/**
 * Agenda do dia: os blocos dos atendimentos ativos por cima e os horários livres tocáveis por baixo. Na ordem da
 * página (leitor de tela, teclado), os atendimentos vêm antes dos horários livres. No dia de hoje, a linha "agora".
 */
export function GradeDoDia({
  dia,
  fuso,
  atendimentos,
  agora,
  destaque,
}: {
  dia: Dia;
  fuso: string;
  atendimentos: AtendimentoDaAgenda[];
  /** Minutos desde a meia-noite, só quando o dia aberto é hoje. */
  agora?: number;
  /** Atendimento recém-agendado, com destaque. */
  destaque?: string;
}) {
  const blocos = posicionarNoDia(
    atendimentos.filter((a) => ocupaHorario(a.status)),
    dia,
    fuso,
  );
  const faixa = faixaDe(blocos);
  const posicoes = new Map<string, Posicao>(
    distribuirEmColunas(blocos.map((b) => ({ id: b.atendimento.id, ...b }))).map((p) => [p.id, p]),
  );
  const vazios: number[] = [];
  for (let m = faixa.inicio; m < faixa.fim; m += INTERVALO_DOS_HORARIOS_VAZIOS) vazios.push(m);
  const altura = (faixa.fim - faixa.inicio) * PX_POR_MIN_DIA;

  // Grupos com mais colunas do que cabem na tela estreita: a 1ª coluna fica, e o resto vai para o "+N".
  const excedentes = new Map<number, NaGrade[]>();
  for (const b of blocos) {
    const p = posicoes.get(b.atendimento.id)!;
    if (p.colunas > COLUNAS_NA_TELA_ESTREITA && p.coluna > 0) {
      excedentes.set(p.grupo, [...(excedentes.get(p.grupo) ?? []), b]);
    }
  }
  const estreita = (p: Posicao) =>
    p.colunas > COLUNAS_NA_TELA_ESTREITA ? { coluna: 0, colunas: COLUNAS_NA_TELA_ESTREITA } : p;

  return (
    <div className="grade grade-dia">
      <RotulosDasHoras faixa={faixa} pxPorMin={PX_POR_MIN_DIA} />
      <div className="grade-corpo" style={{ height: altura }}>
        {blocos.map((b) => {
          const a = b.atendimento;
          const p = posicoes.get(a.id)!;
          const oculto = p.colunas > COLUNAS_NA_TELA_ESTREITA && p.coluna > 0;
          return (
            <Link
              key={a.id}
              href={`/agenda/${a.id}`}
              className={`bloco status-${a.status}${oculto ? " oculto-na-tela-estreita" : ""}${a.id === destaque ? " bloco-novo" : ""}`}
              style={estiloDoBloco(b, p, estreita(p), faixa.inicio, PX_POR_MIN_DIA, 44)}
            >
              <ConteudoDoBloco a={a} fuso={fuso} />
            </Link>
          );
        })}
        {[...excedentes.entries()].map(([grupo, ocultos]) => {
          const doGrupo = blocos.filter((b) => posicoes.get(b.atendimento.id)!.grupo === grupo);
          const inicio = Math.min(...doGrupo.map((b) => b.inicioMin));
          const fim = Math.max(...doGrupo.map((b) => Math.max(b.fimMin, b.inicioMin + DURACAO_VISUAL_MINIMA_MIN)));
          const lista = `mais-no-horario-${grupo}`;
          return (
            <span key={grupo} className="mais-n-grupo">
              <button
                type="button"
                className="mais-n"
                popoverTarget={lista}
                style={{ top: (inicio - faixa.inicio) * PX_POR_MIN_DIA, height: (fim - inicio) * PX_POR_MIN_DIA }}
                aria-label={`Mais ${ocultos.length} atendimentos às ${horaDoMinuto(inicio)}`}
              >
                +{ocultos.length}
              </button>
              <span id={lista} popover="auto" className="menu-flutuante lista-mais-n">
                <span className="rotulo">A partir das {horaDoMinuto(inicio)}</span>
                {ocultos.map(({ atendimento: a }) => (
                  <Link key={a.id} href={`/agenda/${a.id}`} className={`bloco bloco-na-lista status-${a.status}`}>
                    <ConteudoDoBloco a={a} fuso={fuso} />
                  </Link>
                ))}
              </span>
            </span>
          );
        })}
        {agora !== undefined && agora >= faixa.inicio && agora <= faixa.fim && (
          <span className="agora" style={{ top: (agora - faixa.inicio) * PX_POR_MIN_DIA }} aria-hidden="true">
            <span>{horaDoMinuto(agora)}</span>
          </span>
        )}
        {vazios.map((m) => (
          <Link
            key={m}
            href={urlDoAgendamento({ dia, hora: horaDoMinuto(m) })}
            className={`horario-vazio${m % 60 === 0 ? " hora-cheia" : ""}`}
            style={{ top: (m - faixa.inicio) * PX_POR_MIN_DIA, height: INTERVALO_DOS_HORARIOS_VAZIOS * PX_POR_MIN_DIA }}
            aria-label={`Agendar às ${horaDoMinuto(m)}`}
          >
            <Icone nome="mais" />
          </Link>
        ))}
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
            <span className="grade-semana-cabecalho">{rotuloCurtoDoDia(dia).replace(/[.,]/g, "")}</span>
            <span className="grade-corpo" style={{ height: altura }}>
              {blocos.map((b) => {
                const a = b.atendimento;
                return (
                  <span
                    key={a.id}
                    className={`bloco bloco-compacto status-${a.status}`}
                    style={estiloDoBloco(
                      b,
                      posicoes.get(a.id)!,
                      posicoes.get(a.id)!,
                      faixa.inicio,
                      PX_POR_MIN_SEMANA,
                      DURACAO_VISUAL_MINIMA_MIN,
                    )}
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
