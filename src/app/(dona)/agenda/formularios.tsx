"use client";

import { useActionState, useState } from "react";

import {
  agendarAcao,
  concluirAcao,
  desfazerConclusaoAcao,
  editarHorarioAcao,
  editarObservacoesAcao,
  editarServicosAcao,
  mudarStatusAcao,
  type EstadoAgenda,
  type EstadoDesfazer,
} from "@/app/(dona)/agenda/acoes";
import { Campo, ErroGeral } from "@/app/(dona)/campos";
import { ACOES_DOS_STATUS, NOMES_DOS_STATUS, proximosStatus, statusAnterior, type StatusAtendimento } from "@/modules/agenda/status";
import { centavosParaTexto, formatarReais } from "@/modules/compartilhado/dinheiro";

export type OpcaoServico = { id: string; nome: string; precoCentavos: number; duracaoMin: number };

const inicial = (valores: Record<string, string> = {}, servicos: string[] = []): EstadoAgenda => ({
  erros: {},
  valores,
  servicos,
});

function BotaoEnviar({ enviando, rotulo }: { enviando: boolean; rotulo: string }) {
  return (
    <button type="submit" className="botao-primario" disabled={enviando}>
      {enviando ? "Salvando…" : rotulo}
    </button>
  );
}

/** Horário ocupado: aviso, não bloqueio. A chave do horário avisado volta no formulário para confirmar. */
function AvisoDeHorario({ estado }: { estado: EstadoAgenda }) {
  if (!estado.conflitos?.length) return null;
  return (
    <div className="mensagem mensagem-aviso" role="alert">
      <strong>Horário ocupado</strong>
      <ul className="lista-aviso">
        {estado.conflitos.map((c) => (
          <li key={c.id}>
            {c.horario} · {c.petNome} ({c.tutorNome})
          </li>
        ))}
      </ul>
      Você pode agendar mesmo assim.
      <input type="hidden" name="horarioAvisado" value={estado.horarioAvisado} />
    </div>
  );
}

/**
 * Serviços do atendimento: ao marcar, preço e duração vêm do catálogo e podem ser editados.
 * `key` no componente pai remonta a lista quando o formulário volta do servidor, com o que foi marcado.
 */
