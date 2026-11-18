import type { Locator } from "@playwright/test";

import { rotuloDoDia } from "@/modules/agenda/fuso";

import { diaDaqui, expect, statusAtual, test } from "./tela";

// A dona, no iPhone e no desktop, na agenda (critério de "pronto" da sessão 04): agenda um pet com dois serviços,
// vê o bloco no horário certo no dia e na semana, recebe o aviso de horário ocupado e acompanha o
// status até "pronto", desfazendo um toque errado. Um dia no futuro, aberto por ?dia=, para o
// teste não depender de hoje (nem falhar perto da meia-noite).

const DIA = diaDaqui(14);
const PX_POR_MIN = 2;
const INICIO_DA_GRADE_MIN = 7 * 60;

/** Posição do bloco dentro da grade, em px: confere horário e duração pelo desenho. */
async function posicaoNaGrade(bloco: Locator) {
  return bloco.evaluate((el) => {
    const grade = el.parentElement!.getBoundingClientRect();
    const caixa = el.getBoundingClientRect();
    return { topo: caixa.top - grade.top, altura: caixa.height, esquerda: caixa.left - grade.left, largura: caixa.width };
  });
}

test("a dona agenda com dois serviços, vê o bloco no dia e na semana, é avisada do horário ocupado e leva o atendimento até pronto", {
  tag: "@meia-noite",
}, async ({ page, tocar }) => {
  const tocarStatus = async (botao: string, statusEsperado: string) => {
    await tocar(page.getByRole("button", { name: botao }));
    await expect(statusAtual(page)).toHaveText(statusEsperado);
    await expect(statusAtual(page)).toHaveAccessibleName(`Status: ${statusEsperado}`);
  };

  await page.goto(`/agenda?dia=${DIA}`);
  await expect(page.getByText(rotuloDoDia(DIA))).toBeVisible();

  // Toca no horário vazio das 9h. O pet ainda não existe: o atalho cadastra tutor e pet e volta.
  await tocar(page.getByRole("link", { name: "Agendar às 09:00" }));
  await expect(page.getByText(`${rotuloDoDia(DIA)}, 09:00`)).toBeVisible();
  await tocar(page.getByRole("link", { name: "Cadastrar tutor e pet" }));
  await page.getByLabel("Nome do tutor").fill("Joana Prado");
  await page.getByLabel("Telefone (WhatsApp)").fill("(21) 97766-5544");
  await tocar(page.getByRole("button", { name: "Salvar cliente" }));
  await page.getByLabel("Nome do pet").fill("Thor");
  await page.getByRole("radio", { name: "Grande (G)" }).check();
  await page.getByLabel("Cuidados: comportamento e alergias").fill("Alérgico a xampu de aveia.");
  await tocar(page.getByRole("button", { name: "Salvar pet" }));

  // De volta ao agendamento, com o Thor escolhido, o dia e a hora preenchidos.
  await expect(page).toHaveURL(new RegExp(`/agenda/novo\\?dia=${DIA}&hora=09%3A00&pet=`));
  await expect(page.getByRole("heading", { level: 2, name: "Thor" })).toBeVisible();
  await expect(page.getByLabel("Hora")).toHaveValue("09:00");

  // Dois serviços; o preço da hidratação é ajustado na hora.
  await page.getByRole("checkbox", { name: /Banho M/ }).check();
  await page.getByRole("checkbox", { name: /Hidratação/ }).check();
  await expect(page.getByLabel("Preço de Hidratação (R$)")).toHaveValue("30,00");
  await page.getByLabel("Preço de Hidratação (R$)").fill("32,00");
  await tocar(page.getByRole("button", { name: "Agendar", exact: true }));

  // O bloco aparece às 9h, com 90 minutos de altura (2 px por minuto), na largura toda.
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${DIA}$`));
  const thor = page.getByRole("link", { name: /^Thor · Joana Prado/ });
  await expect(thor).toContainText("Agendado · 09:00–10:30");
  await expect(thor).toContainText("Alérgico a xampu de aveia.");
  await expect(thor).toContainText("Banho M, Hidratação");
  const posicao = await posicaoNaGrade(thor);
  expect(posicao.topo).toBeCloseTo((9 * 60 - INICIO_DA_GRADE_MIN) * PX_POR_MIN, 0);
  expect(posicao.altura).toBeCloseTo(90 * PX_POR_MIN, 0);

  // Na semana, o dia mostra o bloco; tocar no dia abre a agenda do dia.
  await tocar(page.getByRole("link", { name: "Semana" }));
  const diaNaSemana = page.getByRole("link", { name: `${rotuloDoDia(DIA)}: 1 atendimento` });
  await expect(diaNaSemana).toContainText("09:00 ⚠ Thor");
  await tocar(diaNaSemana);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${DIA}$`));

  // Agendar a Mel por cima do Thor: aviso, não bloqueio. O horário ocupado fica coberto pelo bloco,
  // então ela usa o botão de novo agendamento e digita a hora.
  await tocar(page.getByRole("link", { name: "Novo agendamento" }));
  await page.getByLabel("Buscar pelo nome do pet ou do tutor").fill("rita");
  await tocar(page.getByRole("list", { name: "Pets" }).getByRole("link", { name: /Mel/ }));
  await page.getByLabel("Hora").fill("09:30");
  await page.getByRole("checkbox", { name: /Hidratação/ }).check();
  await tocar(page.getByRole("button", { name: "Agendar", exact: true }));
  const aviso = page.getByRole("alert").filter({ hasText: "Horário ocupado" });
  await expect(aviso).toContainText("09:00–10:30 · Thor (Joana Prado)");
  await expect(page.getByRole("checkbox", { name: /Hidratação/ })).toBeChecked();
  await tocar(page.getByRole("button", { name: "Agendar mesmo assim" }));

  // Os dois ficam lado a lado, nenhum escondido.
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${DIA}$`));
  const mel = page.getByRole("link", { name: /^Mel · Rita Moreira/ });
  await expect(mel).toContainText("09:30–10:00");
  const [lado1, lado2] = [await posicaoNaGrade(thor), await posicaoNaGrade(mel)];
  expect(lado1.esquerda + lado1.largura).toBeLessThanOrEqual(lado2.esquerda);

  // Status: confirmar, desfazer o toque errado, e seguir até pronto.
  await tocar(thor);
  await expect(page.getByRole("heading", { level: 1, name: "Thor" })).toBeVisible();
  await tocarStatus("Confirmar", "Confirmado");
  await tocarStatus("Desfazer: voltar para Agendado", "Agendado");
  await tocarStatus("Confirmar", "Confirmado");
  await tocarStatus("Começar o atendimento", "Em atendimento");
  await tocarStatus("Marcar como pronto", "Pronto");
  await expect(page.getByRole("button", { name: "Desfazer: voltar para Em atendimento" })).toBeVisible();

  await tocar(page.getByRole("link", { name: "Voltar para Agenda" }));
  await expect(thor).toContainText("Pronto · 09:00–10:30");
});
