import type { Metadata } from "next";
import Link from "next/link";

import { FormularioServico } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";

export const metadata: Metadata = { title: "Novo serviço · banho-e-tosa" };

export default async function PaginaNovoServico() {
  await naEmpresaDaDona(async () => undefined);

  return (
    <main className="pagina">
      <Link href="/servicos" className="voltar">
        ‹ Serviços
      </Link>
      <h1>Novo serviço</h1>
      <div className="cartao">
        <FormularioServico />
      </div>
    </main>
  );
}
