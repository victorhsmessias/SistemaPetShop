import { agendar, blocoNaGrade, diaDaqui, expect, statusAtual, test } from "./tela";

// O atendimento depois de agendado: editar horário, serviços e observações (no iPhone e no desktop); cancelar,
// marcar falta e reabrir; concluir com total zero (só no iPhone). A empresa tem "Banho M" (R$ 50,00, 60 min),
// "Hidratação" (R$ 30,00, 30 min) e a pet Mel (e2e/preparar.ts). Cada teste usa um dia diferente.

test("a dona edita o horário (o término acompanha o início), os serviços (fim e total recalculados) e as observações", async ({
  page,
  tocar,
}) => {
  const dia = diaDaqui(20);
  await agendar(page, tocar, { dia, hora: "10:00", servicos: ["Banho M"] });
  await tocar(blocoNaGrade(page, "Mel"));
  await expect(page.getByText("10:00–11:00")).toBeVisible();
  await tocar(page.getByRole("link", { name: "Editar serviços, horário e observações" }));
  await expect(page.getByRole("heading", { level: 1, name: "Editar atendimento" })).toBeVisible();

  // Mudar o início leva o término junto (mantém a duração).
  const inicio = page.getByLabel("Início");
  const termino = page.getByLabel("Término");
  await expect(termino).toHaveValue("11:00");
  await inicio.fill("11:00");
  await expect(termino).toHaveValue("12:00");

  // Término antes do início: a mensagem fica no término, e o início digitado continua.
  await termino.fill("10:30");
  const salvarHorario = page.getByRole("button", { name: "Salvar horário" });
  await tocar(salvarHorario);
  await expect(termino).toHaveAccessibleDescription(/O término precisa ser depois do início/);
  await expect(inicio).toHaveValue("11:00");
  await expect(salvarHorario).toBeEnabled();
  await termino.fill("12:15");
  await tocar(salvarHorario);
  await expect(page.getByRole("heading", { level: 1, name: "Mel" })).toBeVisible();
  await expect(page.getByText("11:00–12:15")).toBeVisible();

  // Serviços: tirar todos é recusado; com a hidratação, o fim é recalculado pela soma (90 min) e o total sobe.
  await tocar(page.getByRole("link", { name: "Editar serviços, horário e observações" }));
  const servicos = page.getByRole("group", { name: "Serviços" });
  await servicos.getByRole("checkbox", { name: /Banho M/ }).uncheck();
  const salvarServicos = page.getByRole("button", { name: "Salvar serviços" });
  await tocar(salvarServicos);
  await expect(servicos).toHaveAccessibleDescription(/Escolha pelo menos um serviço/);
  await expect(salvarServicos).toBeEnabled();
  await servicos.getByRole("checkbox", { name: /Banho M/ }).check();
  await servicos.getByRole("checkbox", { name: /Hidratação/ }).check();
  await tocar(salvarServicos);
  await expect(page.getByText("11:00–12:30")).toBeVisible();
  await expect(page.getByRole("list", { name: "Serviços do atendimento" })).toContainText("Hidratação");
  await expect(page.getByText(/^Total: R\$\s80,00$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Concluir · R\$\s80,00$/ })).toBeVisible();

  // Observações.
  await tocar(page.getByRole("link", { name: "Editar serviços, horário e observações" }));
  await page.getByLabel("Observações do atendimento").fill("Usar toalha extra.");
  await tocar(page.getByRole("button", { name: "Salvar observações" }));
  await expect(page.getByRole("heading", { level: 1, name: "Mel" })).toBeVisible();
  await expect(page.getByText("Usar toalha extra.")).toBeVisible();

  // Na grade, o bloco no novo horário.
  await tocar(page.getByRole("link", { name: "Voltar para Agenda" }));
  await expect(blocoNaGrade(page, "Mel")).toContainText("Agendado · 11:00–12:30");
});

test("a dona cancela, reabre, marca falta e reabre; cancelado e falta saem da grade e só editam observações", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  const dia = diaDaqui(21);
  await agendar(page, tocar, { dia, hora: "14:00", servicos: ["Banho M"] });
  await tocar(blocoNaGrade(page, "Mel"));

  // Cancelar: sem motivo; o desfazer vira "Reabrir".
  await tocar(page.getByRole("button", { name: "Cancelar", exact: true }));
  await expect(statusAtual(page)).toHaveText("Cancelado");
  await expect(page.getByRole("button", { name: /^Concluir/ })).toHaveCount(0);
  await tocar(page.getByRole("link", { name: "Editar observações" }));
  await expect(page.getByText('Atendimento "Cancelado": serviços e horário não mudam.')).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar horário" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar serviços" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar observações" })).toBeVisible();

  // Na agenda do dia: fora da grade, na lista "Cancelados e faltas".
  await page.goto(`/agenda?dia=${dia}`);
  await expect(blocoNaGrade(page, "Mel")).toHaveCount(0);
  await tocar(page.getByText("1 cancelado ou falta"));
  const foraDaGrade = page.getByRole("list", { name: "Cancelados e faltas" });
  await expect(foraDaGrade).toContainText("Mel · Cancelado");
  await tocar(foraDaGrade.getByRole("link", { name: /Mel/ }));

  // Reabrir volta para Agendado; depois confirma e marca falta.
  await tocar(page.getByRole("button", { name: "Reabrir como Agendado" }));
  await expect(statusAtual(page)).toHaveText("Agendado");
  await tocar(page.getByRole("button", { name: "Confirmar" }));
  await expect(statusAtual(page)).toHaveText("Confirmado");
  await tocar(page.getByRole("button", { name: "Marcar falta" }));
  await expect(statusAtual(page)).toHaveText("Faltou");

  // Reabrir a falta volta para Confirmado (deduzido de confirmado_em), e o atendimento volta à grade.
  await tocar(page.getByRole("button", { name: "Reabrir como Confirmado" }));
  await expect(statusAtual(page)).toHaveText("Confirmado");
  await tocar(page.getByRole("link", { name: "Voltar para Agenda" }));
  await expect(blocoNaGrade(page, "Mel")).toContainText("Confirmado · 14:00–15:00");
  await expect(page.getByText(/cancelado ou falta/)).toHaveCount(0);
});

test("com total zero, a dona conclui sem cobrança e o concluído só edita observações", {
  tag: "@um-perfil",
}, async ({ page, tocar }) => {
  await page.goto("/servicos/novo");
  await page.getByLabel("Nome do serviço").fill("Banho cortesia");
  await page.getByLabel("Preço (R$)").fill("0,00");
  await page.getByLabel("Duração (minutos)").fill("30");
  await tocar(page.getByRole("button", { name: "Cadastrar serviço" }));
  await expect(page).toHaveURL(/\/servicos$/);

  const dia = diaDaqui(22);
  await agendar(page, tocar, { dia, hora: "16:00", servicos: ["Banho cortesia"] });
  await tocar(blocoNaGrade(page, "Mel"));
  await expect(page.getByText(/O total é R\$\s0,00: o atendimento é concluído sem receita\./)).toBeVisible();
  await tocar(page.getByRole("button", { name: "Concluir sem cobrança" }));
  await expect(statusAtual(page)).toHaveText("Concluído");
  await expect(page.getByRole("region", { name: "Receita" })).toContainText(
    /Concluído sem receita: o total era R\$\s0,00\./,
  );

  await tocar(page.getByRole("link", { name: "Editar observações" }));
  await expect(page.getByText('Atendimento "Concluído": serviços e horário não mudam.')).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar serviços" })).toHaveCount(0);
});
