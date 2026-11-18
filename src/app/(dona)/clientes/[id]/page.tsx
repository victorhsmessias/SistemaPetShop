import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { urlDoAgendamento } from "@/app/(dona)/agenda/retorno";
import { textoDoAviso } from "@/app/(dona)/avisos";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { AvisoDeSucesso } from "@/app/componentes/aviso-de-sucesso";
import { EstadoVazio } from "@/app/componentes/estado-vazio";
import { Icone } from "@/app/componentes/icone";
import { SeloDeStatus } from "@/app/componentes/selo-status";
import { Voltar } from "@/app/componentes/voltar";
import { proximoEUltimoPorPet } from "@/modules/agenda/atendimentos";
import { hojeNoFuso, noFuso, rotuloCurtoDoDia } from "@/modules/agenda/fuso";
import { listarPetsDoTutor, NOMES_DAS_ESPECIES, NOMES_DOS_PORTES } from "@/modules/cadastros/pets";
import { formatarTelefone, linkDoWhatsApp } from "@/modules/cadastros/telefone";
import { obterTutor } from "@/modules/cadastros/tutores";
import { fusoDaEmpresa } from "@/modules/empresas/consultas";

export const metadata: Metadata = { title: "Cliente · banho-e-tosa" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ inativos?: string; salvo?: string }> };

// Ficha do cliente: telefone com WhatsApp (principal) e Ligar, e cada pet com o próximo e o último atendimento e o
// atalho para agendar. Desativar e reativar o pet ficam na edição dele, como em Serviços.
export default async function PaginaCliente({ params, searchParams }: Props) {
  const { id } = await params;
  const pedido = await searchParams;
  const comInativos = pedido.inativos === "1";
  const aviso = textoDoAviso(pedido.salvo);
  const dados = await naEmpresaDaDona(async (tx) => {
    const tutor = await obterTutor(tx, id);
    if (!tutor) return null;
    const fuso = await fusoDaEmpresa(tx);
    return {
      tutor,
      fuso,
      hoje: hojeNoFuso(fuso),
      pets: await listarPetsDoTutor(tx, id, comInativos),
      historico: await proximoEUltimoPorPet(tx, id),
    };
  });
  if (!dados) notFound();
  const { tutor, fuso, hoje, pets, historico } = dados;
  const whatsapp = linkDoWhatsApp(tutor.telefone);
  const quando = (inicio: Date) => {
    const { dia, hora } = noFuso(inicio, fuso);
    return `${dia === hoje ? "hoje" : rotuloCurtoDoDia(dia)} às ${hora}`;
  };

  return (
    <main className="pagina">
      <Voltar href="/clientes" destino="Clientes" />
      <h1>{tutor.nome}</h1>
      {aviso && <AvisoDeSucesso mensagem={aviso} parametros={["salvo"]} />}
      <section className="cartao ficha-cliente" aria-label="Contato">
        {tutor.telefone && (
          <>
            <p className="telefone-grande">
              <Icone nome="fone" />
              {formatarTelefone(tutor.telefone)}
            </p>
            <div className="acoes">
              {whatsapp && (
                <a className="botao-link botao-primario" href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <Icone nome="conversa" />
                  WhatsApp
                </a>
              )}
              <a className="botao-link botao-secundario" href={`tel:${tutor.telefone}`}>
                <Icone nome="fone" />
                Ligar
              </a>
            </div>
          </>
        )}
        {tutor.observacoes && (
          <>
            <h2 className="rotulo">Observações</h2>
            <p>{tutor.observacoes}</p>
          </>
        )}
        <Link href={`/clientes/${tutor.id}/editar`} className="botao-link botao-texto">
          <Icone nome="lapis" />
          Editar cliente
        </Link>
      </section>

      <header className="secao-cab">
        <h2>
          Pets <span className="contagem">{pets.length}</span>
        </h2>
        <Link href={`/clientes/${tutor.id}/pets/novo`} className="botao-link botao-secundario">
          <Icone nome="mais" />
          Novo pet
        </Link>
      </header>

      {pets.length === 0 ? (
        <EstadoVazio icone="pata" titulo={comInativos ? "Nenhum pet cadastrado." : "Nenhum pet ativo."} />
      ) : (
        <ul className="lista-simples" aria-label="Pets">
          {pets.map((pet) => {
            const h = historico.get(pet.id);
            return (
              <li key={pet.id} className={`cartao cartao-pet${pet.ativo ? "" : " inativo"}`}>
                <h3>
                  {pet.nome} {!pet.ativo && <span className="etiqueta">inativo</span>}
                </h3>
                <p className="suave">
                  {[
                    NOMES_DAS_ESPECIES[pet.especie as keyof typeof NOMES_DAS_ESPECIES],
                    pet.raca,
                    NOMES_DOS_PORTES[pet.porte as keyof typeof NOMES_DOS_PORTES],
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {pet.observacoes && (
                  <div className="cuidado">
                    <strong>
                      <Icone nome="alerta" />
                      Cuidados
                    </strong>
                    {pet.observacoes}
                  </div>
                )}
                {(h?.proximo || h?.ultimo) && (
                  <div className="historico">
                    {h.proximo && (
                      <p>
                        <Icone nome="agenda" />
                        <Link href={`/agenda/${h.proximo.id}`}>Próximo: {quando(h.proximo.inicio)}</Link>
                        <SeloDeStatus status={h.proximo.status} mini />
                      </p>
                    )}
                    {h.ultimo && (
                      <p>
                        <Icone nome="checkcirc" />
                        <Link href={`/agenda/${h.ultimo.id}`}>Último: {quando(h.ultimo.inicio)}</Link>
                      </p>
                    )}
                  </div>
                )}
                <div className="acoes">
                  {pet.ativo && (
                    <Link href={urlDoAgendamento({ dia: hoje, petId: pet.id })} className="botao-link botao-secundario">
                      <Icone nome="calcheck" />
                      Agendar
                    </Link>
                  )}
                  <Link href={`/clientes/${tutor.id}/pets/${pet.id}/editar`} className="botao-link botao-secundario">
                    <Icone nome="lapis" />
                    Editar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p>
        <Link
          className="alternar-inativos"
          href={comInativos ? `/clientes/${tutor.id}` : `/clientes/${tutor.id}?inativos=1`}
        >
          {comInativos ? "Mostrar só os ativos" : "Ver também os pets inativos"}
        </Link>
      </p>
    </main>
  );
}
