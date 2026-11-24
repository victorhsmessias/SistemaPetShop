import { sair } from "@/app/acoes-sessao";

export function BotaoSair({ className = "botao-secundario" }: { className?: string }) {
  return (
    <form action={sair}>
      <button type="submit" className={className}>
        Sair
      </button>
    </form>
  );
}
