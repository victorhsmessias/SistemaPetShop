import type { Locator, Page } from "@playwright/test";

import { agendar, blocoNaGrade, diaDaqui, erroGeral, expect, statusAtual, test } from "./tela";

// Página desatualizada e toque duplo (iPhone, duas abas no mesmo navegador, como a dona com a tela aberta no
// iPhone e outra no computador). O servidor recusa a mudança feita sobre o que a tela mostrava; depois do aviso, a
// tela passa a mostrar o atual, porque o app instalado no iPhone não tem botão de recarregar (B1 do QA).

const MENSAGEM_MUDOU = "Este atendimento acabou de ser alterado (talvez num toque repetido ou em outra tela). Confira e tente de novo.";

/** Agenda a Mel e devolve a URL da página do atendimento. */
async function atendimentoDaMel(page: Page, tocar: (alvo: Locator) => Promise<void>, dia: string, servicos: string[]) {
  await agendar(page, tocar, { dia, hora: "10:00", servicos });
  await tocar(blocoNaGrade(page, "Mel"));
  await expect(page.getByRole("heading", { level: 1, name: "Mel" })).toBeVisible();
  return page.url();
}

test("na aba desatualizada, mudar o status mostra o aviso, não grava e passa a mostrar o status atual", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  const url = await atendimentoDaMel(page, tocar, diaDaqui(50), ["Banho M"]);
  await tocar(page.getByRole("button", { name: "Confirmar" }));
  await expect(statusAtual(page)).toHaveText("Confirmado");

  // A segunda aba abre com "Confirmado"; na primeira, a dona começa o atendimento.
  const outraAba = await page.context().newPage();
  await outraAba.goto(url);
  await expect(statusAtual(outraAba)).toHaveText("Confirmado");
  await tocar(page.getByRole("button", { name: "Começar o atendimento" }));
  await expect(statusAtual(page)).toHaveText("Em atendimento");

  // Na aba desatualizada, "Cancelar": o aviso aparece, nada é gravado e a tela mostra o atual, com os botões dele.
  await tocar(outraAba.getByRole("button", { name: "Cancelar", exact: true }));
  await expect(erroGeral(outraAba, MENSAGEM_MUDOU)).toBeVisible();
  await expect(statusAtual(outraAba)).toHaveText("Em atendimento");
  await expect(outraAba.getByRole("button", { name: "Marcar como pronto" })).toBeVisible();
  await expect(outraAba.getByRole("button", { name: "Começar o atendimento" })).toHaveCount(0);

  // O próximo toque já parte do status certo e grava.
  await tocar(outraAba.getByRole("button", { name: "Marcar como pronto" }));
  await expect(statusAtual(outraAba)).toHaveText("Pronto");
  await page.reload();
  await expect(statusAtual(page)).toHaveText("Pronto");
});

test("na aba desatualizada, concluir com o total antigo mostra o aviso e passa a mostrar o total novo", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  const url = await atendimentoDaMel(page, tocar, diaDaqui(51), ["Banho M"]);
  const outraAba = await page.context().newPage();
  await outraAba.goto(url);
  await expect(outraAba.getByRole("button", { name: /^Concluir · R\$\s50,00$/ })).toBeVisible();

  // Na primeira aba, a dona acrescenta a hidratação: o total vai a R$ 80,00.
  await tocar(page.getByRole("link", { name: "Editar serviços, horário e observações" }));
  await page.getByRole("checkbox", { name: /Hidratação/ }).check();
  await tocar(page.getByRole("button", { name: "Salvar serviços" }));
  await expect(page.getByRole("button", { name: /^Concluir · R\$\s80,00$/ })).toBeVisible();

  // Na aba desatualizada, concluir com R$ 50,00 em Pix: o aviso do total, nada é gravado, e a tela mostra R$ 80,00.
  await tocar(outraAba.getByRole("button", { name: /^Concluir · R\$\s50,00$/ }));
  await tocar(outraAba.getByRole("button", { name: "Pix", exact: true }));
  await expect(erroGeral(outraAba, /O total mudou para R\$\s80,00/)).toBeVisible();
  await expect(statusAtual(outraAba)).toHaveText("Agendado");
  const concluir = outraAba.getByRole("region", { name: "Concluir o atendimento" });
  await expect(concluir).toContainText(/R\$\s80,00/);
  await expect(concluir).not.toContainText(/R\$\s50,00/);
  await expect(outraAba.getByText(/^Total: R\$\s80,00$/)).toBeVisible();

  // Conferido, ela conclui com o total certo.
  await tocar(outraAba.getByRole("button", { name: "Pix", exact: true }));
  await expect(statusAtual(outraAba)).toHaveText("Concluído");
  await expect(outraAba.getByRole("region", { name: "Receita" })).toContainText(/R\$\s80,00/);
});

test("toque duplo em Confirmar e em Pix grava uma vez só", { tag: "@um-perfil" }, async ({ page, tocar }) => {
  await atendimentoDaMel(page, tocar, diaDaqui(52), ["Banho M"]);

  // Dois cliques seguidos, antes de a tela reagir (o dedo que treme).
  const toqueDuplo = (nome: string) =>
    page.getByRole("button", { name: nome, exact: true }).evaluate((botao: HTMLButtonElement) => {
      botao.click();
      botao.click();
    });

  await toqueDuplo("Confirmar");
  await expect(statusAtual(page)).toHaveText("Confirmado");
  await expect(page.getByRole("button", { name: "Desfazer: voltar para Agendado" })).toBeVisible();

  await tocar(page.getByRole("button", { name: /^Concluir · R\$\s50,00$/ }));
  await toqueDuplo("Pix");
  await expect(statusAtual(page)).toHaveText("Concluído");

  // Uma receita de R$ 50,00 só (a de R$ 80,00 é do teste anterior, na mesma empresa).
  await page.goto("/financeiro");
  const receitas = page.getByRole("list", { name: /^Receitas de / }).getByRole("link");
  await expect(receitas.filter({ hasText: /R\$\s50,00/ })).toHaveCount(1);
});
