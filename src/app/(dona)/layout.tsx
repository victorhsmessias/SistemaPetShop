import { BarraDoTopo, ContaNaLateral, Marca } from "@/app/(dona)/conta";
import { NavegacaoPrincipal } from "@/app/(dona)/navegacao";
import { naEmpresaDaDona } from "@/app/(dona)/sessao-da-dona";
import { nomeDaEmpresa } from "@/modules/empresas/consultas";

// Moldura das telas da dona: barra do topo (celular), barra lateral (a partir de 1024 px) e navegação. O layout lê o
// nome da empresa e o da dona para mostrar, mas NÃO confere o acesso pelas páginas: cada página e cada ação continua
// chamando naEmpresaDaDona, porque o Next renderiza layout e página em paralelo e o layout não roda nas Server
// Actions. A empresa suspensa vai para /empresa, que fica fora deste grupo (sem esta moldura e sem laço).
export default async function LayoutDona({ children }: Readonly<{ children: React.ReactNode }>) {
  const conta = await naEmpresaDaDona(async (tx, sessao) => ({ empresa: await nomeDaEmpresa(tx), nome: sessao.nome }));
  return (
    <div className="moldura-dona">
      <BarraDoTopo conta={conta} />
      <aside className="lateral">
        <Marca empresa={conta.empresa} />
        <NavegacaoPrincipal />
        <ContaNaLateral conta={conta} />
      </aside>
      <div className="com-navegacao">{children}</div>
    </div>
  );
}
