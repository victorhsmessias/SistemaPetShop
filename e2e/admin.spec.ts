import { randomBytes, randomUUID } from "node:crypto";

import type { Browser, Locator, Page } from "@playwright/test";
import { Pool } from "pg";

import { adminPreparado, PREFIXO_DO_PAINEL } from "./donas";
import { donaDoArquivo, expect, test } from "./tela";

// Painel do administrador (desktop basta: é o computador do suporte). O navegador começa com a sessão do
// administrador; as donas-alvo são as 2 do arquivo (e2e/preparar.ts), cada uma num contexto próprio, como outro
// aparelho. As empresas criadas aqui começam com PREFIXO_DO_PAINEL e são apagadas no fim pelo globalSetup.

test.use({ storageState: adminPreparado().sessao });

/** O cartão da empresa na lista do painel. */
function cartaoDaEmpresa(page: Page, nome: string): Locator {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: nome, exact: true }) });
}

/** Abre o `<summary>` (o texto é igual ao do botão de enviar, por isso não é buscado por papel). */
async function abrir(area: Locator | Page, resumo: string) {
  await area.locator("summary", { hasText: resumo }).click();
}

/** Outro aparelho da dona, já com a sessão dela aberta e a agenda na tela. */
async function aparelhoDaDona(browser: Browser, sessao: string): Promise<Page> {
  const contexto = await browser.newContext({ storageState: sessao, viewport: { width: 1440, height: 900 } });
  const aparelho = await contexto.newPage();
  await aparelho.goto("/agenda");
  await expect(aparelho.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
  return aparelho;
}

test("o administrador cria uma empresa com a dona, e o formulário é limpo depois", { tag: "@desktop" }, async ({
  page,
}) => {
  const nome = `${PREFIXO_DO_PAINEL} ${randomUUID().slice(0, 8)}`;
  const email = `dona-painel-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`;
  await page.goto("/admin");
  await abrir(page, "Nova empresa");
  const formulario = page.locator("details", { has: page.locator("summary", { hasText: "Nova empresa" }) });
  await formulario.getByLabel("Nome da empresa").fill(nome);
  await formulario.getByLabel("Nome da dona").fill("Dona do painel");
  await formulario.getByLabel("E-mail da dona").fill(email);
  await formulario.getByLabel("Senha provisória").fill(`e2e-${randomBytes(6).toString("hex")}`);
  await formulario.getByRole("button", { name: "Criar empresa e dona" }).click();

  await expect(formulario.getByRole("status")).toHaveText("Empresa e dona criadas. Passe a senha provisória para a dona.");
  await expect(formulario.getByLabel("Nome da empresa")).toHaveValue("");
  await expect(formulario.getByLabel("Senha provisória")).toHaveValue("");
  const cartao = cartaoDaEmpresa(page, nome);
  await expect(cartao).toContainText("ativa");
  await expect(cartao).toContainText(email);
});

test("o e-mail já em uso mostra a mensagem e mantém o que foi digitado (B2)", { tag: "@desktop" }, async ({
  page,
  dona,
}) => {
  const nome = `${PREFIXO_DO_PAINEL} ${randomUUID().slice(0, 8)}`;
  const senha = `e2e-${randomBytes(6).toString("hex")}`;
  await page.goto("/admin");
  await abrir(page, "Nova empresa");
  const formulario = page.locator("details", { has: page.locator("summary", { hasText: "Nova empresa" }) });
  await formulario.getByLabel("Nome da empresa").fill(nome);
  await formulario.getByLabel("Fuso horário").selectOption("America/Manaus");
  await formulario.getByLabel("Nome da dona").fill("Dona repetida");
  await formulario.getByLabel("E-mail da dona").fill(dona.email);
  await formulario.getByLabel("Senha provisória").fill(senha);
  await formulario.getByRole("button", { name: "Criar empresa e dona" }).click();

  await expect(formulario.getByRole("status")).toHaveText("Este e-mail já está em uso.");
  await expect(formulario.getByLabel("Nome da empresa")).toHaveValue(nome);
  await expect(formulario.getByLabel("Fuso horário")).toHaveValue("America/Manaus");
  await expect(formulario.getByLabel("Nome da dona")).toHaveValue("Dona repetida");
  await expect(formulario.getByLabel("E-mail da dona")).toHaveValue(dona.email);
  await expect(formulario.getByLabel("Senha provisória")).toHaveValue(senha);
  await expect(cartaoDaEmpresa(page, nome)).toHaveCount(0);
});

test("senha provisória acima de 128 caracteres: erro no campo, nada é criado e o que foi digitado fica", {
  tag: "@desktop",
}, async ({ page }) => {
  const nome = `${PREFIXO_DO_PAINEL} ${randomUUID().slice(0, 8)}`;
  const email = `dona-painel-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`;
  const senha = "s".repeat(129);
  await page.goto("/admin");
  await abrir(page, "Nova empresa");
  const formulario = page.locator("details", { has: page.locator("summary", { hasText: "Nova empresa" }) });
  await formulario.getByLabel("Nome da empresa").fill(nome);
  await formulario.getByLabel("Nome da dona").fill("Dona da senha longa");
  await formulario.getByLabel("E-mail da dona").fill(email);
  await formulario.getByLabel("Senha provisória").fill(senha);
  await formulario.getByRole("button", { name: "Criar empresa e dona" }).click();

  const campoSenha = formulario.getByLabel("Senha provisória");
  await expect(campoSenha).toHaveAccessibleDescription(/A senha pode ter no máximo 128 caracteres\./);
  await expect(campoSenha).toHaveAttribute("aria-invalid", "true");
  await expect(campoSenha).toHaveValue(senha);
  await expect(formulario.getByLabel("Nome da empresa")).toHaveValue(nome);
  await expect(formulario.getByLabel("E-mail da dona")).toHaveValue(email);
  await expect(cartaoDaEmpresa(page, nome)).toHaveCount(0);
});

/**
 * Outra transação cadastra o mesmo e-mail ao mesmo tempo, sem confirmar até `confirmar()`: a conferência do painel
 * não a vê, a empresa é criada, e a criação da dona esbarra no e-mail único. É a corrida real (duas criações com o
 * mesmo e-mail juntas); nada no app é afrouxado para o teste.
 */
async function emailCadastradoAoMesmoTempo(email: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_MIGRADOR, max: 2 });
  const transacao = await pool.connect();
  await transacao.query("begin");
  await transacao.query(`insert into "user" (name, email, role) values ('Cadastro concorrente', $1, 'admin')`, [email]);
  return {
    empresaExiste: async (nome: string) =>
      (await pool.query("select 1 from empresa where nome = $1", [nome])).rowCount === 1,
    confirmar: () => transacao.query("commit"),
    apagar: async () => {
      await transacao.query("rollback").catch(() => undefined);
      transacao.release();
      await pool.query(`delete from "user" where email = $1`, [email]);
      await pool.end();
    },
  };
}

