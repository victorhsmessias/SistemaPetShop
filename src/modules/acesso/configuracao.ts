// Configuração do login conferida na inicialização do servidor (instrumentation.ts).

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Cookie com Secure quando o app é servido por https (o Safari descarta cookie Secure em http). */
export function urlUsaHttps(url: string | undefined): boolean {
  return Boolean(url?.startsWith("https://"));
}

/**
 * Em produção, o cookie de sessão precisa sair com Secure: BETTER_AUTH_URL tem de ser https.
 * A exceção é localhost, para testar o build de produção na máquina (npm run test:e2e).
 */
export function problemasDaConfiguracaoDeLogin(ambiente: Record<string, string | undefined>): string[] {
  const problemas: string[] = [];
  const url = ambiente.BETTER_AUTH_URL;
  if (!url) {
    problemas.push("BETTER_AUTH_URL não definida (veja .env.example).");
  } else if (ambiente.NODE_ENV === "production" && !urlUsaHttps(url)) {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      problemas.push(`BETTER_AUTH_URL inválida: ${url}`);
      return problemas;
    }
    if (!HOSTS_LOCAIS.has(host)) {
      problemas.push(
        `BETTER_AUTH_URL (${url}) precisa ser https em produção: sem isso, o cookie de sessão sai sem Secure.`,
      );
    }
  }
  if (!ambiente.BETTER_AUTH_SECRET || ambiente.BETTER_AUTH_SECRET.length < 32) {
    problemas.push("BETTER_AUTH_SECRET precisa ter pelo menos 32 caracteres (veja .env.example).");
  }
  return problemas;
}
