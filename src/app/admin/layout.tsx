import type { Metadata } from "next";

import { conferirAdminOuRedirecionar } from "@/app/admin/conferir-admin";
import { BotaoSair } from "@/app/botao-sair";

export const metadata: Metadata = { title: "Administração" };

// Primeira barreira de /admin. Não é a única: a página e cada ação conferem de novo no servidor
// (o layout roda em paralelo com a página e não roda nas Server Actions).
export default async function LayoutAdmin({ children }: Readonly<{ children: React.ReactNode }>) {
  await conferirAdminOuRedirecionar();

  return (
    <main className="pagina">
      <header className="topo">
        <span className="marca">banho-e-tosa · admin</span>
        <BotaoSair />
      </header>
      {children}
    </main>
  );
}
