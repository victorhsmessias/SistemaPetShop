"use client";

import { createContext, use, useActionState, useState, type ReactNode } from "react";

import { ErroGeral } from "@/app/(dona)/campos";

// Aviso de recusa por estado (o atendimento mudou em outra tela ou num toque repetido). A ação chama refresh() e a
// página volta já com o estado atual (B1), o que pode trocar a seção do formulário que enviou: Concluir vira Receita,
// os botões de status somem com a conclusão, e a edição de serviços e horário vira o aviso de atendimento encerrado.
// Um aviso guardado no formulário sumiria com ele; por isso fica aqui, acima das seções.

type Aviso = { aviso?: string; publicar: (aviso: string | undefined) => void };

const Contexto = createContext<Aviso>({ publicar: () => {} });

/** Envolve a página: guarda o aviso enquanto a página está aberta (o refresh não a desmonta). */
export function ComAvisoDaPagina({ children }: { children: ReactNode }) {
  const [aviso, publicar] = useState<string>();
  return <Contexto value={{ aviso, publicar }}>{children}</Contexto>;
}

/** Onde o aviso aparece na página, fora das seções que o refresh pode trocar. */
export function AvisoDaPagina() {
  return <ErroGeral erro={use(Contexto).aviso} />;
}

/**
 * `useActionState` que publica o `aviso` da resposta na página (e o apaga quando a ação passa). Os erros de campo
 * continuam no estado do formulário.
 *
 * Custo aceito (revisão do PR #4): a ação passada ao `useActionState` é uma função do cliente que embrulha a Server
 * Action, e não a Server Action em si. Por isso, sem JavaScript, estes formulários (status, concluir, desfazer a
 * conclusão, horário e serviços) não enviam mais; antes enviavam. Aceito porque o React guarda o envio feito
 * enquanto o JavaScript carrega e o repete depois da hidratação, e a piloto usa o app instalado no iPhone.
 */
export function useAcaoComAviso<E extends { aviso?: string }>(
  acao: (anterior: E, dados: FormData) => Promise<E>,
  inicial: E,
) {
  const { publicar } = use(Contexto);
  return useActionState<E, FormData>(async (anterior, dados) => {
    const estado = await acao(anterior as E, dados);
    publicar(estado.aviso);
    return estado;
  }, inicial as Awaited<E>);
}
