import type { Metadata } from "next";
import Link from "next/link";

import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { formatarTelefone } from "@/modules/cadastros/telefone";
import { buscarTutores } from "@/modules/cadastros/tutores";

export const metadata: Metadata = { title: "Clientes · banho-e-tosa" };

type Props = { searchParams: Promise<{ busca?: string | string[] }> };

export default async function PaginaClientes({ searchParams }: Props) {
  const { busca: valor } = await searchParams;
  const busca = (Array.isArray(valor) ? valor[0] : valor)?.slice(0, 100) ?? "";
  const tutores = await naEmpresaDaDona((tx) => buscarTutores(tx, busca));

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Clientes</h1>
        <Link href="/clientes/novo" className="botao-link botao-primario">
          Novo cliente
        </Link>
      </header>

      <form className="busca" role="search" action="/clientes">
        <label htmlFor="busca" className="visualmente-oculto">
          Buscar por tutor, pet ou telefone
        </label>
        <input id="busca" name="busca" type="search" defaultValue={busca} placeholder="Tutor, pet ou telefone" enterKeyHint="search" />
        <button type="submit" className="botao-secundario">
          Buscar
        </button>
      </form>

      {tutores.length === 0 ? (
        <p className="suave">{busca ? `Nada encontrado para "${busca}".` : "Nenhum cliente cadastrado ainda."}</p>
      ) : (
        <ul className="lista-toque" aria-label="Tutores">
          {tutores.map((tutor) => (
            <li key={tutor.id}>
              <Link href={`/clientes/${tutor.id}`}>
                <span className="titulo">{tutor.nome}</span>
                <span className="detalhe">
                  {[formatarTelefone(tutor.telefone), tutor.pets.join(", ")].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
