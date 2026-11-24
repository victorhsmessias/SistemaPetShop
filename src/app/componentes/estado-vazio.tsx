import type { ReactNode } from "react";

/** Lista ou tela vazia que diz o que fazer, com a ação quando houver. */
export function EstadoVazio({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="estado-vazio">
      <p className="estado-vazio-titulo">{titulo}</p>
      {children && <p className="suave">{children}</p>}
      {acao}
    </div>
  );
}
