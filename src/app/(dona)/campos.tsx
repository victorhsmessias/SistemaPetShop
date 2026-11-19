import type { ReactNode } from "react";

import { Aviso } from "@/app/componentes/aviso";
import { Icone } from "@/app/componentes/icone";

// Peças dos formulários da dona. Validação no servidor: os formulários usam noValidate, e as
// mensagens em português vêm das Server Actions.

/**
 * Ajuda dos campos de observações (tutor, pet e atendimento): o texto livre é para o serviço. Documentos e dados
 * sensíveis do tutor não pertencem a ele (LGPD; e as observações do atendimento ficam copiadas na auditoria).
 */
export const DICA_OBSERVACOES = "Só o que ajuda no atendimento. Não registre documentos nem dados sensíveis do tutor.";

type PropsCampo = {
  nome: string;
  rotulo: ReactNode;
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
      {/* O erro logo abaixo do campo, e a dica depois: quem corrige lê primeiro o que falta. */}
      {erro && (
        <p id={`${id}-erro`} className="erro-campo">
          <Icone nome="alerta" />
          <span>{erro}</span>
        </p>
      )}
      {dica && (
        <span id={`${id}-dica`} className="dica">
          {dica}
        </span>
      )}
    </div>
  );
}

export function ErroGeral({ erro }: { erro?: string }) {
  if (!erro) return null;
  return (
    <Aviso tipo="erro" role="alert">
      {erro}
    </Aviso>
  );
}
