import { BotaoSair } from "@/app/botao-sair";

// Marca e conta da dona (nome da empresa, nome dela e Sair), em todas as telas: no celular, numa barra no topo
// com o menu da conta; a partir de 1024 px, no alto e no pé da barra lateral. Só visual: os dados vêm do layout.

export type DadosDaConta = { empresa: string; nome: string };

/** Até duas iniciais do nome ("Carla Mendes" → "CM"). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length > 1 ? [partes[0]!, partes.at(-1)!] : partes.slice(0, 1);
  return letras.map((p) => p[0]!.toLocaleUpperCase("pt-BR")).join("") || "?";
}

export function Marca({ empresa }: { empresa: string }) {
  return (
    <span className="marca-app">
      <strong className="marca-texto">{empresa}</strong>
    </span>
  );
}

/** Barra do topo no celular: marca e o botão do menu da conta (popover do HTML, sem JavaScript). */
export function BarraDoTopo({ conta }: { conta: DadosDaConta }) {
  return (
    <header className="barra-topo">
      <Marca empresa={conta.empresa} />
      <button type="button" className="avatar-botao" popoverTarget="menu-conta" aria-label="Menu da conta">
        {iniciais(conta.nome)}
      </button>
      <div id="menu-conta" popover="auto" className="menu-conta">
        <p>
          <strong>{conta.nome}</strong>
          <br />
          <span className="suave">{conta.empresa}</span>
        </p>
        <BotaoSair className="botao-secundario botao-largo" />
      </div>
    </header>
  );
}

/** Pé da barra lateral (desktop): quem está usando e o Sair. */
export function ContaNaLateral({ conta }: { conta: DadosDaConta }) {
  return (
    <div className="lateral-conta">
      <span className="avatar" aria-hidden="true">
        {iniciais(conta.nome)}
      </span>
      <span className="lateral-nome">
        {conta.nome}
        <small>Dona</small>
      </span>
      <BotaoSair className="botao-texto" />
    </div>
  );
}
