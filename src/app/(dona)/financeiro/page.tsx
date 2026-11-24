import type { Metadata } from "next";
import Link from "next/link";

import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { EstadoVazio } from "@/app/componentes/estado-vazio";
import { GrupoRecolhivel } from "@/app/componentes/grupo-recolhivel";
import { NavegacaoPeriodo } from "@/app/componentes/navegacao-periodo";
import { contarConcluidos } from "@/modules/agenda/conclusao";
import {
  ehMes,
  hojeNoFuso,
  inicioDoDia,
  mesDoDia,
  primeiroDiaDoMes,
  rotuloDiaMes,
  rotuloDoDia,
  rotuloDoMes,
  somarDias,
  somarMeses,
  type Dia,
} from "@/modules/agenda/fuso";
import { formatarReais } from "@/modules/compartilhado/dinheiro";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";
import { listarReceitasDoPeriodo, recebidoNoPeriodo, type ReceitaDaLista } from "@/modules/financeiro/resumo";

export const metadata: Metadata = { title: "Financeiro" };

type Props = { searchParams: Promise<{ mes?: string }> };

const urlDoMes = (mes: string) => `/financeiro?mes=${mes}`;

function quantosConcluidos(n: number): string {
  if (n === 0) return "Nenhum atendimento concluído";
  return n === 1 ? "1 atendimento concluído" : `${n} atendimentos concluídos`;
}

/** Linha da receita: pet (nunca o tutor, regra 18), dia e forma, e o valor à direita. */
function Receita({ r }: { r: ReceitaDaLista }) {
  const conteudo = (
    <>
      <span className="linha-receita-corpo">
        <span className="titulo">{r.petNome ?? r.descricao}</span>
        <span className="detalhe">
          {rotuloDiaMes(r.data)}
          {r.forma ? ` · ${r.forma}` : ""}
          {r.motivoCancelamento ? ` · Motivo: ${r.motivoCancelamento}` : ""}
        </span>
      </span>
      <span className="linha-receita-valor">{formatarReais(r.valorCentavos)}</span>
    </>
  );
  return (
    <li>{r.atendimentoId ? <Link href={`/agenda/${r.atendimentoId}`}>{conteudo}</Link> : <div>{conteudo}</div>}</li>
  );
}

// Financeiro (H10): o resumo de hoje e do mês (entrou e atendimentos concluídos) e as receitas do mês, com
// o mês navegável. Cancelados ficam fora da soma e aparecem à parte, com o motivo. Dias e meses no fuso
// da empresa. Despesas, "a receber" e o saldo do mês entram no M3.
export default async function PaginaFinanceiro({ searchParams }: Props) {
  const pedido = (await searchParams).mes;
  const dados = await naEmpresaDaDona(async (tx) => {
    const fuso = await fusoDaEmpresa(tx);
    const hoje = hojeNoFuso(fuso);
    const mes = ehMes(pedido) ? pedido : mesDoDia(hoje);
    const de: Dia = primeiroDiaDoMes(mes);
    const ate: Dia = primeiroDiaDoMes(somarMeses(mes, 1));
    const amanha = somarDias(hoje, 1);
    return {
      hoje,
      mes,
      recebidoHoje: await recebidoNoPeriodo(tx, hoje, amanha),
      concluidosHoje: await contarConcluidos(tx, inicioDoDia(hoje, fuso), inicioDoDia(amanha, fuso)),
      recebidoNoMes: await recebidoNoPeriodo(tx, de, ate),
      concluidosNoMes: await contarConcluidos(tx, inicioDoDia(de, fuso), inicioDoDia(ate, fuso)),
      receitas: await listarReceitasDoPeriodo(tx, de, ate),
    };
  });
  const { hoje, mes, receitas } = dados;
  const mesAtual = mesDoDia(hoje);
  const rotulo = rotuloDoMes(mes);

  return (
    <main className="pagina pagina-larga pagina-financeiro">
      <header className="topo">
        <h1>Financeiro</h1>
      </header>

      <div className="financeiro-colunas">
        <div className="financeiro-resumo">
          <section className="cartao destaque" aria-labelledby="titulo-hoje">
            <h2 id="titulo-hoje">Hoje</h2>
            <p className="suave">{rotuloDoDia(hoje)}</p>
            <p className="valor-destaque">{formatarReais(dados.recebidoHoje.totalCentavos)}</p>
            <p className="suave">{quantosConcluidos(dados.concluidosHoje)}</p>
          </section>

          <section className="cartao resumo-mes" aria-labelledby="titulo-mes">
            <NavegacaoPeriodo
              rotulo="Meses"
              titulo={rotulo}
              anterior={{ href: urlDoMes(somarMeses(mes, -1)), rotulo: "Mês anterior" }}
              proximo={{ href: urlDoMes(somarMeses(mes, 1)), rotulo: "Próximo mês" }}
              atual={mes === mesAtual ? "Este mês" : null}
              voltar={{ href: urlDoMes(mesAtual), rotulo: "Voltar para este mês" }}
            />
            <h2 id="titulo-mes">Entrou em {rotulo}</h2>
            <p className="valor-grande">{formatarReais(dados.recebidoNoMes.totalCentavos)}</p>
            <p className="suave">{quantosConcluidos(dados.concluidosNoMes)}</p>
          </section>
        </div>

        <div className="financeiro-lista">
          <section aria-labelledby="titulo-receitas">
            <h2 id="titulo-receitas">Receitas</h2>
            {receitas.validas.length === 0 ? (
              <EstadoVazio titulo={`Nenhuma receita em ${rotulo}.`}>
                A receita entra quando você conclui um atendimento.
              </EstadoVazio>
            ) : (
              <ul className="lista-toque lista-receitas" aria-label={`Receitas de ${rotulo}`}>
                {receitas.validas.map((r) => (
                  <Receita key={r.id} r={r} />
                ))}
              </ul>
            )}
          </section>

          {receitas.canceladas.length > 0 && (
            <GrupoRecolhivel
              resumo={
                receitas.canceladas.length === 1
                  ? "1 receita cancelada (fora da soma)"
                  : `${receitas.canceladas.length} receitas canceladas (fora da soma)`
              }
            >
              <ul className="lista-toque lista-receitas" aria-label="Receitas canceladas">
                {receitas.canceladas.map((r) => (
                  <Receita key={r.id} r={r} />
                ))}
              </ul>
            </GrupoRecolhivel>
          )}
        </div>
      </div>
    </main>
  );
}
