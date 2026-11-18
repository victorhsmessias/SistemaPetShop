"use client";

import Link from "next/link";
import { useActionState } from "react";

import { salvarPetAcao, salvarServicoAcao, salvarTutorAcao, type EstadoCadastro } from "@/app/(dona)/acoes";
import { Campo, DICA_OBSERVACOES, ErroGeral } from "@/app/(dona)/campos";
import { Icone } from "@/app/componentes/icone";
import { Segmentado } from "@/app/componentes/segmentado";
import { enviarSemLimpar } from "@/app/envio-sem-limpar";

type Valores = Record<string, string>;

/** Estado inicial com os valores atuais do registro (edição) ou vazio (cadastro). */
const inicial = (valores: Valores = {}): EstadoCadastro => ({ erros: {}, valores });

/** Salvar no rodapé: a barra acompanha a rolagem enquanto o formulário está na tela, ao alcance do polegar. */
function BotaoSalvar({ enviando, rotulo }: { enviando: boolean; rotulo: string }) {
  return (
    <div className="barra-salvar">
      <button type="submit" className="botao-primario botao-grande" disabled={enviando}>
        {enviando ? "Salvando…" : rotulo}
      </button>
    </div>
  );
}

/** `agendar`: dia e hora do agendamento para onde a dona volta depois do cadastro (agenda/retorno.ts). */
export function FormularioTutor({ id, valores, agendar }: { id?: string; valores?: Valores; agendar?: string }) {
  const [estado, acao, enviando] = useActionState(salvarTutorAcao, inicial(valores));
  const v = estado.valores;

  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="formulario" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      {agendar && <input type="hidden" name="agendar" value={agendar} />}
      <ErroGeral erro={estado.erros.geral} />
      <Campo nome="nome" rotulo="Nome do tutor" erro={estado.erros.nome}>
        {(props) => <input {...props} defaultValue={v.nome} autoComplete="off" autoCapitalize="words" />}
      </Campo>
      <Campo nome="telefone" rotulo="Telefone (WhatsApp)" erro={estado.erros.telefone} dica="Com DDD, por exemplo (11) 98765-4321.">
        {(props) => <input {...props} type="tel" inputMode="tel" defaultValue={v.telefone} autoComplete="off" />}
      </Campo>
      {estado.tutorExistenteId && (
        <Link href={`/clientes/${estado.tutorExistenteId}`} className="botao-link botao-secundario">
          <Icone nome="clientes" />
          Abrir o cliente já cadastrado
        </Link>
      )}
      <Campo nome="observacoes" rotulo="Observações" erro={estado.erros.observacoes} dica={DICA_OBSERVACOES}>
        {(props) => <textarea {...props} defaultValue={v.observacoes} />}
      </Campo>
      <BotaoSalvar enviando={enviando} rotulo={id ? "Salvar alterações" : "Salvar cliente"} />
    </form>
  );
}

type OpcaoPet = { valor: string; nome: string };

export function FormularioPet({
  tutorId,
  petId,
  valores,
  especies,
  portes,
  agendar,
}: {
  tutorId: string;
  agendar?: string;
  petId?: string;
  valores?: Valores;
  especies: OpcaoPet[];
  portes: OpcaoPet[];
}) {
  const [estado, acao, enviando] = useActionState(salvarPetAcao, inicial({ especie: "cao", ...valores }));
  const v = estado.valores;

  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="formulario" noValidate>
      <input type="hidden" name="tutorId" value={tutorId} />
      {petId && <input type="hidden" name="petId" value={petId} />}
      {agendar && <input type="hidden" name="agendar" value={agendar} />}
      <ErroGeral erro={estado.erros.geral} />
      <Campo nome="nome" rotulo="Nome do pet" erro={estado.erros.nome}>
        {(props) => <input {...props} defaultValue={v.nome} autoComplete="off" autoCapitalize="words" />}
      </Campo>
      <Segmentado nome="especie" rotulo="Espécie" opcoes={especies} valor={v.especie} erro={estado.erros.especie} />
      <Segmentado
        nome="porte"
        rotulo="Porte"
        opcoes={portes.map((opcao) => ({ ...opcao, curto: opcao.valor }))}
        valor={v.porte}
        erro={estado.erros.porte}
      />
      <Campo nome="raca" rotulo="Raça (opcional)" erro={estado.erros.raca}>
        {(props) => <input {...props} defaultValue={v.raca} autoComplete="off" autoCapitalize="words" />}
      </Campo>
      <Campo
        nome="observacoes"
        rotulo="Cuidados: comportamento e alergias"
        erro={estado.erros.observacoes}
        dica={`Aparece em destaque na ficha do pet. ${DICA_OBSERVACOES}`}
      >
        {(props) => <textarea {...props} defaultValue={v.observacoes} />}
      </Campo>
      <BotaoSalvar enviando={enviando} rotulo={petId ? "Salvar alterações" : "Salvar pet"} />
    </form>
  );
}

export function FormularioServico({ id, valores }: { id?: string; valores?: Valores }) {
  const [estado, acao, enviando] = useActionState(salvarServicoAcao, inicial(valores));
  const v = estado.valores;

  return (
    <form action={acao} onSubmit={enviarSemLimpar(acao)} className="formulario" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      <ErroGeral erro={estado.erros.geral} />
      <Campo nome="nome" rotulo="Nome do serviço" erro={estado.erros.nome}>
        {(props) => <input {...props} defaultValue={v.nome} autoComplete="off" autoCapitalize="sentences" />}
      </Campo>
      <Campo nome="preco" rotulo="Preço (R$)" erro={estado.erros.preco} dica="Por exemplo 45,00.">
        {(props) => <input {...props} inputMode="decimal" defaultValue={v.preco} autoComplete="off" />}
      </Campo>
      <Campo nome="duracao" rotulo="Duração (minutos)" erro={estado.erros.duracao}>
        {(props) => <input {...props} inputMode="numeric" defaultValue={v.duracao} autoComplete="off" />}
      </Campo>
      <BotaoSalvar enviando={enviando} rotulo={id ? "Salvar alterações" : "Salvar serviço"} />
    </form>
  );
}
