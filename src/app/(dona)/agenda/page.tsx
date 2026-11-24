import type { Metadata } from "next";
import Link from "next/link";

import { GradeDoDia } from "@/app/(dona)/agenda/grade";
import { urlDoAgendamento, urlDoDia } from "@/app/(dona)/agenda/retorno";
import { RolarParaAgora } from "@/app/(dona)/agenda/rolar-para-agora";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { AvisoDeSucesso } from "@/app/componentes/aviso-de-sucesso";
import { EstadoVazio } from "@/app/componentes/estado-vazio";
import { GrupoRecolhivel } from "@/app/componentes/grupo-recolhivel";
import { NavegacaoPeriodo } from "@/app/componentes/navegacao-periodo";
import { listarAgenda } from "@/modules/agenda/atendimentos";
import { ocupaHorario } from "@/modules/agenda/calculos";
import { ehDia, hojeNoFuso, noFuso, rotuloCurtoDoDia, rotuloDoDia, somarDias } from "@/modules/agenda/fuso";
import { NOMES_DOS_STATUS } from "@/modules/agenda/status";
import { formatarReais } from "@/modules/compartilhado/dinheiro";
import { ehUuid } from "@/modules/compartilhado/validacao";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";
import { recebidoNoPeriodo } from "@/modules/financeiro/resumo";

export const metadata: Metadata = { title: "Agenda" };

type Props = { searchParams: Promise<{ dia?: string; novo?: string }> };

const minutosDaHora = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

// Tela inicial da dona: a agenda do dia, com navegação entre os dias. O dia de hoje é o do fuso da empresa, e a
// grade abre na linha "agora". Acima da grade, "Recebido hoje" e o próximo atendimento.
export default async function PaginaAgenda({ searchParams }: Props) {
  const { dia: pedido, novo } = await searchParams;
  const { dia, hoje, fuso, atendimentos, recebidoHoje, agora } = await naEmpresaDaDona(async (tx) => {
    const fusoEmpresa = await fusoDaEmpresa(tx);
    const hojeEmpresa = hojeNoFuso(fusoEmpresa);
    const diaEscolhido = ehDia(pedido) ? pedido : hojeEmpresa;
    return {
      dia: diaEscolhido,
      hoje: hojeEmpresa,
      agora: new Date(),
      // "Recebido hoje" é sempre o dia de hoje no fuso da empresa, qualquer que seja o dia aberto na agenda.
      recebidoHoje: await recebidoNoPeriodo(tx, hojeEmpresa, somarDias(hojeEmpresa, 1)),
      ...(await listarAgenda(tx, diaEscolhido)),
    };
  });
  const foraDaGrade = atendimentos.filter((a) => !ocupaHorario(a.status));
  const ehHoje = dia === hoje;
  const agoraNoDia = ehHoje ? minutosDaHora(noFuso(agora, fuso).hora) : undefined;
  // Recém-agendado (?novo=<id>, de agendarAcao): só um id que está mesmo neste dia vira aviso e destaque.
  const agendado = ehUuid(novo) ? atendimentos.find((a) => a.id === novo) : undefined;
  const proximo = ehHoje
    ? atendimentos.find((a) => (a.status === "agendado" || a.status === "confirmado") && a.inicio >= agora)
    : undefined;

  return (
    <main className="pagina pagina-larga pagina-agenda">
      <header className="topo">
        <h1>Agenda</h1>
        <Link href={`/agenda/semana?dia=${dia}`} className="botao-link botao-secundario">
          Semana
        </Link>
      </header>

      {agendado && (
        <AvisoDeSucesso
          mensagem={`Atendimento agendado para ${rotuloCurtoDoDia(dia)} às ${noFuso(agendado.inicio, fuso).hora}.`}
          parametros={["novo"]}
        />
      )}

      <NavegacaoPeriodo
        rotulo="Dias"
        titulo={rotuloDoDia(dia)}
        anterior={{ href: urlDoDia(somarDias(dia, -1)), rotulo: "Dia anterior" }}
        proximo={{ href: urlDoDia(somarDias(dia, 1)), rotulo: "Próximo dia" }}
        atual={ehHoje ? "Hoje" : null}
        voltar={{ href: urlDoDia(hoje), rotulo: "Voltar para hoje" }}
      />

      <Link href={urlDoAgendamento({ dia })} className="botao-link botao-primario botao-largo">
        Novo agendamento
      </Link>

      <div className="resumos">
        <Link href="/financeiro" className="resumo-mini recebido-hoje">
          <span className="suave">Recebido hoje</span>
          <strong>{formatarReais(recebidoHoje.totalCentavos)}</strong>
        </Link>
        {proximo && (
          <Link href={`/agenda/${proximo.id}`} className="resumo-mini">
            <span className="suave">Próximo</span>
            <strong>
              {noFuso(proximo.inicio, fuso).hora} · {proximo.pet.nome}
            </strong>
          </Link>
        )}
      </div>

      {atendimentos.length === 0 && (
        <EstadoVazio titulo="Nenhum atendimento neste dia." />
      )}

      <section aria-label={`Atendimentos de ${rotuloDoDia(dia)}`}>
        <GradeDoDia dia={dia} fuso={fuso} atendimentos={atendimentos} agora={agoraNoDia} destaque={agendado?.id} />
      </section>
      {ehHoje && <RolarParaAgora />}

      {foraDaGrade.length > 0 && (
        <GrupoRecolhivel
          resumo={foraDaGrade.length === 1 ? "1 cancelado ou falta" : `${foraDaGrade.length} cancelados ou faltas`}
        >
          <ul className="lista-toque" aria-label="Cancelados e faltas">
            {foraDaGrade.map((a) => (
              <li key={a.id}>
                <Link href={`/agenda/${a.id}`}>
                  <span className="titulo">
                    {a.pet.nome} · {NOMES_DOS_STATUS[a.status]}
                  </span>
                  <span className="detalhe">
                    {noFuso(a.inicio, fuso).hora} · {a.tutor.nome}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </GrupoRecolhivel>
      )}
    </main>
  );
}
