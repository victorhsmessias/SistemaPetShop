import type { Metadata } from "next";
import Link from "next/link";

import { iniciais } from "@/app/(dona)/conta";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { BuscaAoDigitar } from "@/app/componentes/busca-ao-digitar";
import { EstadoVazio } from "@/app/componentes/estado-vazio";
import { Icone } from "@/app/componentes/icone";
import { formatarTelefone } from "@/modules/cadastros/telefone";
import { buscarTutores } from "@/modules/cadastros/tutores";

export const metadata: Metadata = { title: "Clientes · banho-e-tosa" };

type Props = { searchParams: Promise<{ busca?: string | string[] }> };

// Clientes: busca que filtra ao digitar (tutor, pet ou telefone, sem acento). Na linha, os pets em destaque (é por
// eles que a dona reconhece o cliente) e o nome e o telefone do tutor menores.
export default async function PaginaClientes({ searchParams }: Props) {
  const { busca: valor } = await searchParams;
  const busca = (Array.isArray(valor) ? valor[0] : valor)?.slice(0, 100) ?? "";
  const tutores = await naEmpresaDaDona((tx) => buscarTutores(tx, busca));
  const novoCliente = (texto: string) => (
    <Link href="/clientes/novo" className="botao-link botao-secundario">
      {texto}
    </Link>
  );

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Clientes</h1>
        <Link href="/clientes/novo" className="botao-link botao-primario">
          Novo cliente
        </Link>
      </header>

      <BuscaAoDigitar rotulo="Buscar por tutor, pet ou telefone" valorInicial={busca} placeholder="Digite para filtrar" />

      {tutores.length === 0 ? (
        busca ? (
          <EstadoVazio titulo={`Nada encontrado para "${busca}".`} acao={novoCliente("Cadastrar novo cliente")}>
            Confira a grafia ou procure pelo nome do pet ou pelo telefone.
          </EstadoVazio>
        ) : (
          <EstadoVazio titulo="Nenhum cliente cadastrado ainda." acao={novoCliente("Cadastrar o primeiro cliente")} />
        )
      ) : (
        <ul className="lista-toque lista-clientes" aria-label="Tutores">
          {tutores.map((tutor) => (
            <li key={tutor.id}>
              <Link href={`/clientes/${tutor.id}`}>
                <span className="avatar" aria-hidden="true">
                  {iniciais(tutor.nome)}
                </span>
                <span className="linha-corpo">
                  <span className="titulo">{tutor.pets.length > 0 ? tutor.pets.join(", ") : tutor.nome}</span>
                  <span className="detalhe">
                    {[tutor.pets.length > 0 ? tutor.nome : null, formatarTelefone(tutor.telefone)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Icone nome="dir" className="seta-linha" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
