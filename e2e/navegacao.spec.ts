import { mesDoDia, rotuloDiaMes, rotuloDoDia, rotuloDoMes, segundaDaSemana, somarDias, somarMeses } from "@/modules/agenda/fuso";

import { expect, hoje, test } from "./tela";

// Navegação de dias, semanas e meses (iPhone). "Hoje", "Esta semana" e "Este mês" vêm do relógio do servidor do
// teste (e2e/relogio.mjs), no fuso da empresa; o teste calcula o esperado pelo mesmo relógio.

test("a dona anda pelos dias e volta para hoje", { tag: "@um-perfil" }, async ({ page, tocar }) => {
  const dias = page.getByRole("navigation", { name: "Dias" });
  await page.goto("/agenda");
  await expect(dias).toContainText(rotuloDoDia(hoje()));
  await expect(dias.getByText("Hoje", { exact: true })).toBeVisible();

  await tocar(dias.getByRole("link", { name: "Próximo dia" }));
  await expect(dias).toContainText(rotuloDoDia(somarDias(hoje(), 1)));
  await tocar(dias.getByRole("link", { name: "Próximo dia" }));
  await expect(dias).toContainText(rotuloDoDia(somarDias(hoje(), 2)));
  await tocar(dias.getByRole("link", { name: "Voltar para hoje" }));
  await expect(dias.getByText("Hoje", { exact: true })).toBeVisible();

  await tocar(dias.getByRole("link", { name: "Dia anterior" }));
  await expect(dias).toContainText(rotuloDoDia(somarDias(hoje(), -1)));
  await expect(dias.getByRole("link", { name: "Voltar para hoje" })).toBeVisible();
});

test("a dona anda pelas semanas e volta para esta semana", { tag: "@um-perfil" }, async ({ page, tocar }) => {
  const semanas = page.getByRole("navigation", { name: "Semanas" });
  const segunda = segundaDaSemana(hoje());
  const titulo = (inicio: string) => `${rotuloDiaMes(inicio)} a ${rotuloDiaMes(somarDias(inicio, 6))}`;
  await page.goto("/agenda");
  await tocar(page.getByRole("link", { name: "Semana" }));
  await expect(semanas).toContainText(titulo(segunda));
  await expect(semanas.getByText("Esta semana", { exact: true })).toBeVisible();

  await tocar(semanas.getByRole("link", { name: "Próxima semana" }));
  await expect(semanas).toContainText(titulo(somarDias(segunda, 7)));
  await tocar(semanas.getByRole("link", { name: "Voltar para esta semana" }));
  await expect(semanas.getByText("Esta semana", { exact: true })).toBeVisible();
  await tocar(semanas.getByRole("link", { name: "Semana anterior" }));
  await expect(semanas).toContainText(titulo(somarDias(segunda, -7)));

  // "Dia" volta para a agenda do dia.
  await tocar(page.getByRole("link", { name: "Dia", exact: true }));
  await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
});

test("a dona anda pelos meses do Financeiro; o mês sem receita diz que não há", { tag: "@um-perfil" }, async ({
  page,
  tocar,
}) => {
  const meses = page.getByRole("navigation", { name: "Meses" });
  const mes = mesDoDia(hoje());
  await page.goto("/financeiro");
  await expect(meses).toContainText(rotuloDoMes(mes));
  await expect(meses.getByText("Este mês", { exact: true })).toBeVisible();
  await expect(page.getByText(`Nenhuma receita em ${rotuloDoMes(mes)}.`)).toBeVisible();

  await tocar(meses.getByRole("link", { name: "Mês anterior" }));
  const anterior = rotuloDoMes(somarMeses(mes, -1));
  await expect(meses).toContainText(anterior);
  await expect(page.getByRole("region", { name: `Entrou em ${anterior}` })).toContainText(/R\$\s0,00/);
  await expect(page.getByText(`Nenhuma receita em ${anterior}.`)).toBeVisible();

  await tocar(meses.getByRole("link", { name: "Voltar para este mês" }));
  await expect(meses.getByText("Este mês", { exact: true })).toBeVisible();
  await tocar(meses.getByRole("link", { name: "Próximo mês" }));
  await expect(meses).toContainText(rotuloDoMes(somarMeses(mes, 1)));
});
