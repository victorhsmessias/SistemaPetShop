import type { Metadata } from "next";
import Link from "next/link";

import { GradeDaSemana } from "@/app/(dona)/agenda/grade";
import { urlDoDia } from "@/app/(dona)/agenda/retorno";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { listarAgenda } from "@/modules/agenda/atendimentos";
import { diasDaSemana, ehDia, hojeNoFuso, rotuloDiaMes, somarDias } from "@/modules/agenda/fuso";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";

export const metadata: Metadata = { title: "Semana · banho-e-tosa" };

type Props = { searchParams: Promise<{ dia?: string }> };

// Semana de segunda a domingo do dia pedido (ou de hoje, no fuso da empresa).
export default async function PaginaSemana({ searchParams }: Props) {
  const pedido = (await searchParams).dia;
  const { dia, hoje, dias, fuso, atendimentos } = await naEmpresaDaDona(async (tx) => {
    const fusoEmpresa = await fusoDaEmpresa(tx);
    const hojeEmpresa = hojeNoFuso(fusoEmpresa);
    const diaEscolhido = ehDia(pedido) ? pedido : hojeEmpresa;
    const semana = diasDaSemana(diaEscolhido);
    return { dia: diaEscolhido, hoje: hojeEmpresa, dias: semana, ...(await listarAgenda(tx, semana[0]!, 7)) };
  });

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Semana</h1>
        <Link href={urlDoDia(dia)} className="botao-link botao-secundario">
          Dia
        </Link>
      </header>

      <nav className="navegacao-dias" aria-label="Semanas">
        <Link href={`/agenda/semana?dia=${somarDias(dias[0]!, -7)}`} aria-label="Semana anterior">
          ‹
        </Link>
        <span className="navegacao-dias-atual">
          <span className="titulo">
            {rotuloDiaMes(dias[0]!)} a {rotuloDiaMes(dias[6]!)}
          </span>
          {dias.includes(hoje) ? (
            <span className="suave">Esta semana</span>
          ) : (
            <Link href={`/agenda/semana?dia=${hoje}`}>Voltar para esta semana</Link>
          )}
        </span>
        <Link href={`/agenda/semana?dia=${somarDias(dias[0]!, 7)}`} aria-label="Próxima semana">
          ›
        </Link>
      </nav>

      <p className="dica">Toque num dia para ver os atendimentos.</p>
      <GradeDaSemana dias={dias} hoje={hoje} fuso={fuso} atendimentos={atendimentos} />
    </main>
  );
}
