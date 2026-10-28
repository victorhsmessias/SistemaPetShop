// Roda uma vez quando o servidor do Next.js inicia, antes de atender requisições.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { verificarPapeisOuEncerrar } = await import("@/db/verificar-papeis");
  await verificarPapeisOuEncerrar();
}
