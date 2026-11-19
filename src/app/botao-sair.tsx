import { sair } from "@/app/acoes-sessao";
import { Icone } from "@/app/componentes/icone";

export function BotaoSair({ className = "botao-secundario" }: { className?: string }) {
  return (
    <form action={sair}>
      <button type="submit" className={className}>
        <Icone nome="sair" />
        Sair
      </button>
    </form>
  );
}
