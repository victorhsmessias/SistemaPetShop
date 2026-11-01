import { expect, test, type Page } from "@playwright/test";

// A dona, num iPhone: entra, cadastra um tutor com dois pets, encontra um deles pela busca
// e cadastra três serviços (critério de "pronto" da sessão 03).

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Senha").fill(process.env.E2E_SENHA!);
  await page.getByRole("button", { name: "Entrar" }).tap();
  await expect(page).toHaveURL(/\/agenda$/);
}

async function cadastrarPet(
  page: Page,
  pet: { nome: string; especie: string; porte: string; raca?: string; cuidados?: string },
) {
  await page.getByRole("link", { name: "Novo pet" }).tap();
  await page.getByLabel("Nome do pet").fill(pet.nome);
  await page.getByLabel("Espécie").selectOption({ label: pet.especie });
  await page.getByLabel("Porte").selectOption({ label: pet.porte });
  if (pet.raca) await page.getByLabel("Raça (opcional)").fill(pet.raca);
  if (pet.cuidados) await page.getByLabel("Cuidados: comportamento e alergias").fill(pet.cuidados);
  await page.getByRole("button", { name: "Cadastrar pet" }).tap();
  await expect(page.getByRole("heading", { level: 3, name: pet.nome })).toBeVisible();
}

test("a dona cadastra um tutor com dois pets, encontra um pela busca e cadastra três serviços", async ({ page }) => {
  await entrar(page);
  const navegacao = page.getByRole("navigation", { name: "Navegação principal" });

  // Tutor
  await navegacao.getByRole("link", { name: "Clientes" }).tap();
  await page.getByRole("link", { name: "Novo cliente" }).tap();
  await page.getByLabel("Nome do tutor").fill("Joana Silvério");
  await page.getByLabel("Telefone (WhatsApp)").fill("21998765432");
  await page.getByRole("button", { name: "Cadastrar tutor" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Joana Silvério" })).toBeVisible();
  await expect(page.getByRole("link", { name: "(21) 99876-5432" })).toBeVisible();

  // Dois pets, um com cuidados em destaque
  await cadastrarPet(page, {
    nome: "Paçoca",
    especie: "Cão",
    porte: "Médio (M)",
    raca: "Vira-lata",
    cuidados: "Alérgico a frango. Não gosta de secador.",
  });
  await expect(page.getByText("Alérgico a frango. Não gosta de secador.")).toBeVisible();
  await cadastrarPet(page, { nome: "Bóris", especie: "Gato", porte: "Pequeno (P)" });

  // Busca pelo pet, sem acento
  await navegacao.getByRole("link", { name: "Clientes" }).tap();
  await page.getByLabel("Buscar por tutor, pet ou telefone").fill("pacoca");
  await page.getByRole("button", { name: "Buscar" }).tap();
  await expect(page).toHaveURL(/busca=pacoca/);
  const resultados = page.getByRole("list", { name: "Tutores" }).getByRole("listitem");
  await expect(resultados).toHaveCount(1);
  await expect(resultados.first()).toContainText("Joana Silvério");
  await expect(resultados.first()).toContainText("Paçoca");
  await resultados.first().getByRole("link").tap();
  await expect(page.getByRole("heading", { level: 3, name: "Paçoca" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Bóris" })).toBeVisible();

  // Três serviços, um deles corrigido depois da mensagem de erro do preço
  await navegacao.getByRole("link", { name: "Serviços" }).tap();
  const servicos = [
    { nome: "Banho P", preco: "45,00", duracao: "40", exibido: "R$ 45,00 · 40 min" },
    { nome: "Tosa higiênica", preco: "35", duracao: "30", exibido: "R$ 35,00 · 30 min" },
    { nome: "Banho e tosa G", preco: "1.120,50", duracao: "120", exibido: "R$ 1.120,50 · 120 min" },
  ];
  for (const servico of servicos) {
    await page.getByRole("link", { name: "Novo serviço" }).tap();
    await page.getByLabel("Nome do serviço").fill(servico.nome);
    await page.getByLabel("Duração (minutos)").fill(servico.duracao);
    if (servico.nome === "Banho P") {
      await page.getByLabel("Preço (R$)").fill("45.00");
      await page.getByRole("button", { name: "Cadastrar serviço" }).tap();
      await expect(page.getByText("Use vírgula para os centavos")).toBeVisible();
    }
    await page.getByLabel("Preço (R$)").fill(servico.preco);
    await page.getByRole("button", { name: "Cadastrar serviço" }).tap();
    await expect(page).toHaveURL(/\/servicos$/);
  }

  const lista = page.getByRole("list", { name: "Serviços" }).getByRole("listitem");
  await expect(lista).toHaveCount(3);
  for (const servico of servicos) {
    const item = lista.filter({ hasText: servico.nome });
    // O Intl usa espaço inquebrável depois do R$.
    await expect(item).toContainText(servico.exibido.replace("R$ ", "R$ "));
  }
});
