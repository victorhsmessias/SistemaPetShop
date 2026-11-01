"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/servicos", rotulo: "Serviços" },
] as const;

export function NavegacaoInferior() {
  const caminho = usePathname();
  return (
    <nav className="navegacao-inferior" aria-label="Navegação principal">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={caminho === item.href || caminho.startsWith(`${item.href}/`) ? "page" : undefined}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}
