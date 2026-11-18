import Link from "next/link";

import { Icone } from "@/app/componentes/icone";

/**
 * Voltar, sempre com o nome do destino ("Agenda", "Ana Paula Souza") e no mínimo 48 × 48 px. O nome acessível é
 * "Voltar para <destino>": não se confunde com a aba de mesmo nome e contém o texto visível (WCAG 2.5.3).
 */
export function Voltar({ href, destino }: { href: string; destino: string }) {
  return (
    <Link href={href} className="voltar" aria-label={`Voltar para ${destino}`}>
      <Icone nome="esq" />
      <span>{destino}</span>
    </Link>
  );
}
