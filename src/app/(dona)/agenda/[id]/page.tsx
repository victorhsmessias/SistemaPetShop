import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AvisoDaPagina, ComAvisoDaPagina } from "@/app/(dona)/agenda/aviso-da-pagina";
import {
  BotoesDeStatus,
  DesfazerStatus,
  FormularioConcluir,
  FormularioDesfazerConclusao,
} from "@/app/(dona)/agenda/formularios";
import { urlDoDia } from "@/app/(dona)/agenda/retorno";
import { iniciais } from "@/app/(dona)/conta";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Icone } from "@/app/componentes/icone";
import { SeloDeStatus } from "@/app/componentes/selo-status";
import { Voltar } from "@/app/componentes/voltar";
import { listarAgenda, obterAtendimento } from "@/modules/agenda/atendimentos";
import { somarItens } from "@/modules/agenda/calculos";
import { noFuso, rotuloCurtoDoDia, rotuloDoDia } from "@/modules/agenda/fuso";
import { atendimentoAtivo } from "@/modules/agenda/status";
import { formatarTelefone, linkDoWhatsApp } from "@/modules/cadastros/telefone";
import { formatarReais } from "@/modules/compartilhado/dinheiro";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";
import { listarFormasAtivas, receitaDoAtendimento } from "@/modules/financeiro/lancamentos";

export const metadata: Metadata = { title: "Atendimento · banho-e-tosa" };

type Props = { params: Promise<{ id: string }> };

// Acompanhar o atendimento (H7): status, desfazer um toque errado, cancelar, concluir com a forma de pagamento,
// a receita do atendimento concluído e desfazer a conclusão, e o acesso à edição. A ação principal (Concluir) fica
// na barra do rodapé, ao alcance do polegar. A partir de 1024 px, a lista do dia fica ao lado (mestre-detalhe).
export default async function PaginaAtendimento({ params }: Props) {
  const { id } = await params;
  const dados = await naEmpresaDaDona(async (tx) => {
    const atendimento = await obterAtendimento(tx, id);
    if (!atendimento) return null;
    const fuso = await fusoDaEmpresa(tx);
    const concluido = atendimento.status === "concluido";
    return {
      atendimento,
      fuso,
      doDia: (await listarAgenda(tx, noFuso(atendimento.inicio, fuso).dia)).atendimentos,
      formas: atendimentoAtivo(atendimento.status) ? await listarFormasAtivas(tx) : [],
      receita: concluido ? await receitaDoAtendimento(tx, atendimento.id) : null,
    };
  });
  if (!dados) notFound();
  const { atendimento: a, fuso, doDia, formas, receita } = dados;
  const inicio = noFuso(a.inicio, fuso);
  const fim = noFuso(a.fim, fuso);
  const total = somarItens(a.itens);
  const ativo = atendimentoAtivo(a.status);
  const whatsapp = linkDoWhatsApp(a.tutor.telefone);

  return (
    <main className={`pagina pagina-larga pagina-atendimento${ativo ? " com-barra-de-acao" : ""}`}>
      <ComAvisoDaPagina>
        <div className="mestre-detalhe">
          {/* Lista do dia, só no desktop: hora, pet e selo, sem repetir o horário completo nem os títulos do detalhe. */}
          <nav className="lista-do-dia" aria-label={`Atendimentos de ${rotuloCurtoDoDia(inicio.dia)}`}>
            <p className="rotulo">{rotuloDoDia(inicio.dia)}</p>
            <ul>
              {doDia.map((d) => (
                <li key={d.id}>
                  <Link href={`/agenda/${d.id}`} aria-current={d.id === a.id ? "page" : undefined}>
                    <span className="lista-do-dia-hora">{noFuso(d.inicio, fuso).hora}</span>
                    <span className="lista-do-dia-pet">{d.pet.nome}</span>
                    <SeloDeStatus status={d.status} mini />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="detalhe">
            <Voltar href={urlDoDia(inicio.dia)} destino="Agenda" />
            <header className="topo">
              <h1>{a.pet.nome}</h1>
              {/* role="status": o leitor de tela anuncia a mudança. O nome acessível diz o que o selo é e o status. */}
              <SeloDeStatus status={a.status} anunciar />
            </header>
            <AvisoDaPagina />
            <p className="quando">
              {rotuloDoDia(inicio.dia)} · {inicio.hora}–{fim.hora}
              {fim.dia !== inicio.dia ? ` (termina em ${rotuloDoDia(fim.dia)})` : ""}
            </p>
            {ativo && <DesfazerStatus id={a.id} status={a.status} confirmado={a.confirmadoEm !== null} />}

            <section className="cartao cartao-cliente" aria-label="Cliente">
              <div className="cliente-linha">
                <span className="avatar" aria-hidden="true">
                  {iniciais(a.tutor.nome)}
                </span>
                <span className="cliente-nome">
                  <Link href={`/clientes/${a.tutor.id}`}>{a.tutor.nome}</Link>
                  {a.tutor.telefone && <span className="suave">{formatarTelefone(a.tutor.telefone)}</span>}
                </span>
                {!a.pet.ativo && <span className="etiqueta">pet inativo</span>}
              </div>
              {a.tutor.telefone && (
                <div className="acoes">
                  {whatsapp && (
                    <a className="botao-link botao-secundario" href={whatsapp} target="_blank" rel="noopener noreferrer">
                      <Icone nome="conversa" />
                      WhatsApp
                    </a>
                  )}
                  <a className="botao-link botao-secundario" href={`tel:${a.tutor.telefone}`}>
                    <Icone nome="fone" />
                    Ligar
                  </a>
                </div>
              )}
              {a.pet.observacoes && (
                <div className="cuidado">
                  <strong>
                    <Icone nome="alerta" />
                    Cuidados
                  </strong>
                  {a.pet.observacoes}
                </div>
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
              {a.observacoes && (
                <>
                  <h3 className="rotulo">Observações</h3>
                  <p>{a.observacoes}</p>
                </>
              )}
              <Link href={`/agenda/${a.id}/editar`} className="botao-link botao-secundario botao-largo">
                <Icone nome="lapis" />
                {ativo ? "Editar serviços, horário e observações" : "Editar observações"}
              </Link>
            </section>

            {a.status === "concluido" && (
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
            )}

            {(a.status === "cancelado" || a.status === "faltou") && (
              <section className="cartao" aria-label="Status do atendimento">
                <DesfazerStatus id={a.id} status={a.status} confirmado={a.confirmadoEm !== null} />
              </section>
            )}

            {ativo && (
              <div className="barra-acao">
                <BotoesDeStatus id={a.id} status={a.status} />
                <section className="barra-acao-principal" aria-label="Concluir o atendimento">
                  <FormularioConcluir id={a.id} status={a.status} totalCentavos={total} formas={formas} />
                </section>
              </div>
            )}
          </div>
        </div>
      </ComAvisoDaPagina>
    </main>
  );
}
