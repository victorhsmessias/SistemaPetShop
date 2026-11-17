import path from "node:path";

// Donas preparadas pelo globalSetup (e2e/preparar.ts), uma por arquivo de teste e perfil, com a chave
// "<arquivo>-<perfil>", e o administrador. Vão para os testes pelo ambiente (E2E_DONAS e E2E_ADMIN, em JSON).

export const PASTA_DAS_SESSOES = path.join("e2e", ".sessoes");

/** Nome das empresas criadas pelo painel no teste do administrador: o globalSetup apaga as que começam assim. */
export const PREFIXO_DO_PAINEL = "[teste] Painel e2e";

export type DonaPreparada = {
  empresaId: string;
  email: string;
  senha: string;
  /** Arquivo do storageState com a sessão já aberta; sem ele, o teste entra pela tela. */
  sessao?: string;
  /** Ids e valores criados para o arquivo (e2e/preparar.ts, `preparar`). */
  dados?: Record<string, string>;
};

export function donasPreparadas(): Record<string, DonaPreparada> {
  return JSON.parse(process.env.E2E_DONAS ?? "{}") as Record<string, DonaPreparada>;
}

/** Administrador da plataforma preparado pelo globalSetup (E2E_ADMIN, em JSON). */
export function adminPreparado(): DonaPreparada {
  const admin = process.env.E2E_ADMIN;
  if (!admin) throw new Error("Administrador não preparado (e2e/preparar.ts).");
  return JSON.parse(admin) as DonaPreparada;
}
