// Roda uma vez quando o servidor do Next.js inicia, antes de atender requisições.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Variáveis de ambiente (docs/operacao/variaveis.md): sem elas, o app não sobe e explica o que falta.
  const { problemasDoAmbiente } = await import("@/configuracao/ambiente");
  const problemas = problemasDoAmbiente(process.env);
  if (problemas.length > 0) {
    console.error(`\nO app não vai iniciar: variáveis de ambiente incorretas.\n${problemas.map((p) => `  - ${p}`).join("\n")}\n`);
    process.exit(1);
  }

  const { verificarPapeisOuEncerrar } = await import("@/db/verificar-papeis");
  await verificarPapeisOuEncerrar();
}
