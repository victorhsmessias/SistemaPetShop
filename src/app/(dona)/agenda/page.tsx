import type { Metadata } from "next";
import Link from "next/link";

import { GradeDoDia } from "@/app/(dona)/agenda/grade";
import { urlDoAgendamento, urlDoDia } from "@/app/(dona)/agenda/retorno";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { BotaoSair } from "@/app/botao-sair";
import { listarAgenda } from "@/modules/agenda/atendimentos";
import { ocupaHorario } from "@/modules/agenda/calculos";
import { ehDia, hojeNoFuso, noFuso, rotuloDoDia, somarDias } from "@/modules/agenda/fuso";
import { NOMES_DOS_STATUS } from "@/modules/agenda/status";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";

export const metadata: Metadata = { title: "Agenda · banho-e-tosa" };

type Props = { searchParams: Promise<{ dia?: string }> };

// Tela inicial da dona: a agenda do dia, com navegação entre os dias. O dia de hoje é o do fuso da empresa.
export default async function PaginaAgenda({ searchParams }: Props) {
  const pedido = (await searchParams).dia;
  const { dia, hoje, fuso, atendimentos } = await naEmpresaDaDona(async (tx) => {
    const fusoEmpresa = await fusoDaEmpresa(tx);
    const hojeEmpresa = hojeNoFuso(fusoEmpresa);
    const diaEscolhido = ehDia(pedido) ? pedido : hojeEmpresa;
    return { dia: diaEscolhido, hoje: hojeEmpresa, ...(await listarAgenda(tx, diaEscolhido)) };
  });
  const foraDaGrade = atendimentos.filter((a) => !ocupaHorario(a.status));

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Agenda</h1>
        <Link href={`/agenda/semana?dia=${dia}`} className="botao-link botao-secundario">
          Semana
        </Link>
      </header>

      <nav className="navegacao-dias" aria-label="Dias">
        <Link href={urlDoDia(somarDias(dia, -1))} aria-label="Dia anterior">
          ‹
        </Link>
        <span className="navegacao-dias-atual">
          <span className="titulo">{rotuloDoDia(dia)}</span>
          {dia === hoje ? <span className="suave">Hoje</span> : <Link href={urlDoDia(hoje)}>Voltar para hoje</Link>}
        </span>
        <Link href={urlDoDia(somarDias(dia, 1))} aria-label="Próximo dia">
          ›
        </Link>
      </nav>

      <Link href={urlDoAgendamento({ dia })} className="botao-link botao-primario botao-largo">
        Novo agendamento
      </Link>

      {foraDaGrade.length > 0 && (
        <details className="cartao fora-da-grade">
          <summary>
            {foraDaGrade.length === 1 ? "1 cancelado ou falta" : `${foraDaGrade.length} cancelados ou faltas`}
          </summary>
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
        </details>
      )}

      <section aria-label={`Atendimentos de ${rotuloDoDia(dia)}`}>
        <GradeDoDia dia={dia} fuso={fuso} atendimentos={atendimentos} />
      </section>

      <footer className="rodape">
        <BotaoSair />
      </footer>
    </main>
  );
}