test("empresa criada sem a dona: o formulário é limpo e aponta para Criar dona na empresa já criada", {
  tag: "@desktop",
}, async ({ page }) => {
  const nome = `${PREFIXO_DO_PAINEL} ${randomUUID().slice(0, 8)}`;
  const email = `dona-painel-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`;
  const concorrente = await emailCadastradoAoMesmoTempo(email);
  try {
    await page.goto("/admin");
    await abrir(page, "Nova empresa");
    const formulario = page.locator("details", { has: page.locator("summary", { hasText: "Nova empresa" }) });
    await formulario.getByLabel("Nome da empresa").fill(nome);
    await formulario.getByLabel("Nome da dona").fill("Dona tardia");
    await formulario.getByLabel("E-mail da dona").fill(email);
    await formulario.getByLabel("Senha provisória").fill(`e2e-${randomBytes(6).toString("hex")}`);
    await formulario.getByRole("button", { name: "Criar empresa e dona" }).click();

    // A empresa já foi gravada; o outro cadastro do e-mail é confirmado, e a dona não pode mais ser criada.
    await expect.poll(() => concorrente.empresaExiste(nome)).toBe(true);
    await concorrente.confirmar();

    const mensagem = formulario.getByRole("status");
    await expect(mensagem).toContainText("Empresa criada, mas a dona não");
    await expect(mensagem).toContainText(`Crie a dona em "Criar dona", no cartão da empresa.`);
    // Limpo: reenviar não cria outra empresa.
    await expect(formulario.getByLabel("Nome da empresa")).toHaveValue("");
    await expect(formulario.getByLabel("Senha provisória")).toHaveValue("");

    await mensagem.getByRole("link", { name: `Ir para ${nome}` }).click();
    const cartao = cartaoDaEmpresa(page, nome);
    await expect(cartao).toContainText("Esta empresa ainda não tem usuária.");
    const outroEmail = `dona-painel-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`;
    await abrir(cartao, "Criar dona");
    await cartao.getByLabel("Nome da dona").fill("Dona tardia");
    await cartao.getByLabel("E-mail da dona").fill(outroEmail);
    await cartao.getByLabel("Senha provisória").fill(`e2e-${randomBytes(6).toString("hex")}`);
    await cartao.getByRole("button", { name: "Criar dona" }).click();
    await expect(cartao).toContainText(outroEmail);
    await expect(page.getByRole("heading", { level: 2, name: nome, exact: true })).toHaveCount(1);
  } finally {
    await concorrente.apagar();
  }
});

test("encerrar as sessões desconecta a dona do outro aparelho", { tag: "@desktop" }, async ({ page, browser, dona }) => {
  const aparelho = await aparelhoDaDona(browser, dona.sessao!);

  await page.goto("/admin");
  const cartao = cartaoDaEmpresa(page, "[teste] Ponta a ponta admin-desktop");
  await abrir(cartao, "Encerrar sessões");
  await cartao.getByRole("button", { name: "Encerrar sessões" }).click();
  await expect(cartao.getByRole("status")).toHaveText("Sessões encerradas. A usuária precisa entrar de novo.");

  await aparelho.goto("/agenda");
  await expect(aparelho).toHaveURL(/\/login$/);
  await aparelho.context().close();
});

test("redefinir a senha também desconecta a dona do outro aparelho", { tag: "@desktop" }, async ({
  page,
  browser,
}, testInfo) => {
  const dona = donaDoArquivo(testInfo, 2);
  const aparelho = await aparelhoDaDona(browser, dona.sessao!);

  await page.goto("/admin");
  const cartao = cartaoDaEmpresa(page, "[teste] Ponta a ponta admin-desktop-2");
  await abrir(cartao, "Redefinir senha");
  await cartao.getByLabel("Nova senha").fill(`e2e-${randomBytes(6).toString("hex")}`);
  await cartao.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(cartao.getByRole("status")).toHaveText(
    "Senha redefinida e sessões abertas encerradas. Passe a nova senha para a usuária.",
  );
  await expect(cartao.getByLabel("Nova senha")).toHaveValue("");

  await aparelho.goto("/agenda");
  await expect(aparelho).toHaveURL(/\/login$/);
  await aparelho.context().close();
});
