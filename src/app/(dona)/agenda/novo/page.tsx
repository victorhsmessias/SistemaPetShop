import type { Metadata } from "next";
import Link from "next/link";

import { FormularioAgendamento } from "@/app/(dona)/agenda/formularios";
import { parametroDeRetorno, urlDoAgendamento, urlDoDia } from "@/app/(dona)/agenda/retorno";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { buscarPetsParaAgendar, obterPetParaAgendar } from "@/modules/agenda/atendimentos";
import { ehDia, ehHora, hojeNoFuso, rotuloDoDia } from "@/modules/agenda/fuso";
import { NOMES_DAS_ESPECIES, NOMES_DOS_PORTES } from "@/modules/cadastros/pets";
import { listarServicos } from "@/modules/catalogo/servicos";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";

export const metadata: Metadata = { title: "Novo agendamento · banho-e-tosa" };

type Props = { searchParams: Promise<{ dia?: string; hora?: string; pet?: string; busca?: string }> };

// Agendar em poucos toques (H5): busca o pet pelo nome dele ou do tutor, escolhe os serviços e confirma.
// Só pets e serviços ativos. Se o pet não existe, o atalho cadastra tutor e pet e volta para cá.
export default async function PaginaNovoAgendamento({ searchParams }: Props) {
  const pedido = await searchParams;
  const busca = (pedido.busca ?? "").trim();
  const dados = await naEmpresaDaDona(async (tx) => {
    const dia = ehDia(pedido.dia) ? pedido.dia : hojeNoFuso(await fusoDaEmpresa(tx));
    const hora = ehHora(pedido.hora) ? pedido.hora : undefined;
    const pet = pedido.pet ? await obterPetParaAgendar(tx, pedido.pet) : null;
    if (pet) return { dia, hora, pet, servicos: await listarServicos(tx), pets: [] };
    return { dia, hora, pet: null, servicos: [], pets: await buscarPetsParaAgendar(tx, busca) };
  });
  const { dia, hora, pet } = dados;
  const quando = `${rotuloDoDia(dia)}${hora ? `, ${hora}` : ""}`;

  return (
    <main className="pagina">
      <Link href={urlDoDia(dia)} className="voltar">
        ‹ Agenda
      </Link>
      <h1>Novo agendamento</h1>
      <p className="suave">{quando}</p>

      {pet ? (
        <>
          <section className="cartao">
            <h2>{pet.nome}</h2>
            <p className="suave">
              {[
                NOMES_DAS_ESPECIES[pet.especie as keyof typeof NOMES_DAS_ESPECIES],
                NOMES_DOS_PORTES[pet.porte as keyof typeof NOMES_DOS_PORTES],
                pet.tutorNome,
              ].join(" · ")}
            </p>
            {pet.observacoes && (
              <p className="cuidado">
                <strong>Cuidados</strong>
                {pet.observacoes}
              </p>
            )}
            <Link href={urlDoAgendamento({ dia, hora })} className="link-de-toque">
              Trocar o pet
            </Link>
          </section>
          <div className="cartao">
            <FormularioAgendamento
              petId={pet.id}
              dia={dia}
              hora={hora}
              servicos={dados.servicos.map((s) => ({
                id: s.id,
                nome: s.nome,
                precoCentavos: s.precoCentavos,
                duracaoMin: s.duracaoMin,
              }))}
            />
          </div>
        </>
      ) : (
        <>
          <form className="busca" role="search" action="/agenda/novo">
            <input type="hidden" name="dia" value={dia} />
            {hora && <input type="hidden" name="hora" value={hora} />}
            <label htmlFor="busca" className="visualmente-oculto">
              Buscar pelo nome do pet ou do tutor
            </label>
            <input
              id="busca"
              name="busca"
              type="search"
              defaultValue={busca}
              placeholder="Nome do pet ou do tutor"
              autoComplete="off"
            />
            <button type="submit" className="botao-secundario">
              Buscar
            </button>
          </form>

          {dados.pets.length === 0 ? (
            <p className="suave">{busca ? `Nenhum pet ativo encontrado para "${busca}".` : "Nenhum pet ativo cadastrado."}</p>
          ) : (
            <ul className="lista-toque" aria-label="Pets">
              {dados.pets.map((p) => (
                <li key={p.id}>
                  <Link href={urlDoAgendamento({ dia, hora, petId: p.id })}>
                    <span className="titulo">
                      {p.nome}
                      {p.observacoes ? " ⚠" : ""}
                    </span>
                    <span className="detalhe">{p.tutorNome}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={`/clientes/novo?agendar=${parametroDeRetorno({ dia, hora })}`}
            className="botao-link botao-secundario botao-largo"
          >
            Cadastrar tutor e pet
          </Link>
        </>
      )}
    </main>
  );
}
