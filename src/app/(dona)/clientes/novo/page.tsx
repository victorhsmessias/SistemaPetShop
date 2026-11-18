import type { Metadata } from "next";

import { lerRetorno, parametroDeRetorno, urlDoAgendamento } from "@/app/(dona)/agenda/retorno";
import { FormularioTutor } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Voltar } from "@/app/componentes/voltar";

export const metadata: Metadata = { title: "Novo cliente · banho-e-tosa" };

type Props = { searchParams: Promise<{ agendar?: string }> };

export default async function PaginaNovoCliente({ searchParams }: Props) {
  await naEmpresaDaDona(async () => undefined);
  // Vindo do agendamento: depois do tutor e do pet, a dona volta para o agendamento com o pet escolhido.
  const retorno = lerRetorno((await searchParams).agendar);

  return (
    <main className="pagina">
      <Voltar href={retorno ? urlDoAgendamento(retorno) : "/clientes"} destino={retorno ? "Agendamento" : "Clientes"} />
      <h1>Novo cliente</h1>
      {retorno && <p className="suave">Depois do tutor, cadastre o pet e volte para o agendamento.</p>}
      <div className="cartao">
        <FormularioTutor agendar={retorno ? parametroDeRetorno(retorno) : undefined} />
      </div>
    </main>
  );
}
