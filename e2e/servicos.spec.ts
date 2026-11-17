import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./tela";

// Serviços, no iPhone e no desktop: cadastrar (com o erro do preço com ponto), editar, erros de preço e de
// duração mantendo os dados, desativar (some do agendamento) e reativar. A empresa já tem os serviços "Banho M" e
// "Hidratação" e a pet Mel (e2e/preparar.ts).

type Tocar = (alvo: Locator) => Promise<void>;

function itemDoServico(page: Page, nome: string): Locator {
  return page.getByRole("list", { name: "Serviços" }).getByRole("listitem").filter({ hasText: nome });
}

/** Os serviços oferecidos no agendamento da Mel. */
async function servicosNoAgendamento(page: Page, tocar: Tocar): Promise<Locator> {
  await page.goto("/agenda/novo");
  await page.getByLabel("Buscar pelo nome do pet ou do tutor").fill("mel");
  await tocar(page.getByRole("button", { name: "Buscar" }));
  await tocar(page.getByRole("list", { name: "Pets" }).getByRole("link", { name: /Mel/ }));
  await expect(page.getByRole("heading", { level: 2, name: "Mel" })).toBeVisible();
  return page.getByRole("group", { name: "Serviços" });
}

test("a dona cadastra três serviços, um deles corrigido depois da mensagem de erro do preço", async ({
  page,
  tocar,
}) => {
  await page.goto("/agenda");
  await tocar(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Serviços" }));
  const servicos = [
    { nome: "Banho P", preco: "45,00", duracao: "40", exibido: /R\$\s45,00 · 40 min/ },
    { nome: "Tosa higiênica", preco: "35", duracao: "30", exibido: /R\$\s35,00 · 30 min/ },
    { nome: "Banho e tosa G", preco: "1.120,50", duracao: "120", exibido: /R\$\s1\.120,50 · 120 min/ },
  ];
  for (const servico of servicos) {
    await tocar(page.getByRole("link", { name: "Novo serviço" }));
    await page.getByLabel("Nome do serviço").fill(servico.nome);
    await page.getByLabel("Duração (minutos)").fill(servico.duracao);
    if (servico.nome === "Banho P") {
      await page.getByLabel("Preço (R$)").fill("45.00");
      await tocar(page.getByRole("button", { name: "Cadastrar serviço" }));
      await expect(page.getByLabel("Preço (R$)")).toHaveAccessibleDescription(/Use vírgula para os centavos/);
      await expect(page.getByRole("button", { name: "Cadastrar serviço" })).toBeEnabled();
    }
    await page.getByLabel("Preço (R$)").fill(servico.preco);
    await tocar(page.getByRole("button", { name: "Cadastrar serviço" }));
    await expect(page).toHaveURL(/\/servicos$/);
  }

  for (const servico of servicos) {
    await expect(itemDoServico(page, servico.nome)).toContainText(servico.exibido);
  }
});

test("a dona edita um serviço com erros que mantêm os dados, desativa (some do agendamento) e reativa", async ({
  page,
  tocar,
}) => {
  // Duração inválida: nome e preço continuam.
  await page.goto("/servicos/novo");
  await page.getByLabel("Nome do serviço").fill("Tosa na tesoura");
  await page.getByLabel("Preço (R$)").fill("60,00");
  await page.getByLabel("Duração (minutos)").fill("uma hora");
  const cadastrar = page.getByRole("button", { name: "Cadastrar serviço" });
  await tocar(cadastrar);
  await expect(page.getByLabel("Duração (minutos)")).toHaveAccessibleDescription(/Informe a duração em minutos/);
  await expect(page.getByLabel("Nome do serviço")).toHaveValue("Tosa na tesoura");
  await expect(page.getByLabel("Preço (R$)")).toHaveValue("60,00");
  await expect(cadastrar).toBeEnabled();
  await page.getByLabel("Duração (minutos)").fill("90");
  await tocar(cadastrar);
  await expect(itemDoServico(page, "Tosa na tesoura")).toContainText(/R\$\s60,00 · 90 min/);

  // Editar: preço inválido mantém o nome; depois salva.
  await tocar(itemDoServico(page, "Tosa na tesoura").getByRole("link"));
  await expect(page.getByRole("heading", { level: 1, name: "Editar serviço" })).toBeVisible();
  await page.getByLabel("Nome do serviço").fill("Tosa na tesoura completa");
  await page.getByLabel("Preço (R$)").fill("sessenta");
  const salvar = page.getByRole("button", { name: "Salvar alterações" });
  await tocar(salvar);
  await expect(page.getByLabel("Preço (R$)")).toHaveAccessibleDescription(/Valor inválido/);
  await expect(page.getByLabel("Nome do serviço")).toHaveValue("Tosa na tesoura completa");
  await expect(salvar).toBeEnabled();
  await page.getByLabel("Preço (R$)").fill("65,00");
  await tocar(salvar);
  await expect(itemDoServico(page, "Tosa na tesoura completa")).toContainText(/R\$\s65,00 · 90 min/);
  await expect(await servicosNoAgendamento(page, tocar)).toContainText("Tosa na tesoura completa");

  // Desativar: some do agendamento e aparece entre os inativos.
  await page.goto("/servicos");
  await tocar(itemDoServico(page, "Tosa na tesoura completa").getByRole("link"));
  await tocar(page.getByRole("button", { name: "Desativar serviço" }));
  await expect(page).toHaveURL(/\/servicos\?inativos=1$/);
  await expect(itemDoServico(page, "Tosa na tesoura completa")).toContainText("inativo");
  const semOServico = await servicosNoAgendamento(page, tocar);
  await expect(semOServico).toContainText("Banho M");
  await expect(semOServico).not.toContainText("Tosa na tesoura completa");

  // Reativar: volta ao agendamento.
  await page.goto("/servicos?inativos=1");
  await tocar(itemDoServico(page, "Tosa na tesoura completa").getByRole("link"));
  await tocar(page.getByRole("button", { name: "Reativar serviço" }));
  await expect(page).toHaveURL(/\/servicos$/);
  await expect(itemDoServico(page, "Tosa na tesoura completa")).not.toContainText("inativo");
  await expect(await servicosNoAgendamento(page, tocar)).toContainText("Tosa na tesoura completa");
});
