import { erroGeral, expect, test } from "./tela";

// Empresa suspensa (iPhone). O painel ainda não suspende (H13, M4): a preparação suspende pelo papel plataforma,
// depois de abrir a sessão da dona (e2e/preparar.ts). Este arquivo faz 1 login pela tela (ver login.spec.ts).

// MENSAGEM: a do login recusado (Better Auth). TEXTO_DA_TELA: a linha do /empresa, abaixo do título "Acesso suspenso".
const MENSAGEM = "O acesso desta empresa está suspenso. Fale com o suporte para reativar.";
const TEXTO_DA_TELA = "Fale com o suporte para reativar. Seus dados continuam guardados.";

test("com a sessão aberta, a dona vai para o aviso de empresa suspensa, sem navegação, com o WhatsApp do suporte, e consegue sair", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  for (const url of ["/agenda", "/clientes", "/financeiro"]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/empresa$/);
    // A mensagem já está na página quando ela abre: sem role="alert" (T17 da revisão).
    await expect(page.getByRole("heading", { level: 1, name: "Acesso suspenso" })).toBeVisible();
    await expect(page.getByText(TEXTO_DA_TELA)).toBeVisible();
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
