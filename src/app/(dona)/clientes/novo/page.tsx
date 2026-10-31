import type { Metadata } from "next";
import Link from "next/link";

import { FormularioTutor } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";

export const metadata: Metadata = { title: "Novo cliente · banho-e-tosa" };

export default async function PaginaNovoCliente() {
  await naEmpresaDaDona(async () => undefined);

  return (
    <main className="pagina">
      <Link href="/clientes" className="voltar">
        ‹ Clientes
      </Link>
      <h1>Novo cliente</h1>
      <div className="cartao">
        <FormularioTutor />
      </div>
    </main>
  );
}
