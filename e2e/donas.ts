import path from "node:path";

// Donas preparadas pelo globalSetup (e2e/preparar.ts), uma por arquivo de teste e perfil, com a chave
// "<arquivo>-<perfil>". Vão para os testes pelo ambiente (E2E_DONAS, em JSON).

export const PASTA_DAS_SESSOES = path.join("e2e", ".sessoes");

export type DonaPreparada = {
  empresaId: string;
  email: string;
  senha: string;
  /** Arquivo do storageState com a sessão já aberta; sem ele, o teste entra pela tela. */
  sessao?: string;
};

export function donasPreparadas(): Record<string, DonaPreparada> {
  return JSON.parse(process.env.E2E_DONAS ?? "{}") as Record<string, DonaPreparada>;
}
