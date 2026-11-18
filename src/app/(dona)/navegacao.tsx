"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icone, type NomeDoIcone } from "@/app/componentes/icone";

const ITENS: { href: string; rotulo: string; icone: NomeDoIcone }[] = [
  { href: "/agenda", rotulo: "Agenda", icone: "agenda" },
  { href: "/clientes", rotulo: "Clientes", icone: "clientes" },
  { href: "/servicos", rotulo: "Serviços", icone: "servicos" },
  { href: "/financeiro", rotulo: "Financeiro", icone: "financeiro" },
];

/**
 * As quatro seções, com ícone e texto (a aba ativa não depende só da cor). Um elemento só: no celular, abas fixas no
 * rodapé; a partir de 1024 px, a lista da barra lateral (o CSS muda a forma).
 */
export function NavegacaoPrincipal() {
  const caminho = usePathname();
  return (
    <nav className="navegacao-principal" aria-label="Navegação principal">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={caminho === item.href || caminho.startsWith(`${item.href}/`) ? "page" : undefined}
        >
          <Icone nome={item.icone} />
          <span>{item.rotulo}</span>
        </Link>
      ))}
    </nav>
  );
}
