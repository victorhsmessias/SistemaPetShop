import { expect, test, type Page } from "@playwright/test";

import { hojeNoFuso, rotuloDoDia } from "@/modules/agenda/fuso";

import { agoraDoRelogio } from "./relogio.mjs";

// A dona, num iPhone, conclui o atendimento com pagamento (critério de "pronto" da sessão 05): agenda, conclui
// com Pix, vê a receita na página do atendimento, no Financeiro e em "Recebido hoje", e desfaz a conclusão
// com motivo. O agendamento usa um dia fixo, aberto por ?dia=. A receita é do dia em que ela conclui (hoje,
// no fuso da empresa, que é o padrão America/Sao_Paulo). O servidor roda com o relógio do teste (e2e/relogio.mjs:
// 12:00 por padrão; 23:50 e 00:10 no test:e2e:meia-noite, com o servidor em UTC), e a data esperada é calculada
// pelo mesmo relógio, como no app.

const DIA = "2026-12-03"; // quinta-feira
const FUSO_DA_EMPRESA = "America/Sao_Paulo";
const VALOR = /R\$\s80,00/;

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.E2E_FINANCEIRO_EMAIL!);
  await page.getByLabel("Senha").fill(process.env.E2E_FINANCEIRO_SENHA!);
  await page.getByRole("button", { name: "Entrar" }).tap();
  await expect(page).toHaveURL(/\/agenda$/);
}

test("a dona agenda, conclui com Pix e vê a receita no atendimento, no Financeiro e em Recebido hoje; depois desfaz com motivo", async ({
  page,
}) => {
  await entrar(page);
  await expect(page.getByRole("link", { name: /Recebido hoje/ })).toContainText(/R\$\s0,00/);

  // Agendar a Mel com banho (R$ 50,00) e hidratação (R$ 30,00).
  await page.goto(`/agenda?dia=${DIA}`);
  await page.getByRole("link", { name: "Novo agendamento" }).tap();
  await page.getByLabel("Buscar pelo nome do pet ou do tutor").fill("mel");
  await page.getByRole("button", { name: "Buscar" }).tap();
  await page.getByRole("list", { name: "Pets" }).getByRole("link", { name: /Mel/ }).tap();
  await page.getByLabel("Hora").fill("10:00");
  await page.getByRole("checkbox", { name: /Banho M/ }).check();
  await page.getByRole("checkbox", { name: /Hidratação/ }).check();
  await page.getByRole("button", { name: "Agendar", exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${DIA}$`));

  // Concluir: o botão mostra o total; um toque em Pix conclui.
  const mel = page.getByRole("link", { name: /^Mel · Rita Moreira/ });
  await mel.tap();
  await expect(page.getByRole("heading", { level: 1, name: "Mel" })).toBeVisible();
  const concluir = page.getByRole("button", { name: /^Concluir · R\$\s80,00$/ });
  await concluir.tap();
  await expect(page.getByRole("group", { name: /Recebido R\$\s80,00 em:/ })).toBeVisible();
  await page.getByRole("button", { name: "Pix", exact: true }).tap();

  await expect(page.locator(".etiqueta-status")).toHaveText("Concluído");
  const receita = page.getByRole("region", { name: "Receita" });
  await expect(receita).toContainText(VALOR);
  await expect(receita).toContainText("Pix");
  await expect(receita).toContainText(rotuloDoDia(hojeNoFuso(FUSO_DA_EMPRESA, agoraDoRelogio())));
  await expect(page.getByRole("button", { name: /^Concluir/ })).toHaveCount(0);

  // Na agenda, o concluído continua na grade, com a marca de concluído.
  await page.getByRole("link", { name: "‹ Agenda" }).tap();
  await expect(mel).toContainText("✓ Concluído · 10:00–11:30");

  // No Financeiro: hoje e o mês com R$ 80,00 e um atendimento concluído; a receita na lista.
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Financeiro" }).tap();
  await expect(page).toHaveURL(/\/financeiro$/);
  const hoje = page.getByRole("region", { name: "Hoje" });
  await expect(hoje).toContainText(VALOR);
  await expect(hoje).toContainText("1 atendimento concluído");
  await expect(page.getByRole("region", { name: /^Entrou em / })).toContainText(VALOR);
  const linha = page.getByRole("list", { name: /^Receitas de / }).getByRole("link", { name: /Mel/ });
  await expect(linha).toContainText(VALOR);
  await expect(linha).toContainText("Pix");

  // "Recebido hoje" na agenda do dia.
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Agenda" }).tap();
  await expect(page.getByRole("link", { name: /Recebido hoje/ })).toContainText(VALOR);

  // Desfazer a conclusão: o motivo é obrigatório; a receita sai da soma e aparece cancelada, com o motivo.
  await page.goto(`/agenda?dia=${DIA}`);
  await mel.tap();
  await page.getByRole("button", { name: "Desfazer conclusão" }).tap();
  await page.getByRole("button", { name: "Desfazer e cancelar a receita" }).tap();
  await expect(page.getByText("Informe o motivo: ele fica no cancelamento da receita.")).toBeVisible();
  await page.getByLabel("Motivo (fica no cancelamento da receita)").fill("Era Dinheiro, não Pix");
  await page.getByRole("button", { name: "Desfazer e cancelar a receita" }).tap();
  await expect(page.locator(".etiqueta-status")).toHaveText("Agendado");
  await expect(page.getByRole("button", { name: /^Concluir · R\$\s80,00$/ })).toBeVisible();

  await page.goto("/financeiro");
  await expect(page.getByRole("region", { name: "Hoje" })).toContainText(/R\$\s0,00/);
  await page.getByText("1 receita cancelada (fora da soma)").tap();
  await expect(page.getByRole("list", { name: "Receitas canceladas" })).toContainText("Motivo: Era Dinheiro, não Pix");
});
