import { randomBytes, randomUUID } from "node:crypto";

import { apagarEmpresa, criarCadastrosDaAgenda, criarEmpresaEDona, encerrarConexoes } from "./apoio";

// Antes dos testes: uma empresa com a dona para cada arquivo de teste, como o painel faz, para um não
// depender dos dados do outro. Depois: apaga tudo o que foi criado.
// As credenciais vão para os testes pelo ambiente (o Playwright repassa o process.env aos workers).
async function novaDona(nome: string) {
  const email = `dona-e2e-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`;
  const senha = `e2e-${randomBytes(9).toString("hex")}`;
  return criarEmpresaEDona(nome, email, senha);
}

export default async function preparar() {
  const cadastro = await novaDona("Ponta a ponta");
  process.env.E2E_EMAIL = cadastro.email;
  process.env.E2E_SENHA = cadastro.senha;

  const agenda = await novaDona("Ponta a ponta agenda");
  await criarCadastrosDaAgenda(agenda.empresaId);
  process.env.E2E_AGENDA_EMAIL = agenda.email;
  process.env.E2E_AGENDA_SENHA = agenda.senha;
  await encerrarConexoes();

  return async () => {
    await apagarEmpresa(cadastro.empresaId);
    await apagarEmpresa(agenda.empresaId);
  };
}
