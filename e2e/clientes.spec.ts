import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./tela";

// Clientes, no iPhone e no desktop (critério de "pronto" da sessão 03, ampliado na sessão 07): cadastrar tutor
// e pets, encontrar pela busca, editar, desativar e reativar pet, erro por campo mantendo os dados e telefone
// repetido com o link para o tutor já cadastrado. Cada teste cria os próprios tutores (telefones diferentes).

type Tocar = (alvo: Locator) => Promise<void>;

async function cadastrarTutor(page: Page, tocar: Tocar, nome: string, telefone: string) {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome do tutor").fill(nome);
  await page.getByLabel("Telefone (WhatsApp)").fill(telefone);
  await tocar(page.getByRole("button", { name: "Cadastrar tutor" }));
  await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
}

async function cadastrarPet(
  page: Page,
  tocar: Tocar,
  pet: { nome: string; especie: string; porte: string; raca?: string; cuidados?: string },
) {
  await tocar(page.getByRole("link", { name: "Novo pet" }));
  await page.getByLabel("Nome do pet").fill(pet.nome);
  await page.getByLabel("Espécie").selectOption({ label: pet.especie });
  await page.getByLabel("Porte").selectOption({ label: pet.porte });
  if (pet.raca) await page.getByLabel("Raça (opcional)").fill(pet.raca);
  if (pet.cuidados) await page.getByLabel("Cuidados: comportamento e alergias").fill(pet.cuidados);
  await tocar(page.getByRole("button", { name: "Cadastrar pet" }));
  await expect(page.getByRole("heading", { level: 3, name: pet.nome })).toBeVisible();
}

/** O cartão do pet na página do tutor. */
function cartaoDoPet(page: Page, nome: string): Locator {
  return page
    .getByRole("list", { name: "Pets" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 3, name: new RegExp(`^${nome}`) }) });
}

