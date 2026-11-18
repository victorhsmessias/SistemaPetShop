import type { Metadata } from "next";
import Link from "next/link";

import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { EstadoVazio } from "@/app/componentes/estado-vazio";
import { Icone } from "@/app/componentes/icone";
import { listarServicos } from "@/modules/catalogo/servicos";
import { formatarReais } from "@/modules/compartilhado/dinheiro";

export const metadata: Metadata = { title: "Serviços · banho-e-tosa" };

type Props = { searchParams: Promise<{ inativos?: string }> };

export default async function PaginaServicos({ searchParams }: Props) {
  const comInativos = (await searchParams).inativos === "1";
  const servicos = await naEmpresaDaDona((tx) => listarServicos(tx, comInativos));

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Serviços</h1>
        <Link href="/servicos/novo" className="botao-link botao-primario">
          <Icone nome="mais" />
          Novo serviço
        </Link>
      </header>

      {servicos.length === 0 ? (
        <EstadoVazio icone="servicos" titulo="Nenhum serviço cadastrado ainda.">
          Cadastre o que você oferece (por exemplo Banho e Tosa): o preço e a duração entram sozinhos no agendamento.
        </EstadoVazio>
      ) : (
        <ul className="lista-toque" aria-label="Serviços">
          {servicos.map((servico) => (
            <li key={servico.id} className={servico.ativo ? undefined : "inativo"}>
              <Link href={`/servicos/${servico.id}/editar`}>
                <span className="titulo">
                  {servico.nome} {!servico.ativo && <span className="etiqueta">inativo</span>}
                </span>
                <span className="detalhe">
                  {formatarReais(servico.precoCentavos)} · {servico.duracaoMin} min
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p>
        <Link className="alternar-inativos" href={comInativos ? "/servicos" : "/servicos?inativos=1"}>
          {comInativos ? "Mostrar só os ativos" : "Ver também os serviços inativos"}
        </Link>
      </p>
    </main>
  );
}
