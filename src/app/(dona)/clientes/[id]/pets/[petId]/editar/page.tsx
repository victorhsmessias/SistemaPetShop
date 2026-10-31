import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormularioPet } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { obterPet, opcoesDeEspecie, opcoesDePorte } from "@/modules/cadastros/pets";

export const metadata: Metadata = { title: "Editar pet · banho-e-tosa" };

type Props = { params: Promise<{ id: string; petId: string }> };

export default async function PaginaEditarPet({ params }: Props) {
  const { id, petId } = await params;
  const pet = await naEmpresaDaDona((tx) => obterPet(tx, petId));
  if (!pet || pet.tutorId !== id) notFound();

  return (
    <main className="pagina">
      <Link href={`/clientes/${pet.tutorId}`} className="voltar">
        ‹ Voltar ao tutor
      </Link>
      <h1>Editar {pet.nome}</h1>
      <div className="cartao">
        <FormularioPet
          tutorId={pet.tutorId}
          petId={pet.id}
          especies={opcoesDeEspecie}
          portes={opcoesDePorte}
          valores={{
            nome: pet.nome,
            especie: pet.especie,
            raca: pet.raca ?? "",
            porte: pet.porte,
            observacoes: pet.observacoes ?? "",
          }}
        />
      </div>
    </main>
  );
}
