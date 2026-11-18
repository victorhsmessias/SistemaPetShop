import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AvisoDaPagina, ComAvisoDaPagina } from "@/app/(dona)/agenda/aviso-da-pagina";
import { BotoesDeStatus, FormularioConcluir, FormularioDesfazerConclusao } from "@/app/(dona)/agenda/formularios";
import { urlDoDia } from "@/app/(dona)/agenda/retorno";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Voltar } from "@/app/componentes/voltar";
import { SeloDeStatus } from "@/app/componentes/selo-status";
import { obterAtendimento } from "@/modules/agenda/atendimentos";
import { somarItens } from "@/modules/agenda/calculos";
import { noFuso, rotuloDoDia } from "@/modules/agenda/fuso";
import { atendimentoAtivo } from "@/modules/agenda/status";
import { formatarTelefone } from "@/modules/cadastros/telefone";
import { formatarReais } from "@/modules/compartilhado/dinheiro";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";
import { listarFormasAtivas, receitaDoAtendimento } from "@/modules/financeiro/lancamentos";

export const metadata: Metadata = { title: "Atendimento · banho-e-tosa" };

type Props = { params: Promise<{ id: string }> };

// Acompanhar o atendimento (H7): status, desfazer um toque errado, cancelar, concluir com a forma de pagamento,
// a receita do atendimento concluído e desfazer a conclusão, e o acesso à edição.
export default async function PaginaAtendimento({ params }: Props) {
  const { id } = await params;
  const dados = await naEmpresaDaDona(async (tx) => {
    const atendimento = await obterAtendimento(tx, id);
    if (!atendimento) return null;
    const concluido = atendimento.status === "concluido";
    return {
      atendimento,
      fuso: await fusoDaEmpresa(tx),
      formas: atendimentoAtivo(atendimento.status) ? await listarFormasAtivas(tx) : [],
      receita: concluido ? await receitaDoAtendimento(tx, atendimento.id) : null,
    };
  });
  if (!dados) notFound();
  const { atendimento: a, fuso, formas, receita } = dados;
  const inicio = noFuso(a.inicio, fuso);
  const fim = noFuso(a.fim, fuso);
  const total = somarItens(a.itens);

  return (
    <main className="pagina">
      <ComAvisoDaPagina>
        <Voltar href={urlDoDia(inicio.dia)} destino="Agenda" />
        <header className="topo">
          <h1>{a.pet.nome}</h1>
          {/* role="status": o leitor de tela anuncia a mudança. O nome acessível diz o que o selo é e o status. */}
          <SeloDeStatus status={a.status} anunciar />
        </header>
        <AvisoDaPagina />
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

        {atendimentoAtivo(a.status) && (
          <section className="cartao" aria-label="Concluir o atendimento">
            <FormularioConcluir id={a.id} status={a.status} totalCentavos={total} formas={formas} />
          </section>
        )}

        {a.status === "concluido" ? (
          <section className="cartao" aria-labelledby="titulo-receita">
            <h2 id="titulo-receita">Receita</h2>
            {receita ? (
              <dl className="dados-receita">
                <div>
                  <dt>Valor</dt>
                  <dd>{formatarReais(receita.valorCentavos)}</dd>
                </div>
                <div>
                  <dt>Forma</dt>
                  <dd>{receita.forma ?? "—"}</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>{rotuloDoDia(receita.data)}</dd>
                </div>
              </dl>
            ) : (
              <p className="suave">Concluído sem receita: o total era {formatarReais(total)}.</p>
            )}
            <FormularioDesfazerConclusao id={a.id} temReceita={receita !== null} />
          </section>
        ) : (
          <section className="cartao" aria-label="Status do atendimento">
            <BotoesDeStatus id={a.id} status={a.status} confirmado={a.confirmadoEm !== null} />
          </section>
        )}
      </ComAvisoDaPagina>
    </main>
  );
}
