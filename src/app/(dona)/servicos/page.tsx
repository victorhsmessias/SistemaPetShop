import type { Metadata } from "next";
import Link from "next/link";

import { textoDoAviso } from "@/app/(dona)/avisos";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { AvisoDeSucesso } from "@/app/componentes/aviso-de-sucesso";
import { EstadoVazio } from "@/app/componentes/estado-vazio";
import { listarServicos } from "@/modules/catalogo/servicos";
import { formatarReais } from "@/modules/compartilhado/dinheiro";

export const metadata: Metadata = { title: "Serviços" };

type Props = { searchParams: Promise<{ inativos?: string; salvo?: string }> };

export default async function PaginaServicos({ searchParams }: Props) {
  const pedido = await searchParams;
  const comInativos = pedido.inativos === "1";
  const aviso = textoDoAviso(pedido.salvo);
  const servicos = await naEmpresaDaDona((tx) => listarServicos(tx, comInativos));

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Serviços</h1>
        <Link href="/servicos/novo" className="botao-link botao-primario">
          Novo serviço
        </Link>
      </header>
      {aviso && <AvisoDeSucesso mensagem={aviso} parametros={["salvo"]} />}

      {servicos.length === 0 ? (
        <EstadoVazio titulo="Nenhum serviço cadastrado ainda.">
          Cadastre cada serviço com preço e duração.
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
