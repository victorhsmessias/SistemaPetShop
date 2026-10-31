// Roda uma vez quando o servidor do Next.js inicia, antes de atender requisições.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { problemasDaConfiguracaoDeLogin } = await import("@/modules/acesso/configuracao");
  const problemas = problemasDaConfiguracaoDeLogin(process.env);
  if (problemas.length > 0) {
    console.error(`\nO app não vai iniciar: configuração do login incorreta.\n${problemas.map((p) => `  - ${p}`).join("\n")}\n`);
    process.exit(1);
  }

  const { verificarPapeisOuEncerrar } = await import("@/db/verificar-papeis");
  await verificarPapeisOuEncerrar();
}
