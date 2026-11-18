import { adminPreparado } from "./donas";
import { erroGeral, expect, sair, test } from "./tela";

// Entrar e sair. O login pela tela conta no limite de 5 por minuto (auth.ts): este arquivo faz 4 (dona no iPhone e
// no desktop, senha errada e administrador, só no iPhone) e o da empresa suspensa faz 1. Os outros arquivos já
// começam com a sessão aberta (e2e/preparar.ts). Não acrescente logins pela tela sem rever essa conta.

test.describe("sem sessão", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a dona entra e vê a agenda; ao sair, nem o voltar do navegador mostra os dados", async ({
    page,
    tocar,
    dona,
  }) => {
    // Sem sessão, as telas da dona levam ao login.
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();

    await page.getByLabel("E-mail").fill(dona.email);
    await page.getByLabel("Senha").fill(dona.senha);
    await tocar(page.getByRole("button", { name: "Entrar" }));
    await expect(page).toHaveURL(/\/agenda$/);
    await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();

    await sair(page, tocar);
    await expect(page).toHaveURL(/\/login$/);
    // O voltar termina no login (sem sessão, a agenda redireciona). Espera a URL antes de conferir a tela e de abrir
    // outra: no WebKit, a conferência rodava com o voltar ainda em andamento (falhou no CI).
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toHaveCount(0);
    await page.goto("/clientes");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a senha errada mostra a mensagem e não entra", { tag: "@um-perfil" }, async ({ page, tocar, dona }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(dona.email);
    await page.getByLabel("Senha").fill("senha-errada-123");
    await tocar(page.getByRole("button", { name: "Entrar" }));
    await expect(erroGeral(page, "E-mail ou senha incorretos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("o administrador entra no painel", { tag: "@um-perfil" }, async ({ page, tocar }) => {
    const admin = adminPreparado();
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(admin.email);
    await page.getByLabel("Senha").fill(admin.senha);
    await tocar(page.getByRole("button", { name: "Entrar" }));
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();
  });
});

test("a dona com sessão não abre o painel do administrador: volta para a agenda", { tag: "@um-perfil" }, async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
});