test("a dona cadastra um tutor com dois pets e encontra um pela busca", async ({ page, tocar }) => {
  await page.goto("/agenda");
  const navegacao = page.getByRole("navigation", { name: "Navegação principal" });

  // Tutor
  await tocar(navegacao.getByRole("link", { name: "Clientes" }));
  await tocar(page.getByRole("link", { name: "Novo cliente" }));
  await page.getByLabel("Nome do tutor").fill("Joana Silvério");
  await page.getByLabel("Telefone (WhatsApp)").fill("21998765432");
  await tocar(page.getByRole("button", { name: "Cadastrar tutor" }));
  await expect(page.getByRole("heading", { level: 1, name: "Joana Silvério" })).toBeVisible();
  await expect(page.getByRole("link", { name: "(21) 99876-5432" })).toBeVisible();

  // Dois pets, um com cuidados em destaque
  await cadastrarPet(page, tocar, {
    nome: "Paçoca",
    especie: "Cão",
    porte: "Médio (M)",
    raca: "Vira-lata",
    cuidados: "Alérgico a frango. Não gosta de secador.",
  });
  await expect(page.getByText("Alérgico a frango. Não gosta de secador.")).toBeVisible();
  await cadastrarPet(page, tocar, { nome: "Bóris", especie: "Gato", porte: "Pequeno (P)" });

  // Busca pelo pet, sem acento
  await tocar(navegacao.getByRole("link", { name: "Clientes" }));
  await page.getByLabel("Buscar por tutor, pet ou telefone").fill("pacoca");
  await tocar(page.getByRole("button", { name: "Buscar" }));
  await expect(page).toHaveURL(/busca=pacoca/);
  const resultados = page.getByRole("list", { name: "Tutores" }).getByRole("listitem");
  await expect(resultados).toHaveCount(1);
  await expect(resultados.first()).toContainText("Joana Silvério");
  await expect(resultados.first()).toContainText("Paçoca");
  await tocar(resultados.first().getByRole("link"));
  await expect(page.getByRole("heading", { level: 3, name: "Paçoca" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Bóris" })).toBeVisible();
});

test("a dona edita o tutor e o pet, desativa o pet e o reativa pela lista de inativos", async ({ page, tocar }) => {
  await cadastrarTutor(page, tocar, "Marcos Lima", "(11) 97654-3210");
  await cadastrarPet(page, tocar, { nome: "Fumaça", especie: "Gato", porte: "Pequeno (P)" });

  // Editar o tutor: nome e observações.
  await tocar(page.getByRole("link", { name: "Editar tutor" }));
  await expect(page.getByRole("heading", { level: 1, name: "Editar cliente" })).toBeVisible();
  await expect(page.getByLabel("Nome do tutor")).toHaveValue("Marcos Lima");
  await page.getByLabel("Nome do tutor").fill("Marcos Lima Souza");
  await page.getByLabel("Observações").fill("Prefere mensagem à tarde.");
  await tocar(page.getByRole("button", { name: "Salvar alterações" }));
  await expect(page.getByRole("heading", { level: 1, name: "Marcos Lima Souza" })).toBeVisible();
  await expect(page.getByText("Prefere mensagem à tarde.")).toBeVisible();

  // Editar o pet: raça e porte.
  await tocar(cartaoDoPet(page, "Fumaça").getByRole("link", { name: "Editar" }));
  await expect(page.getByRole("heading", { level: 1, name: "Editar Fumaça" })).toBeVisible();
  await expect(page.getByLabel("Espécie")).toHaveValue("gato");
  await page.getByLabel("Raça (opcional)").fill("Persa");
  await page.getByLabel("Porte").selectOption({ label: "Médio (M)" });
  await tocar(page.getByRole("button", { name: "Salvar alterações" }));
  await expect(cartaoDoPet(page, "Fumaça")).toContainText("Gato · Persa · Médio (M)");

  // Desativar: some da lista; aparece em "Ver também os pets inativos", marcado como inativo.
  await tocar(cartaoDoPet(page, "Fumaça").getByRole("button", { name: "Desativar" }));
  await expect(page).toHaveURL(/inativos=1/);
  await expect(cartaoDoPet(page, "Fumaça")).toContainText("inativo");
  await tocar(page.getByRole("link", { name: "Mostrar só os ativos" }));
  await expect(page.getByText("Nenhum pet ativo.")).toBeVisible();
  await tocar(page.getByRole("link", { name: "Ver também os pets inativos" }));

  // Reativar: volta para os ativos.
  await tocar(cartaoDoPet(page, "Fumaça").getByRole("button", { name: "Reativar" }));
  await expect(page).not.toHaveURL(/inativos=1/);
  await expect(cartaoDoPet(page, "Fumaça")).not.toContainText("inativo");
  await expect(cartaoDoPet(page, "Fumaça").getByRole("button", { name: "Desativar" })).toBeVisible();
});

test("o erro de um campo mantém o que foi digitado, e o telefone repetido leva ao tutor já cadastrado", async ({
  page,
  tocar,
}) => {
  await cadastrarTutor(page, tocar, "Carla Duarte", "(31) 99123-4567");

  // Telefone incompleto: a mensagem fica no campo, e nome e observações continuam preenchidos.
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome do tutor").fill("Carla Duarte Filha");
  await page.getByLabel("Telefone (WhatsApp)").fill("9912");
  await page.getByLabel("Observações").fill("Indicada pela mãe.");
  const cadastrar = page.getByRole("button", { name: "Cadastrar tutor" });
  await tocar(cadastrar);
  const telefone = page.getByLabel("Telefone (WhatsApp)");
  await expect(telefone).toHaveAccessibleDescription(/Informe DDD e número/);
  await expect(telefone).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Nome do tutor")).toHaveValue("Carla Duarte Filha");
  await expect(page.getByLabel("Observações")).toHaveValue("Indicada pela mãe.");
  await expect(telefone).toHaveValue("9912");

  // Nome vazio: a mensagem é do nome. Espera o envio anterior terminar antes de digitar.
  await expect(cadastrar).toBeEnabled();
  await page.getByLabel("Nome do tutor").fill("");
  await tocar(cadastrar);
  await expect(page.getByLabel("Nome do tutor")).toHaveAccessibleDescription(/Informe o nome/);

  // Telefone de outro tutor, noutro formato: a mensagem diz de quem é e o link abre o tutor.
  await expect(cadastrar).toBeEnabled();
  await page.getByLabel("Nome do tutor").fill("Carla Duarte Filha");
  await telefone.fill("+55 31 99123-4567");
  await tocar(cadastrar);
  await expect(telefone).toHaveAccessibleDescription(/Este telefone já é de Carla Duarte\./);
  await tocar(page.getByRole("link", { name: "Abrir o tutor já cadastrado" }));
  await expect(page.getByRole("heading", { level: 1, name: "Carla Duarte" })).toBeVisible();
});

test("o que a dona digita enquanto o formulário envia não é apagado quando volta o erro (B8)", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  // Atrasa o envio (a rede lenta do celular), para dar tempo de digitar com o botão em "Salvando…".
  await page.route("**/clientes/novo", async (rota) => {
    if (rota.request().method() === "POST") await new Promise((pronto) => setTimeout(pronto, 1500));
    await rota.continue();
  });
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome do tutor").fill("Beatriz Envio");
  await page.getByLabel("Telefone (WhatsApp)").fill("9912");
  await tocar(page.getByRole("button", { name: "Cadastrar tutor" }));
  await expect(page.getByRole("button", { name: "Salvando…" })).toBeDisabled();

  await page.getByLabel("Observações").fill("Digitado enquanto enviava.");
  await expect(page.getByLabel("Telefone (WhatsApp)")).toHaveAccessibleDescription(/Informe DDD e número/);
  await expect(page.getByRole("button", { name: "Cadastrar tutor" })).toBeEnabled();
  await expect(page.getByLabel("Observações")).toHaveValue("Digitado enquanto enviava.");
  await expect(page.getByLabel("Nome do tutor")).toHaveValue("Beatriz Envio");
});
