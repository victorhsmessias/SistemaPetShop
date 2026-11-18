import { blocoNaGrade, diaDaqui, expect, test } from "./tela";

// "Novo cliente e pet" vindo do agendamento e o aviso de sucesso depois de salvar (sessão 07). A empresa tem
// "Banho M", "Hidratação" e a tutora Rita Moreira ((31) 98888-7777) com a pet Mel (e2e/preparar.ts).

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

test("do horário vazio, Novo cliente e pet: o telefone repetido mantém os dados, e o cadastro volta ao agendamento com o pet e o aviso", async ({
  page,
  tocar,
}) => {
  const dia = diaDaqui(60);
  await page.goto(`/agenda?dia=${dia}`);
  await tocar(page.getByRole("link", { name: "Agendar às 10:00" }));
  await tocar(page.getByRole("link", { name: "Novo cliente e pet" }));
  await expect(page.getByRole("heading", { level: 1, name: "Novo cliente e pet" })).toBeVisible();

  // Telefone de outra cliente: a mensagem diz de quem é, e tudo o que foi digitado continua.
  const nome = page.getByLabel("Nome do tutor");
  const telefone = page.getByLabel("Telefone (WhatsApp)");
  const nomeDoPet = page.getByLabel("Nome do pet");
  const cuidados = page.getByLabel("Cuidados: comportamento e alergias");
  const salvar = page.getByRole("button", { name: "Salvar cliente e pet" });
  await nome.fill("Lia Rocha");
  await telefone.fill("(31) 98888-7777");
  await nomeDoPet.fill("Pingo");
  await page.getByRole("radio", { name: "Médio (M)" }).check();
  await cuidados.fill("Late para o secador.");
  await tocar(salvar);
  await expect(telefone).toHaveAccessibleDescription(/Este telefone já é de Rita Moreira\./);
  await expect(page.getByRole("link", { name: "Cadastrar o pet neste cliente" })).toBeVisible();
  await expect(nome).toHaveValue("Lia Rocha");
  await expect(nomeDoPet).toHaveValue("Pingo");
  await expect(page.getByRole("radio", { name: "Médio (M)" })).toBeChecked();
  await expect(cuidados).toHaveValue("Late para o secador.");

  // Outro telefone: cliente e pet numa tela só, e a volta ao agendamento com o Pingo escolhido e a hora mantida.
  await expect(salvar).toBeEnabled();
  await telefone.fill("(31) 97777-1234");
  await tocar(salvar);
  await expect(page).toHaveURL(new RegExp(`/agenda/novo\\?dia=${dia}&hora=10%3A00&pet=${UUID}$`));
  await expect(page.getByRole("status").filter({ hasText: "Cliente e pet cadastrados" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Pingo" })).toBeVisible();
  await expect(page.getByText("Late para o secador.")).toBeVisible();
  await expect(page.getByLabel("Hora")).toHaveValue("10:00");

  // Agendar: o aviso diz quando, e o bloco aparece na grade. Recarregar não repete o aviso.
  await page.getByRole("checkbox", { name: /Banho M/ }).check();
  const agendar = page.getByRole("button", { name: "Agendar", exact: true });
  await expect(agendar).toHaveAccessibleDescription(/R\$\s50,00 · 60 min/);
  await tocar(agendar);
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${dia}$`));
  const aviso = page.getByRole("status").filter({ hasText: /^Atendimento agendado para .+ às 10:00\.$/ });
  await expect(aviso).toBeVisible();
  await expect(blocoNaGrade(page, "Pingo")).toContainText("Agendado · 10:00–11:00");
  await page.reload();
  await expect(blocoNaGrade(page, "Pingo")).toBeVisible();
  await expect(aviso).toHaveCount(0);
});

test("salvar um cliente mostra o aviso, que não volta ao recarregar", { tag: "@um-perfil" }, async ({ page, tocar }) => {
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome do tutor").fill("Davi Aviso");
  await page.getByLabel("Telefone (WhatsApp)").fill("(31) 97777-5678");
  await tocar(page.getByRole("button", { name: "Salvar cliente" }));
  await expect(page).toHaveURL(new RegExp(`/clientes/${UUID}$`));
  const aviso = page.getByRole("status").filter({ hasText: "Cliente salvo." });
  await expect(aviso).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Davi Aviso" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Davi Aviso" })).toBeVisible();
  await expect(aviso).toHaveCount(0);
});
