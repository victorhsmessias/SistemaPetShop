import { Icone } from "@/app/componentes/icone";

// Escolha curta (espécie, porte) em botões lado a lado, no lugar do select: mostra todas as opções e economiza toques.
// São rádios de verdade (um toque marca, o teclado anda com as setas), com cara de botão. O erro vem do servidor,
// no aria-describedby do grupo.

export type OpcaoSegmentada = { valor: string; nome: string; curto?: string };

export function Segmentado({
  nome,
  rotulo,
  opcoes,
  valor,
  erro,
}: {
  nome: string;
  rotulo: string;
  opcoes: OpcaoSegmentada[];
  /** Valor marcado ao abrir (ou o que voltou com o erro). */
  valor?: string;
  erro?: string;
}) {
  const idErro = `campo-${nome}-erro`;
  return (
    <fieldset className="campo segmentado-campo" aria-describedby={erro ? idErro : undefined}>
      <legend>{rotulo}</legend>
      <div className="segmentado">
        {opcoes.map((opcao) => (
          <label key={opcao.valor}>
            <input type="radio" name={nome} value={opcao.valor} defaultChecked={valor === opcao.valor} />
            {opcao.curto ? (
              <>
                {/* Visível só a sigla (P, M, G, GG); o nome acessível é o completo e contém a sigla. */}
                <span aria-hidden="true">{opcao.curto}</span>
                <span className="visualmente-oculto">{opcao.nome}</span>
              </>
            ) : (
              <span>{opcao.nome}</span>
            )}
          </label>
        ))}
      </div>
      {erro && (
        <p id={idErro} className="erro-campo">
          <Icone nome="alerta" />
          <span>{erro}</span>
        </p>
      )}
    </fieldset>
  );
}
