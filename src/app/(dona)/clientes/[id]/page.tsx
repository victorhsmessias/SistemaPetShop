import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { alternarPetAtivoAcao } from "@/app/(dona)/acoes";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { listarPetsDoTutor, NOMES_DAS_ESPECIES, NOMES_DOS_PORTES } from "@/modules/cadastros/pets";
import { formatarTelefone } from "@/modules/cadastros/telefone";
import { obterTutor } from "@/modules/cadastros/tutores";

export const metadata: Metadata = { title: "Cliente · banho-e-tosa" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ inativos?: string }> };

export default async function PaginaCliente({ params, searchParams }: Props) {
  const { id } = await params;
  const comInativos = (await searchParams).inativos === "1";
  const dados = await naEmpresaDaDona(async (tx) => {
    const tutor = await obterTutor(tx, id);
    return tutor ? { tutor, pets: await listarPetsDoTutor(tx, id, comInativos) } : null;
  });
  if (!dados) notFound();
  const { tutor, pets } = dados;

  return (
    <main className="pagina">
      <Link href="/clientes" className="voltar">
        ‹ Clientes
      </Link>
      <h1>{tutor.nome}</h1>
      <section className="cartao">
        {tutor.telefone && (
          <p>
            <a className="link-de-toque" href={`tel:${tutor.telefone}`}>
              {formatarTelefone(tutor.telefone)}
            </a>
          </p>
        )}
        {tutor.observacoes && <p className="suave">{tutor.observacoes}</p>}
        <Link href={`/clientes/${tutor.id}/editar`} className="botao-link botao-secundario">
          Editar tutor
        </Link>
      </section>

      <header className="topo">
        <h2>Pets</h2>
        <Link href={`/clientes/${tutor.id}/pets/novo`} className="botao-link botao-primario">
          Novo pet
        </Link>
      </header>

      {pets.length === 0 ? (
        <p className="suave">{comInativos ? "Nenhum pet cadastrado." : "Nenhum pet ativo."}</p>
      ) : (
        <ul className="lista-simples" aria-label="Pets">
          {pets.map((pet) => (
            <li key={pet.id} className={`cartao${pet.ativo ? "" : " inativo"}`}>
              <h3>
                {pet.nome} {!pet.ativo && <span className="etiqueta">inativo</span>}
              </h3>
              <p className="suave">
                {[NOMES_DAS_ESPECIES[pet.especie as keyof typeof NOMES_DAS_ESPECIES], pet.raca, NOMES_DOS_PORTES[pet.porte as keyof typeof NOMES_DOS_PORTES]]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {pet.observacoes && (
                <p className="cuidado">
                  <strong>Cuidados</strong>
                  {pet.observacoes}
                </p>
              )}
              <div className="acoes" style={{ marginTop: 12 }}>
                <Link href={`/clientes/${tutor.id}/pets/${pet.id}/editar`} className="botao-link botao-secundario">
                  Editar
                </Link>
                <form action={alternarPetAtivoAcao}>
                  <input type="hidden" name="petId" value={pet.id} />
                  <input type="hidden" name="ativo" value={pet.ativo ? "false" : "true"} />
                  <button type="submit" className="botao-secundario" style={{ width: "100%" }}>
                    {pet.ativo ? "Desativar" : "Reativar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p>
        <Link
          className="alternar-inativos"
          href={comInativos ? `/clientes/${tutor.id}` : `/clientes/${tutor.id}?inativos=1`}
        >
          {comInativos ? "Mostrar só os ativos" : "Ver também os pets inativos"}
        </Link>
      </p>
    </main>
  );
}