function EscolhaDeServicos({
  servicos,
  estado,
  legendaVisivel = true,
}: {
  servicos: OpcaoServico[];
  estado: EstadoAgenda;
  /** Na edição, o cartão já tem o título "Serviços": a legenda fica só para leitores de tela. */
  legendaVisivel?: boolean;
}) {
  const [marcados, setMarcados] = useState(() => new Set(estado.servicos));
  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <fieldset className="servicos" aria-describedby={estado.erros.servicos ? "erro-servicos" : undefined}>
      <legend className={legendaVisivel ? undefined : "visualmente-oculto"}>Serviços</legend>
      {servicos.length === 0 && <p className="suave">Nenhum serviço ativo. Cadastre em Serviços.</p>}
      <ul className="lista-servicos">
        {servicos.map((s) => {
          const marcado = marcados.has(s.id);
          const preco = `preco_${s.id}`;
          const duracao = `duracao_${s.id}`;
          return (
            <li key={s.id} className={marcado ? "marcado" : undefined}>
              <label className="opcao-servico">
                <input type="checkbox" name="servico" value={s.id} checked={marcado} onChange={() => alternar(s.id)} />
                <span>
                  <span className="titulo">{s.nome}</span>
                  <span className="detalhe">
                    {formatarReais(s.precoCentavos)} · {s.duracaoMin} min
                  </span>
                </span>
              </label>
              {marcado && (
                <div className="ajuste-servico">
                  <Campo
                    nome={preco}
                    rotulo={
                      <>
                        Preço<span className="visualmente-oculto"> de {s.nome}</span> (R$)
                      </>
                    }
                    erro={estado.erros[preco]}
                  >
                    {(props) => (
                      <input
                        {...props}
                        inputMode="decimal"
                        defaultValue={estado.valores[preco] ?? centavosParaTexto(s.precoCentavos)}
                        autoComplete="off"
                      />
                    )}
                  </Campo>
                  <Campo
                    nome={duracao}
                    rotulo={
                      <>
                        Duração<span className="visualmente-oculto"> de {s.nome}</span> (min)
                      </>
                    }
                    erro={estado.erros[duracao]}
                  >
                    {(props) => (
                      <input
                        {...props}
                        inputMode="numeric"
                        defaultValue={estado.valores[duracao] ?? String(s.duracaoMin)}
                        autoComplete="off"
                      />
                    )}
                  </Campo>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {estado.erros.servicos && (
        <p id="erro-servicos" className="erro-campo">
          {estado.erros.servicos}
        </p>
      )}
    </fieldset>
  );
}

export function FormularioAgendamento({
  petId,
  dia,
  hora,
  servicos,
}: {
  petId: string;
  dia: string;
  hora?: string;
  servicos: OpcaoServico[];
}) {
  const [estado, acao, enviando] = useActionState(agendarAcao, inicial({ dia, hora: hora ?? "" }));
  const v = estado.valores;

  return (
    <form action={acao} className="formulario" noValidate>
      <input type="hidden" name="petId" value={petId} />
      <ErroGeral erro={estado.erros.geral ?? estado.erros.pet} />
      <div className="campos-lado-a-lado">
        <Campo nome="dia" rotulo="Dia" erro={estado.erros.dia}>
          {(props) => <input {...props} type="date" defaultValue={v.dia} />}
        </Campo>
        <Campo nome="hora" rotulo="Hora" erro={estado.erros.hora}>
          {(props) => <input {...props} type="time" step={300} defaultValue={v.hora} />}
        </Campo>
      </div>
      <EscolhaDeServicos key={JSON.stringify(estado.servicos)} servicos={servicos} estado={estado} />
      <Campo nome="observacoes" rotulo="Observações (opcional)" erro={estado.erros.observacoes}>
        {(props) => <textarea {...props} defaultValue={v.observacoes} />}
      </Campo>
      <AvisoDeHorario estado={estado} />
      <BotaoEnviar enviando={enviando} rotulo={estado.conflitos?.length ? "Agendar mesmo assim" : "Agendar"} />
    </form>
  );
}

export function FormularioServicosDoAtendimento({
  id,
  servicos,
  escolhidos,
}: {
  id: string;
  servicos: OpcaoServico[];
  /** Itens atuais: serviço, preço e duração como estão no atendimento. */
  escolhidos: { servicoId: string; precoCentavos: number; duracaoMin: number }[];
}) {
  const valores = Object.fromEntries(
    escolhidos.flatMap((e) => [
      [`preco_${e.servicoId}`, centavosParaTexto(e.precoCentavos)],
      [`duracao_${e.servicoId}`, String(e.duracaoMin)],
    ]),
  );
  const [estado, acao, enviando] = useActionState(
    editarServicosAcao,
    inicial(
      valores,
      escolhidos.map((e) => e.servicoId),
    ),
  );

  return (
    <form action={acao} className="formulario" noValidate>
      <input type="hidden" name="id" value={id} />
      <ErroGeral erro={estado.erros.geral} />
      <EscolhaDeServicos
        key={JSON.stringify(estado.servicos)}
        servicos={servicos}
        estado={estado}
        legendaVisivel={false}
      />
      <p className="dica">O término é recalculado pela soma das durações.</p>
      <AvisoDeHorario estado={estado} />
      <BotaoEnviar enviando={enviando} rotulo={estado.conflitos?.length ? "Salvar mesmo assim" : "Salvar serviços"} />
    </form>
  );
}

function deslocarHora(hora: string, minutos: number): string {
  const total = Math.min(Math.max(Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + minutos, 0), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const ehHoraCompleta = (valor: string) => /^\d{2}:\d{2}$/.test(valor);

/** Dia, início e término. Mudar o início leva o término junto, para manter a duração. */
export function FormularioHorario({
  id,
  dia,
  hora,
  termino,
}: {
  id: string;
  dia: string;
  hora: string;
  termino: string;
}) {
  const [estado, acao, enviando] = useActionState(editarHorarioAcao, inicial({ dia, hora, termino }));
  const [inicio, setInicio] = useState(estado.valores.hora ?? hora);
  const [fim, setFim] = useState(estado.valores.termino ?? termino);

  const mudarInicio = (novo: string) => {
    if (ehHoraCompleta(novo) && ehHoraCompleta(inicio) && ehHoraCompleta(fim)) {
      const diferenca =
        Number(novo.slice(0, 2)) * 60 + Number(novo.slice(3, 5)) - (Number(inicio.slice(0, 2)) * 60 + Number(inicio.slice(3, 5)));
      setFim(deslocarHora(fim, diferenca));
    }
    setInicio(novo);
  };

  return (
    <form action={acao} className="formulario" noValidate>
      <input type="hidden" name="id" value={id} />
      <ErroGeral erro={estado.erros.geral} />
      <Campo nome="dia" rotulo="Dia" erro={estado.erros.dia}>
        {(props) => <input {...props} type="date" defaultValue={estado.valores.dia} />}
      </Campo>
      <div className="campos-lado-a-lado">
        <Campo nome="hora" rotulo="Início" erro={estado.erros.hora}>
          {(props) => (
            <input {...props} type="time" step={300} value={inicio} onChange={(e) => mudarInicio(e.target.value)} />
          )}
        </Campo>
        <Campo nome="termino" rotulo="Término" erro={estado.erros.termino}>
          {(props) => <input {...props} type="time" step={300} value={fim} onChange={(e) => setFim(e.target.value)} />}
        </Campo>
      </div>
      <AvisoDeHorario estado={estado} />
      <BotaoEnviar enviando={enviando} rotulo={estado.conflitos?.length ? "Salvar mesmo assim" : "Salvar horário"} />
    </form>
  );
}

export function FormularioObservacoes({ id, observacoes }: { id: string; observacoes: string }) {
  const [estado, acao, enviando] = useActionState(editarObservacoesAcao, inicial({ observacoes }));
  return (
    <form action={acao} className="formulario" noValidate>
      <input type="hidden" name="id" value={id} />
      <ErroGeral erro={estado.erros.geral} />
      <Campo nome="observacoes" rotulo="Observações do atendimento" erro={estado.erros.observacoes}>
        {(props) => <textarea {...props} defaultValue={estado.valores.observacoes} />}
      </Campo>
      <BotaoEnviar enviando={enviando} rotulo="Salvar observações" />
    </form>
  );
}

/**
 * Botões de status: um formulário só, e cada botão envia o `para` dele. `de` é o status que a tela mostra,
 * para um toque duplo ou uma página desatualizada não aplicar a mudança errada.
 */
export function BotoesDeStatus({
  id,
  status,
  confirmado,
}: {
  id: string;
  status: StatusAtendimento;
  /** confirmado_em preenchido: decide para onde o desfazer volta. */
  confirmado: boolean;
}) {
  const [estado, acao, enviando] = useActionState(mudarStatusAcao, {});
  const proximos = proximosStatus(status);
  const principais = proximos.filter((p) => p !== "cancelado" && p !== "faltou");
  const encerrar = proximos.filter((p) => p === "cancelado" || p === "faltou");
  const anterior = statusAnterior(status, confirmado ? new Date() : null);
  const reabrir = status === "cancelado" || status === "faltou";

  return (
    <form action={acao} className="formulario">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="de" value={status} />
      <ErroGeral erro={estado.erro} />
      {principais.map((para, i) => (
        <button
          key={para}
          type="submit"
          name="para"
          value={para}
          className={i === 0 ? "botao-primario" : "botao-secundario"}
          disabled={enviando}
        >
          {ACOES_DOS_STATUS[para]}
        </button>
      ))}
      {encerrar.length > 0 && (
        <div className="acoes">
          {encerrar.map((para) => (
            <button key={para} type="submit" name="para" value={para} className="botao-secundario" disabled={enviando}>
              {ACOES_DOS_STATUS[para]}
            </button>
          ))}
        </div>
      )}
      {anterior && (
        <button type="submit" name="para" value={anterior} className="botao-secundario botao-desfazer" disabled={enviando}>
          {reabrir ? `Reabrir como ${NOMES_DOS_STATUS[anterior]}` : `Desfazer: voltar para ${NOMES_DOS_STATUS[anterior]}`}
        </button>
      )}
    </form>
  );
}

export type OpcaoFormaPagamento = { id: string; nome: string };

/**
 * Concluir (H7): o botão mostra o total; ao tocar, aparecem as formas de pagamento, e um toque numa delas
 * conclui. Com total zero, um botão só conclui sem cobrança. `de` e `total` são o que a tela mostra: se
 * mudaram, o servidor não grava nada. Os botões ficam desabilitados enquanto envia (toque duplo).
 */
export function FormularioConcluir({
  id,
  status,
  totalCentavos,
  formas,
}: {
  id: string;
  status: StatusAtendimento;
  totalCentavos: number;
  formas: OpcaoFormaPagamento[];
}) {
  const [estado, acao, enviando] = useActionState(concluirAcao, {});
  const [escolhendo, setEscolhendo] = useState(false);
  const total = formatarReais(totalCentavos);

  return (
    <form action={acao} className="formulario" noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="de" value={status} />
      <input type="hidden" name="total" value={totalCentavos} />
      <ErroGeral erro={estado.erro} />
      {totalCentavos === 0 ? (
        <>
          <p className="suave">O total é {total}: o atendimento é concluído sem receita.</p>
          <button type="submit" className="botao-primario" disabled={enviando}>
            {enviando ? "Concluindo…" : "Concluir sem cobrança"}
          </button>
        </>
      ) : !escolhendo ? (
        <button type="button" className="botao-primario" onClick={() => setEscolhendo(true)}>
          Concluir · {total}
        </button>
      ) : (
        <fieldset className="formas-pagamento" disabled={enviando}>
          <legend>
            Recebido {total} em:
          </legend>
          {formas.length === 0 && <p className="suave">Nenhuma forma de pagamento ativa.</p>}
          <div className="formas-pagamento-opcoes">
            {formas.map((f) => (
              <button key={f.id} type="submit" name="formaPagamentoId" value={f.id} className="botao-primario">
                {f.nome}
              </button>
            ))}
          </div>
          <button type="button" className="botao-secundario" onClick={() => setEscolhendo(false)}>
            Voltar
          </button>
        </fieldset>
      )}
    </form>
  );
}

/**
 * Desfazer a conclusão: volta ao status de antes e cancela a receita, com o motivo (obrigatório quando há
 * receita). O motivo digitado volta com o erro.
 */
export function FormularioDesfazerConclusao({ id, temReceita }: { id: string; temReceita: boolean }) {
  const [estado, acao, enviando] = useActionState(desfazerConclusaoAcao, { erros: {}, motivo: "" } as EstadoDesfazer);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className="botao-secundario botao-largo" onClick={() => setAberto(true)}>
        Desfazer conclusão
      </button>
    );
  }
  return (
    <form action={acao} className="formulario" noValidate>
      <input type="hidden" name="id" value={id} />
      <ErroGeral erro={estado.erros.geral} />
      {temReceita && (
        <Campo
          nome="motivo"
          rotulo="Motivo (fica no cancelamento da receita)"
          erro={estado.erros.motivo}
        >
          {(props) => <textarea {...props} defaultValue={estado.motivo} maxLength={500} />}
        </Campo>
      )}
      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Desfazendo…" : temReceita ? "Desfazer e cancelar a receita" : "Desfazer conclusão"}
      </button>
      <button type="button" className="botao-secundario" onClick={() => setAberto(false)} disabled={enviando}>
        Voltar
      </button>
    </form>
  );
}
