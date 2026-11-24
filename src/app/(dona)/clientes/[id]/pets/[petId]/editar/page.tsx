import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { alternarPetAtivoAcao } from "@/app/(dona)/acoes";
import { FormularioPet } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Icone } from "@/app/componentes/icone";
import { Voltar } from "@/app/componentes/voltar";
import { obterPet, opcoesDeEspecie, opcoesDePorte } from "@/modules/cadastros/pets";
import { obterTutor } from "@/modules/cadastros/tutores";

export const metadata: Metadata = { title: "Editar pet" };

type Props = { params: Promise<{ id: string; petId: string }> };

export default async function PaginaEditarPet({ params }: Props) {
  const { id, petId } = await params;
  const dados = await naEmpresaDaDona(async (tx) => {
    const pet = await obterPet(tx, petId);
    if (!pet || pet.tutorId !== id) return null;
    return { pet, tutor: await obterTutor(tx, pet.tutorId) };
  });
  if (!dados?.tutor) notFound();
  const { pet, tutor } = dados;

  return (
    <main className="pagina">
      <Voltar href={`/clientes/${pet.tutorId}`} destino={tutor.nome} />
      <h1>
        Editar {pet.nome} {!pet.ativo && <span className="etiqueta">inativo</span>}
      </h1>
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
      <section className="cartao">
        <p className="suave">
          {pet.ativo
            ? "Desativado, o pet some da busca do agendamento, mas continua no histórico. Dá para reativar depois."
            : "Este pet está desativado e não aparece no agendamento."}
        </p>
        <form action={alternarPetAtivoAcao}>
          <input type="hidden" name="petId" value={pet.id} />
          <input type="hidden" name="ativo" value={pet.ativo ? "false" : "true"} />
          {pet.ativo ? (
            <button type="submit" className="botao-perigo botao-largo">
              <Icone nome="proibido" />
              Desativar pet
            </button>
          ) : (
            <button type="submit" className="botao-secundario botao-largo">
              Reativar pet
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
