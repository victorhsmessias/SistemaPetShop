import { NavegacaoInferior } from "@/app/(dona)/navegacao";

// Só a moldura visual. O acesso é conferido em cada página e ação (naEmpresaDaDona), nunca aqui:
// o Next renderiza layout e página em paralelo, e o layout não roda nas Server Actions.
export default function LayoutDona({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="com-navegacao">{children}</div>
      <NavegacaoInferior />
    </>
  );
}
