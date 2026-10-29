import { sair } from "@/app/acoes-sessao";

export function BotaoSair() {
  return (
    <form action={sair}>
      <button type="submit" className="botao-secundario">
        Sair
      </button>
    </form>
  );
}
