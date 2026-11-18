// Telefone do tutor: guardado como +55 + DDD + número (docs/planejamento/sistema-banho-e-tosa.md, regra 9).
// No M3 o lembrete vai para esse número: um telefone errado vira mensagem para um desconhecido.

export type ResultadoTelefone = { ok: true; telefone: string } | { ok: false; erro: string };

/**
 * Aceita com ou sem máscara e com ou sem o 55. Recusa o que não tiver 10 ou 11 dígitos depois do 55,
 * DDD com zero e celular de 11 dígitos que não comece com 9.
 */
export function normalizarTelefone(entrada: string): ResultadoTelefone {
  const texto = entrada.trim();
  if (!texto) return { ok: false, erro: "Informe o telefone." };
  if (/[a-z]/i.test(texto)) return { ok: false, erro: "O telefone só pode ter números." };
  if (texto.startsWith("+") && !/^\+\s*55/.test(texto)) {
    return { ok: false, erro: "Só aceitamos telefones do Brasil (+55)." };
  }

  // Sem tolerância a zero inicial (prefixo de operadora): "(01) 9…" viraria o DDD 19 sem ninguém notar.
  let digitos = texto.replace(/\D/g, "");
  // O 55 só é o código do país quando sobram 12 ou 13 dígitos: 55 também é DDD (Santa Maria, RS).
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }

  if (digitos.length !== 10 && digitos.length !== 11) {
    return { ok: false, erro: "Informe DDD e número, por exemplo (11) 98765-4321." };
  }
  if (digitos.slice(0, 2).includes("0")) return { ok: false, erro: "DDD inválido." };
  if (digitos.length === 11 && digitos[2] !== "9") {
    return { ok: false, erro: "Celular com 11 dígitos começa com 9 depois do DDD." };
  }
  return { ok: true, telefone: `+55${digitos}` };
}

/** "+5511987654321" → "(11) 98765-4321"; "+551134567890" → "(11) 3456-7890". */
export function formatarTelefone(telefone: string | null): string {
  if (!telefone) return "";
  const numero = telefone.replace(/^\+55/, "");
  const ddd = numero.slice(0, 2);
  const resto = numero.slice(2);
  const meio = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}

/**
 * Link que abre a conversa no WhatsApp (ADR 0005: sem API, só o link `wa.me`). Recebe o telefone guardado
 * (`+55` + DDD + número) e devolve `https://wa.me/55DDDNUMERO`, ou null sem telefone.
 */
export function linkDoWhatsApp(telefone: string | null): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  return digitos ? `https://wa.me/${digitos}` : null;
}
