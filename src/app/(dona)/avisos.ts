// Aviso de sucesso depois de salvar (decisão D2 da sessão 07): a ação redireciona com ?salvo=<código>, de uma lista
// fechada, e a página mostra o texto daqui; nunca um texto vindo da URL. O componente AvisoDeSucesso tira o
// parâmetro da URL ao aparecer: recarregar não repete o aviso, e voltar leva à tela anterior sem ele.

const AVISOS = {
  cliente: "Cliente salvo.",
  pet: "Pet salvo.",
  servico: "Serviço salvo.",
  "cliente-e-pet": "Cliente e pet cadastrados. Agora escolha os serviços.",
  // Edição do atendimento: cada parte salva separadamente, e o aviso diz qual (U7 da revisão).
  horario: "Horário salvo.",
  servicos: "Serviços salvos.",
  observacoes: "Observações salvas.",
} as const;

export type CodigoDoAviso = keyof typeof AVISOS;

/** A URL de destino com o aviso. */
export function comAviso(url: string, codigo: CodigoDoAviso): string {
  return `${url}${url.includes("?") ? "&" : "?"}salvo=${codigo}`;
}

/** O texto do aviso, só para um código da lista. */
export function textoDoAviso(valor: unknown): string | null {
  return typeof valor === "string" && Object.hasOwn(AVISOS, valor) ? AVISOS[valor as CodigoDoAviso] : null;
}
