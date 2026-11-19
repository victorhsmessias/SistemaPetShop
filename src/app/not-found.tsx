import type { Metadata } from "next";
import Link from "next/link";

import { Icone } from "@/app/componentes/icone";

export const metadata: Metadata = { title: "Página não encontrada · banho-e-tosa" };

// 404 em português, também para o registro de outra empresa (o RLS faz ele voltar como "não encontrado"). Num
// endereço que não existe, aparece sozinho; numa tela da dona, dentro da moldura dela. O botão leva à agenda (o
// administrador, que não tem agenda, é mandado para o painel).
export default function NaoEncontrada() {
  return (
    <main className="pagina pagina-estreita centralizada pagina-excecao">
      <span className="excecao-icone">
        <Icone nome="busca" />
      </span>
      <h1>Não encontramos esta página</h1>
      <p className="suave">O endereço pode ter mudado, ou o registro não existe mais.</p>
      <Link href="/agenda" className="botao-link botao-primario botao-largo">
        <Icone nome="agenda" />
        Voltar para a agenda
      </Link>
    </main>
  );
}
