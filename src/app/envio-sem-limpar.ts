"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Envia o formulário para a ação do `useActionState` sem o React limpar os campos depois.
 *
 * Com `<form action={acao}>`, o React 19 recoloca cada campo no valor inicial (`defaultValue`) quando a ação
 * termina. Isso apagava o painel inteiro quando voltava um erro (B2) e o que a dona digitava enquanto o formulário
 * enviava (B8). Aqui o envio vai pelo `onSubmit`, numa transição: o `isPending` funciona igual, e os campos ficam
 * com o que está na tela. O `action` continua no `<form>` para o envio antes de o JavaScript carregar; com o
 * `preventDefault`, o React não roda a ação de novo nem limpa o formulário.
 *
 *   <form action={acao} onSubmit={enviarSemLimpar(acao)} noValidate>
 */
export function enviarSemLimpar(acao: (dados: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget, (evento.nativeEvent as SubmitEvent).submitter);
    startTransition(() => acao(dados));
  };
}
