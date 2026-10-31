import type { ReactNode } from "react";

// Peças dos formulários da dona. Validação no servidor: os formulários usam noValidate, e as
// mensagens em português vêm das Server Actions.

type PropsCampo = {
  nome: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  children: (props: { id: string; name: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
};

export function Campo({ nome, rotulo, erro, dica, children }: PropsCampo) {
  const id = `campo-${nome}`;
  const descricoes = [erro ? `${id}-erro` : null, dica ? `${id}-dica` : null].filter(Boolean).join(" ");
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      {children({
        id,
        name: nome,
        ...(erro ? { "aria-invalid": true as const } : {}),
        ...(descricoes ? { "aria-describedby": descricoes } : {}),
      })}
      {dica && (
        <span id={`${id}-dica`} className="dica">
          {dica}
        </span>
      )}
      {erro && (
        <p id={`${id}-erro`} className="erro-campo">
          {erro}
        </p>
      )}
    </div>
  );
}

export function ErroGeral({ erro }: { erro?: string }) {
  if (!erro) return null;
  return (
    <p className="mensagem mensagem-erro" role="alert">
      {erro}
    </p>
  );
}
