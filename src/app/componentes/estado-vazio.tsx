import type { ReactNode } from "react";

import { Icone, type NomeDoIcone } from "@/app/componentes/icone";

/** Lista ou tela vazia que diz o que fazer, com a ação quando houver. */
export function EstadoVazio({
  icone,
  titulo,
  children,
  acao,
}: {
  icone: NomeDoIcone;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="estado-vazio">
      <Icone nome={icone} className="estado-vazio-icone" />
      <p className="estado-vazio-titulo">{titulo}</p>
      {children && <p className="suave">{children}</p>}
      {acao}
    </div>
  );
}
