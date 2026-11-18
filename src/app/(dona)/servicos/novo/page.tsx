import type { Metadata } from "next";

import { FormularioServico } from "@/app/(dona)/formularios";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { Voltar } from "@/app/componentes/voltar";

export const metadata: Metadata = { title: "Novo serviço · banho-e-tosa" };

export default async function PaginaNovoServico() {
  await naEmpresaDaDona(async () => undefined);

  return (
    <main className="pagina">
      <Voltar href="/servicos" destino="Serviços" />
      <h1>Novo serviço</h1>
      <div className="cartao">
        <FormularioServico />
      </div>
    </main>
  );
}
