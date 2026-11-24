import { NOMES_DOS_STATUS, type StatusAtendimento } from "@/modules/agenda/status";

// Selo do status do atendimento: fundo suave e texto escuro da mesma família (>= 4,5:1). O nome do status está
// sempre escrito, então a cor nunca é a única pista (o ícone saiu no plano "sem cara de IA"). A cor cheia fica só
// na faixa do bloco da grade.

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
      {nome}
    </span>
  );
}
