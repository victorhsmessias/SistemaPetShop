import { erroGeral, expect, test } from "./tela";

// Empresa suspensa (iPhone). O painel ainda não suspende (H13, M4): a preparação suspende pelo papel plataforma,
// depois de abrir a sessão da dona (e2e/preparar.ts). Este arquivo faz 1 login pela tela (ver login.spec.ts).

const MENSAGEM = "O acesso desta empresa está suspenso. Fale com o suporte para reativar.";

test("com a sessão aberta, a dona vai para o aviso de empresa suspensa, sem navegação, com o WhatsApp do suporte, e consegue sair", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  for (const url of ["/agenda", "/clientes", "/financeiro"]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/empresa$/);
    await expect(erroGeral(page, MENSAGEM)).toBeVisible();
  }
  // Sem a navegação (que só voltaria para cá) e com o WhatsApp do suporte (número fictício do teste).
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "WhatsApp do suporte" })).toHaveAttribute(
    "href",
    "https://wa.me/5511900000000",
  );
  await tocar(page.getByRole("button", { name: "Sair" }));
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("sem sessão", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("o login da dona de empresa suspensa mostra o aviso e não entra", { tag: "@um-perfil" }, async ({
    page,
    tocar,
    dona,
  }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(dona.email);
    await page.getByLabel("Senha").fill(dona.senha);
    await tocar(page.getByRole("button", { name: "Entrar" }));
    await expect(erroGeral(page, MENSAGEM)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
