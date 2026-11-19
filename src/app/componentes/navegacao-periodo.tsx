import Link from "next/link";

import { Icone } from "@/app/componentes/icone";

/**
 * ‹ título › para dia, semana e mês. No período atual, o subtítulo diz "Hoje" (ou "Esta semana", "Este mês"); fora
 * dele, um link de volta. As setas têm nome acessível ("Dia anterior", "Próximo dia").
 */
export function NavegacaoPeriodo({
  rotulo,
  titulo,
  anterior,
  proximo,
  atual,
  voltar,
}: {
  /** Nome da navegação: "Dias", "Semanas", "Meses". */
  rotulo: string;
  titulo: string;
  anterior: { href: string; rotulo: string };
  proximo: { href: string; rotulo: string };
  /** Texto quando o período aberto é o atual ("Hoje"); senão, null e aparece o voltar. */
  atual: string | null;
  voltar: { href: string; rotulo: string };
}) {
  return (
    <nav className="navegacao-dias" aria-label={rotulo}>
      <Link href={anterior.href} aria-label={anterior.rotulo}>
        <Icone nome="esq" />
      </Link>
      <span className="navegacao-dias-atual">
        <span className="titulo">{titulo}</span>
        {atual ? <span className="suave">{atual}</span> : <Link href={voltar.href}>{voltar.rotulo}</Link>}
      </span>
      <Link href={proximo.href} aria-label={proximo.rotulo}>
        <Icone nome="dir" />
      </Link>
    </nav>
  );
}
