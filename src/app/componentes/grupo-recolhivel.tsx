import type { ReactNode } from "react";

import { Icone } from "@/app/componentes/icone";

/**
 * Grupo que abre e fecha (`details`), com a seta explícita: o `summary` com `display: flex` perde o marcador do
 * navegador, e sem seta o grupo parecia um cartão parado. O resumo já traz a contagem ("2 cancelados ou faltas").
 */
export function GrupoRecolhivel({ resumo, children }: { resumo: ReactNode; children: ReactNode }) {
  return (
    <details className="grupo">
      <summary>
        <span>{resumo}</span>
        <Icone nome="baixo" className="seta" />
      </summary>
      {children}
    </details>
  );
}
