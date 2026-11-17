import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AvisoDaPagina, ComAvisoDaPagina } from "@/app/(dona)/agenda/aviso-da-pagina";
import { FormularioHorario, FormularioObservacoes, FormularioServicosDoAtendimento } from "@/app/(dona)/agenda/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { obterAtendimento } from "@/modules/agenda/atendimentos";
import { noFuso } from "@/modules/agenda/fuso";
import { atendimentoAtivo, NOMES_DOS_STATUS } from "@/modules/agenda/status";
import { listarServicos } from "@/modules/catalogo/servicos";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";

export const metadata: Metadata = { title: "Editar atendimento · banho-e-tosa" };

type Props = { params: Promise<{ id: string }> };

// Serviços e horário só mudam com o atendimento ativo; observações, sempre.
export default async function PaginaEditarAtendimento({ params }: Props) {
  const { id } = await params;
  const dados = await naEmpresaDaDona(async (tx) => {
    const atendimento = await obterAtendimento(tx, id);
    if (!atendimento) return null;
    return { atendimento, fuso: await fusoDaEmpresa(tx), servicos: await listarServicos(tx, true) };
  });
  if (!dados) notFound();
  const { atendimento: a, fuso } = dados;
  const ativo = atendimentoAtivo(a.status);
  const inicio = noFuso(a.inicio, fuso);
  // Serviços ativos e os que o atendimento já tem (mesmo desativados depois).
  const noAtendimento = new Set(a.itens.map((i) => i.servicoId));
  const opcoes = dados.servicos
    .filter((s) => s.ativo || noAtendimento.has(s.id))
    .map((s) => ({ id: s.id, nome: s.nome, precoCentavos: s.precoCentavos, duracaoMin: s.duracaoMin }));

  return (
    <main className="pagina">
      <ComAvisoDaPagina>
        <Link href={`/agenda/${a.id}`} className="voltar">
          ‹ {a.pet.nome}
        </Link>
        <h1>Editar atendimento</h1>
        <AvisoDaPagina />

        {ativo ? (
          <>
            <section className="cartao">
              <h2>Horário</h2>
              <FormularioHorario id={a.id} dia={inicio.dia} hora={inicio.hora} termino={noFuso(a.fim, fuso).hora} />
            </section>
            <section className="cartao">
              <h2>Serviços</h2>
              <FormularioServicosDoAtendimento id={a.id} servicos={opcoes} escolhidos={a.itens} />
            </section>
          </>
        ) : (
          <p className="mensagem mensagem-aviso">
            Atendimento &quot;{NOMES_DOS_STATUS[a.status]}&quot;: serviços e horário não mudam. Reabra-o se foi engano.
          </p>
        )}

        <section className="cartao">
          <h2>Observações</h2>
          <FormularioObservacoes id={a.id} observacoes={a.observacoes ?? ""} />
        </section>
      </ComAvisoDaPagina>
    </main>
  );
}
