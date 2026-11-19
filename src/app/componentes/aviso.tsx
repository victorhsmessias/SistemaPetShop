import type { ReactNode } from "react";

import { Icone, type NomeDoIcone } from "@/app/componentes/icone";

// Aviso em linha, com ícone: erro (o que impediu salvar), aviso (dá para seguir, mas atenção), sucesso e informação.
// O ícone e o texto dizem o tipo; a cor reforça.

export type TipoDeAviso = "erro" | "aviso" | "sucesso" | "info";

const ICONES: Record<TipoDeAviso, NomeDoIcone> = { erro: "alerta", aviso: "alerta", sucesso: "checkcirc", info: "info" };

export function Aviso({
  tipo,
  role,
  children,
}: {
  tipo: TipoDeAviso;
  /** "alert" para o que acabou de dar errado; "status" para o que só informa. */
  role?: "alert" | "status";
  children: ReactNode;
}) {
  return (
    <div className={`mensagem mensagem-${tipo}`} role={role}>
      <Icone nome={ICONES[tipo]} />
      <div className="mensagem-corpo">{children}</div>
    </div>
  );
}
