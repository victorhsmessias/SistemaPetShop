import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FormularioTutor } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Voltar } from "@/app/componentes/voltar";
import { formatarTelefone } from "@/modules/cadastros/telefone";
import { obterTutor } from "@/modules/cadastros/tutores";

export const metadata: Metadata = { title: "Editar cliente · banho-e-tosa" };

type Props = { params: Promise<{ id: string }> };

export default async function PaginaEditarCliente({ params }: Props) {
  const { id } = await params;
  const tutor = await naEmpresaDaDona((tx) => obterTutor(tx, id));
  if (!tutor) notFound();

  return (
    <main className="pagina">
      <Voltar href={`/clientes/${tutor.id}`} destino={tutor.nome} />
      <h1>Editar cliente</h1>
      <div className="cartao">
        <FormularioTutor
          id={tutor.id}
          valores={{
            nome: tutor.nome,
            telefone: formatarTelefone(tutor.telefone),
            observacoes: tutor.observacoes ?? "",
          }}
        />
      </div>
    </main>
  );
}
