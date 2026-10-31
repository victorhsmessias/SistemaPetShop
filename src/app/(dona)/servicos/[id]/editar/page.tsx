import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { alternarServicoAtivoAcao } from "@/app/(dona)/acoes";
import { FormularioServico } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { obterServico } from "@/modules/catalogo/servicos";
import { centavosParaTexto } from "@/modules/compartilhado/dinheiro";

export const metadata: Metadata = { title: "Editar serviço · banho-e-tosa" };

type Props = { params: Promise<{ id: string }> };

export default async function PaginaEditarServico({ params }: Props) {
  const { id } = await params;
  const servico = await naEmpresaDaDona((tx) => obterServico(tx, id));
  if (!servico) notFound();

  return (
    <main className="pagina">
      <Link href="/servicos" className="voltar">
        ‹ Serviços
      </Link>
      <h1>
        Editar serviço {!servico.ativo && <span className="etiqueta">inativo</span>}
      </h1>
      <div className="cartao">
        <FormularioServico
          id={servico.id}
          valores={{
            nome: servico.nome,
            preco: centavosParaTexto(servico.precoCentavos),
            duracao: String(servico.duracaoMin),
          }}
        />
      </div>
      <section className="cartao">
        <p className="suave">
          {servico.ativo
            ? "Desativado, o serviço some do agendamento, mas continua no histórico dos atendimentos."
            : "Este serviço está desativado e não aparece no agendamento."}
        </p>
        <form action={alternarServicoAtivoAcao}>
          <input type="hidden" name="id" value={servico.id} />
          <input type="hidden" name="ativo" value={servico.ativo ? "false" : "true"} />
          <button type="submit" className="botao-secundario" style={{ width: "100%" }}>
            {servico.ativo ? "Desativar serviço" : "Reativar serviço"}
          </button>
        </form>
      </section>
    </main>
  );
}
