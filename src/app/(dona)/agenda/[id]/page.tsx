import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BotoesDeStatus } from "@/app/(dona)/agenda/formularios";
import { urlDoDia } from "@/app/(dona)/agenda/retorno";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { obterAtendimento } from "@/modules/agenda/atendimentos";
import { noFuso, rotuloDoDia } from "@/modules/agenda/fuso";
import { atendimentoAtivo, NOMES_DOS_STATUS } from "@/modules/agenda/status";
import { formatarTelefone } from "@/modules/cadastros/telefone";
import { formatarReais } from "@/modules/compartilhado/dinheiro";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";

export const metadata: Metadata = { title: "Atendimento · banho-e-tosa" };

type Props = { params: Promise<{ id: string }> };

// Acompanhar o atendimento (H7): status, desfazer um toque errado, cancelar, e o acesso à edição.
export default async function PaginaAtendimento({ params }: Props) {
  const { id } = await params;
  const dados = await naEmpresaDaDona(async (tx) => {
    const atendimento = await obterAtendimento(tx, id);
    return atendimento ? { atendimento, fuso: await fusoDaEmpresa(tx) } : null;
  });
  if (!dados) notFound();
  const { atendimento: a, fuso } = dados;
  const inicio = noFuso(a.inicio, fuso);
  const fim = noFuso(a.fim, fuso);
  const total = a.itens.reduce((soma, i) => soma + i.precoCentavos, 0);

  return (
    <main className="pagina">
      <Link href={urlDoDia(inicio.dia)} className="voltar">
        ‹ Agenda
      </Link>
      <header className="topo">
        <h1>{a.pet.nome}</h1>
        <span className={`etiqueta etiqueta-status status-${a.status}`}>{NOMES_DOS_STATUS[a.status]}</span>
      </header>
      <p>
        {rotuloDoDia(inicio.dia)} · {inicio.hora}–{fim.hora}
        {fim.dia !== inicio.dia ? ` (termina em ${rotuloDoDia(fim.dia)})` : ""}
      </p>

      <section className="cartao">
        <p>
          <Link href={`/clientes/${a.tutor.id}`} className="link-de-toque">
            {a.tutor.nome}
          </Link>
          {!a.pet.ativo && <span className="etiqueta"> pet inativo</span>}
        </p>
        {a.tutor.telefone && (
          <p>
            <a className="link-de-toque" href={`tel:${a.tutor.telefone}`}>
              {formatarTelefone(a.tutor.telefone)}
            </a>
          </p>
        )}
        {a.pet.observacoes && (
          <p className="cuidado">
            <strong>Cuidados</strong>
            {a.pet.observacoes}
          </p>
        )}
      </section>

      <section className="cartao">
        <h2>Serviços</h2>
        <ul className="lista-itens" aria-label="Serviços do atendimento">
          {a.itens.map((i) => (
            <li key={i.id}>
              <span>{i.descricao}</span>
              <span className="suave">
                {formatarReais(i.precoCentavos)} · {i.duracaoMin} min
              </span>
            </li>
          ))}
        </ul>
        <p className="total">Total: {formatarReais(total)}</p>
        {a.observacoes && <p className="suave">{a.observacoes}</p>}
        <Link href={`/agenda/${a.id}/editar`} className="botao-link botao-secundario botao-largo">
          {atendimentoAtivo(a.status) ? "Editar serviços, horário e observações" : "Editar observações"}
        </Link>
      </section>

      <section className="cartao" aria-label="Status do atendimento">
        <BotoesDeStatus id={a.id} status={a.status} confirmado={a.confirmadoEm !== null} />
      </section>
    </main>
  );
}
