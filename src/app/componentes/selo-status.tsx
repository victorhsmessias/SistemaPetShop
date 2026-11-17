import { Icone, type NomeDoIcone } from "@/app/componentes/icone";
import { NOMES_DOS_STATUS, type StatusAtendimento } from "@/modules/agenda/status";

// Selo do status do atendimento: fundo suave, texto escuro da mesma família (>= 4,5:1) e um ícone por status, para
// a cor nunca ser a única pista. A cor cheia fica só na faixa do bloco da grade.

const ICONES: Record<StatusAtendimento, NomeDoIcone> = {
  agendado: "relogio",
  confirmado: "calcheck",
  em_atendimento: "gota",
  pronto: "sino",
  concluido: "checkcirc",
  cancelado: "xcirc",
  faltou: "proibido",
};

/**
 * `anunciar`: na página do atendimento, o selo é uma região `role="status"` com o nome acessível "Status: …", e o
 * leitor de tela anuncia a mudança. Na grade e nas listas, é só texto.
 */
export function SeloDeStatus({
  status,
  mini = false,
  anunciar = false,
}: {
  status: StatusAtendimento;
  mini?: boolean;
  anunciar?: boolean;
}) {
  const nome = NOMES_DOS_STATUS[status];
  return (
    <span
      className={`selo status-${status}${mini ? " selo-mini" : ""}`}
      {...(anunciar ? { role: "status", "aria-label": `Status: ${nome}` } : {})}
    >
      <Icone nome={ICONES[status]} />
      {nome}
    </span>
  );
}
