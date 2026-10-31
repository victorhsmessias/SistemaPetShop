import { randomBytes, randomUUID } from "node:crypto";

import { apagarEmpresa, criarEmpresaEDona } from "./apoio";

// Antes dos testes: cria uma empresa com a dona, como o painel faz. Depois: apaga tudo o que foi criado.
// As credenciais vão para os testes pelo ambiente (o Playwright repassa o process.env aos workers).
export default async function preparar() {
  const email = `dona-e2e-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`;
  const senha = `e2e-${randomBytes(9).toString("hex")}`;
  const { empresaId } = await criarEmpresaEDona("Ponta a ponta", email, senha);

  process.env.E2E_EMAIL = email;
  process.env.E2E_SENHA = senha;

  return async () => {
    await apagarEmpresa(empresaId);
  };
}
