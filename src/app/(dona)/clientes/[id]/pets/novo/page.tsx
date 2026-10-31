import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormularioPet } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { opcoesDeEspecie, opcoesDePorte } from "@/modules/cadastros/pets";
import { obterTutor } from "@/modules/cadastros/tutores";

export const metadata: Metadata = { title: "Novo pet · banho-e-tosa" };

type Props = { params: Promise<{ id: string }> };

export default async function PaginaNovoPet({ params }: Props) {
  const { id } = await params;
  const tutor = await naEmpresaDaDona((tx) => obterTutor(tx, id));
  if (!tutor) notFound();

  return (
    <main className="pagina">
      <Link href={`/clientes/${tutor.id}`} className="voltar">
        ‹ {tutor.nome}
      </Link>
      <h1>Novo pet</h1>
      <div className="cartao">
        <FormularioPet tutorId={tutor.id} especies={opcoesDeEspecie} portes={opcoesDePorte} />
      </div>
    </main>
  );
}
