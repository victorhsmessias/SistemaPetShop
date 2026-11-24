import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { lerRetorno, parametroDeRetorno } from "@/app/(dona)/agenda/retorno";
import { FormularioPet } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Voltar } from "@/app/componentes/voltar";
import { opcoesDeEspecie, opcoesDePorte } from "@/modules/cadastros/pets";
import { obterTutor } from "@/modules/cadastros/tutores";

export const metadata: Metadata = { title: "Novo pet" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ agendar?: string }> };

export default async function PaginaNovoPet({ params, searchParams }: Props) {
  const { id } = await params;
  const tutor = await naEmpresaDaDona((tx) => obterTutor(tx, id));
  if (!tutor) notFound();
  // Vindo do agendamento: depois de salvar, volta para o agendamento com este pet escolhido.
  const retorno = lerRetorno((await searchParams).agendar);

  return (
    <main className="pagina">
      <Voltar href={`/clientes/${tutor.id}`} destino={tutor.nome} />
      <h1>Novo pet</h1>
      {retorno && <p className="suave">Depois de cadastrar, você volta para o agendamento.</p>}
      <div className="cartao">
        <FormularioPet
          tutorId={tutor.id}
          especies={opcoesDeEspecie}
          portes={opcoesDePorte}
          agendar={retorno ? parametroDeRetorno(retorno) : undefined}
        />
      </div>
    </main>
  );
}
