import { bancoRespondendo } from "@/db/saude";

// Rota de saúde para o monitor externo (docs/operacao/README.md). Sem autenticação e com resposta mínima: só o
// estado, sem versão, sem mensagem de erro e sem dado de empresa, e nunca guardada em cache.
// 200 quando o app e o banco respondem; 503 quando o banco não responde.

export const dynamic = "force-dynamic";

const CABECALHOS = { "Cache-Control": "no-store, max-age=0" };

async function estado(): Promise<{ status: 200 | 503; corpo: string }> {
  return (await bancoRespondendo())
    ? { status: 200, corpo: JSON.stringify({ status: "ok" }) }
    : { status: 503, corpo: JSON.stringify({ status: "indisponivel" }) };
}

export async function GET(): Promise<Response> {
  const { status, corpo } = await estado();
  return new Response(corpo, { status, headers: { ...CABECALHOS, "Content-Type": "application/json" } });
}

/** Alguns monitores usam HEAD: mesmo código, sem corpo. */
export async function HEAD(): Promise<Response> {
  const { status } = await estado();
  return new Response(null, { status, headers: CABECALHOS });
}
