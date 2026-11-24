import type { Metadata } from "next";

import { lerRetorno, parametroDeRetorno, urlDoAgendamento } from "@/app/(dona)/agenda/retorno";
import { FormularioClienteEPet, FormularioTutor } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Voltar } from "@/app/componentes/voltar";
import { opcoesDeEspecie, opcoesDePorte } from "@/modules/cadastros/pets";

export const metadata: Metadata = { title: "Novo cliente" };

type Props = { searchParams: Promise<{ agendar?: string }> };

// Novo cliente. Vindo do agendamento (?agendar=, conferido em agenda/retorno.ts), a tela é "Novo cliente e pet":
// tutor e pet de uma vez, e a volta direta para o agendamento com o pet escolhido.
export default async function PaginaNovoCliente({ searchParams }: Props) {
  await naEmpresaDaDona(async () => undefined);
  const retorno = lerRetorno((await searchParams).agendar);

  if (retorno) {
    return (
      <main className="pagina">
        <Voltar href={urlDoAgendamento(retorno)} destino="Agendamento" />
        <h1>Novo cliente e pet</h1>
        <p className="suave">Depois de salvar, você volta para o agendamento com o pet escolhido.</p>
        <div className="cartao">
          <FormularioClienteEPet agendar={parametroDeRetorno(retorno)} especies={opcoesDeEspecie} portes={opcoesDePorte} />
        </div>
      </main>
    );
  }

  return (
    <main className="pagina">
      <Voltar href="/clientes" destino="Clientes" />
      <h1>Novo cliente</h1>
      <div className="cartao">
        <FormularioTutor />
      </div>
    </main>
  );
}
