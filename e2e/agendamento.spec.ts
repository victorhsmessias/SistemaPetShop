import { rotuloDoDia } from "@/modules/agenda/fuso";

import { agendar, diaDaqui, erroGeral, expect, test } from "./tela";

// Novo agendamento (iPhone): o atalho ?agendar= com valor inválido segue o fluxo normal do cadastro, a validação
// mostra a mensagem no campo e mantém o que foi digitado, e mudar a hora depois do aviso de horário ocupado avisa
// de novo. A empresa tem "Banho M", "Hidratação" e a pet Mel (e2e/preparar.ts).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

test("o atalho ?agendar= inválido não leva a outro endereço: o cadastro segue o fluxo normal", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  // Um endereço externo: depois do tutor, a dona fica na página dele, como no cadastro comum.
  await page.goto(`/clientes/novo?agendar=${encodeURIComponent("https://exemplo.invalido/agenda")}`);
  await page.getByLabel("Nome do tutor").fill("Paula Atalho");
  await page.getByLabel("Telefone (WhatsApp)").fill("(61) 99111-2233");
  await tocar(page.getByRole("button", { name: "Salvar cliente" }));
  await expect(page).toHaveURL(new RegExp(`/clientes/${UUID}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Paula Atalho" })).toBeVisible();

  // Hora inválida (T25:00): o dia vale, a hora é ignorada; o pet volta para o agendamento sem hora.
  const dia = diaDaqui(30);
  await page.goto(`/clientes/novo?agendar=${dia}T25:00`);
  await page.getByLabel("Nome do tutor").fill("Pedro Atalho");
  await page.getByLabel("Telefone (WhatsApp)").fill("(61) 99111-4455");
  await tocar(page.getByRole("button", { name: "Salvar cliente" }));
  await expect(page).toHaveURL(new RegExp(`/clientes/${UUID}/pets/novo\\?agendar=${dia}$`));
  await page.getByLabel("Nome do pet").fill("Bolinha");
  await page.getByLabel("Porte").selectOption({ label: "Pequeno (P)" });
  await tocar(page.getByRole("button", { name: "Salvar pet" }));
  await expect(page).toHaveURL(new RegExp(`/agenda/novo\\?dia=${dia}&pet=${UUID}$`));
  await expect(page.getByRole("heading", { level: 2, name: "Bolinha" })).toBeVisible();
  await expect(page.getByLabel("Hora")).toHaveValue("");
});

test("cada erro do agendamento aparece no campo e mantém serviços, hora e observações", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  const dia = diaDaqui(31);
  await page.goto(`/agenda/novo?dia=${dia}`);
  await page.getByLabel("Buscar pelo nome do pet ou do tutor").fill("mel");
  await tocar(page.getByRole("button", { name: "Buscar" }));
  await tocar(page.getByRole("list", { name: "Pets" }).getByRole("link", { name: /Mel/ }));
  const agendarBotao = page.getByRole("button", { name: "Agendar", exact: true });
  const hora = page.getByLabel("Hora");
  const servicos = page.getByRole("group", { name: "Serviços" });
  const observacoes = page.getByLabel("Observações (opcional)");

  // Sem serviço e sem hora: as duas mensagens; as observações ficam.
  await observacoes.fill("Chega às 9h em ponto.");
  await tocar(agendarBotao);
  await expect(hora).toHaveAccessibleDescription(/Informe a hora/);
  await expect(servicos).toHaveAccessibleDescription(/Escolha pelo menos um serviço/);
  await expect(observacoes).toHaveValue("Chega às 9h em ponto.");

  // Dia fora dos anos aceitos: mensagem no dia; serviço marcado e hora ficam.
  await expect(agendarBotao).toBeEnabled();
  await hora.fill("09:30");
  await servicos.getByRole("checkbox", { name: /Banho M/ }).check();
  await page.getByLabel("Dia").fill("2101-01-10");
  await tocar(agendarBotao);
  await expect(page.getByLabel("Dia")).toHaveAccessibleDescription(/Use um dia entre 2000 e 2100/);
  await expect(hora).toHaveValue("09:30");
  await expect(servicos.getByRole("checkbox", { name: /Banho M/ })).toBeChecked();
  await expect(observacoes).toHaveValue("Chega às 9h em ponto.");

  // Preço com ponto: mensagem no preço do serviço.
  await expect(agendarBotao).toBeEnabled();
  await page.getByLabel("Dia").fill(dia);
  await page.getByLabel("Preço de Banho M (R$)").fill("50.00");
  await tocar(agendarBotao);
  await expect(page.getByLabel("Preço de Banho M (R$)")).toHaveAccessibleDescription(/Use vírgula para os centavos/);
  await expect(hora).toHaveValue("09:30");

  // Corrigido: agenda e volta para o dia.
  await expect(agendarBotao).toBeEnabled();
  await page.getByLabel("Preço de Banho M (R$)").fill("50,00");
  await tocar(agendarBotao);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${dia}$`));
  await expect(page.getByRole("link", { name: /^Mel · / })).toContainText("09:30–10:30");
});

test("mudar a hora depois do aviso de horário ocupado avisa de novo", { tag: "@um-perfil" }, async ({ page, tocar }) => {
  const dia = diaDaqui(32);
  await agendar(page, tocar, { dia, hora: "09:00", servicos: ["Banho M"] });

  // Mel de novo às 09:30: o aviso aparece.
  await page.goto(`/agenda/novo?dia=${dia}`);
  await expect(page.getByText(rotuloDoDia(dia))).toBeVisible();
  await page.getByLabel("Buscar pelo nome do pet ou do tutor").fill("mel");
  await tocar(page.getByRole("button", { name: "Buscar" }));
  await tocar(page.getByRole("list", { name: "Pets" }).getByRole("link", { name: /Mel/ }));
  await page.getByLabel("Hora").fill("09:30");
  await page.getByRole("checkbox", { name: /Hidratação/ }).check();
  await tocar(page.getByRole("button", { name: "Agendar", exact: true }));
  const aviso = erroGeral(page, "Horário ocupado");
  await expect(aviso).toContainText("09:00–10:00 · Mel (Rita Moreira)");

  // Ela muda a hora (ainda ocupada) e toca "Agendar mesmo assim": o aviso confirmado era de outro horário, então
  // avisa de novo, e nada é gravado.
  const mesmoAssim = page.getByRole("button", { name: "Agendar mesmo assim" });
  await expect(mesmoAssim).toBeEnabled();
  await page.getByLabel("Hora").fill("09:45");
  await tocar(mesmoAssim);
  await expect(page).toHaveURL(/\/agenda\/novo/);
  await expect(aviso).toContainText("09:00–10:00 · Mel (Rita Moreira)");
  await expect(page.getByLabel("Hora")).toHaveValue("09:45");

  // Confirmando o horário novo, agenda.
  await expect(mesmoAssim).toBeEnabled();
  await tocar(mesmoAssim);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${dia}$`));
  await expect(page.getByRole("link", { name: /^Mel · / })).toHaveCount(2);
});
