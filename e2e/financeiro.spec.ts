import { rotuloDoDia } from "@/modules/agenda/fuso";

import { diaDaqui, expect, hoje as hojeDaEmpresa, statusAtual, test } from "./tela";

// A dona, no iPhone e no desktop, conclui o atendimento com pagamento (critério de "pronto" da sessão 05): agenda, conclui
// com Pix, vê a receita na página do atendimento, no Financeiro e em "Recebido hoje", e desfaz a conclusão
// com motivo, e conclui de novo em Dinheiro. O agendamento usa um dia no futuro, aberto por ?dia=. A receita é do dia em que ela conclui (hoje,
// no fuso da empresa, que é o padrão America/Sao_Paulo). O servidor roda com o relógio do teste (e2e/relogio.mjs:
// 12:00 por padrão; 23:50 e 00:10 no test:e2e:meia-noite, com o servidor em UTC), e a data esperada é calculada
// pelo mesmo relógio, como no app.

const DIA = diaDaqui(15);
const VALOR = /R\$\s80,00/;

test("a dona agenda, conclui com Pix e vê a receita no atendimento, no Financeiro e em Recebido hoje; desfaz com motivo e conclui de novo em Dinheiro", {
  tag: "@meia-noite",
}, async ({ page, tocar }) => {
  await page.goto("/agenda");
  await expect(page.getByRole("link", { name: /Recebido hoje/ })).toContainText(/R\$\s0,00/);

  // Agendar a Mel com banho (R$ 50,00) e hidratação (R$ 30,00).
  await page.goto(`/agenda?dia=${DIA}`);
  await tocar(page.getByRole("link", { name: "Novo agendamento" }));
  await page.getByLabel("Buscar pelo nome do pet ou do tutor").fill("mel");
  await tocar(page.getByRole("button", { name: "Buscar" }));
  await tocar(page.getByRole("list", { name: "Pets" }).getByRole("link", { name: /Mel/ }));
  await page.getByLabel("Hora").fill("10:00");
  await page.getByRole("checkbox", { name: /Banho M/ }).check();
  await page.getByRole("checkbox", { name: /Hidratação/ }).check();
  await tocar(page.getByRole("button", { name: "Agendar", exact: true }));
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${DIA}$`));

  // Concluir: o botão mostra o total; um toque em Pix conclui.
  const mel = page.getByRole("link", { name: /^Mel · Rita Moreira/ });
  await tocar(mel);
  await expect(page.getByRole("heading", { level: 1, name: "Mel" })).toBeVisible();
  const concluir = page.getByRole("button", { name: /^Concluir · R\$\s80,00$/ });
  await tocar(concluir);
  await expect(page.getByRole("group", { name: /Recebido R\$\s80,00 em:/ })).toBeVisible();
  await tocar(page.getByRole("button", { name: "Pix", exact: true }));

  await expect(statusAtual(page)).toHaveText("Concluído");
  const receita = page.getByRole("region", { name: "Receita" });
  await expect(receita).toContainText(VALOR);
  await expect(receita).toContainText("Pix");
  await expect(receita).toContainText(rotuloDoDia(hojeDaEmpresa()));
  await expect(page.getByRole("button", { name: /^Concluir/ })).toHaveCount(0);

  // Na agenda, o concluído continua na grade, com a marca de concluído.
  await tocar(page.getByRole("link", { name: "Voltar para Agenda" }));
  await expect(mel).toContainText("Concluído · 10:00–11:30");

  // No Financeiro: hoje e o mês com R$ 80,00 e um atendimento concluído; a receita na lista.
  await tocar(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Financeiro" }));
  await expect(page).toHaveURL(/\/financeiro$/);
  const hoje = page.getByRole("region", { name: "Hoje" });
  await expect(hoje).toContainText(VALOR);
  await expect(hoje).toContainText("1 atendimento concluído");
  await expect(page.getByRole("region", { name: /^Entrou em / })).toContainText(VALOR);
  const linha = page.getByRole("list", { name: /^Receitas de / }).getByRole("link", { name: /Mel/ });
  await expect(linha).toContainText(VALOR);
  await expect(linha).toContainText("Pix");
  // Regra 18: a receita não leva nome nem telefone do tutor (a tela liga o pet pelo atendimento).
  await expect(linha).not.toContainText("Rita");
  await expect(linha).not.toContainText("98888");

  // "Recebido hoje" na agenda do dia.
  await tocar(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Agenda" }));
  await expect(page.getByRole("link", { name: /Recebido hoje/ })).toContainText(VALOR);

  // Desfazer a conclusão: o motivo é obrigatório; a receita sai da soma e aparece cancelada, com o motivo.
  await page.goto(`/agenda?dia=${DIA}`);
  await tocar(mel);
  await tocar(page.getByRole("button", { name: "Desfazer conclusão" }));
  await tocar(page.getByRole("button", { name: "Desfazer e cancelar a receita" }));
  const motivo = page.getByLabel("Motivo (fica no cancelamento da receita)");
  await expect(motivo).toHaveAccessibleDescription(/Informe o motivo: ele fica no cancelamento da receita\./);
  await expect(page.getByRole("button", { name: "Desfazer e cancelar a receita" })).toBeEnabled();
  await motivo.fill("Era Dinheiro, não Pix");
  await tocar(page.getByRole("button", { name: "Desfazer e cancelar a receita" }));
  await expect(statusAtual(page)).toHaveText("Agendado");
  await expect(page.getByRole("button", { name: /^Concluir · R\$\s80,00$/ })).toBeVisible();

  await page.goto("/financeiro");
  await expect(page.getByRole("region", { name: "Hoje" })).toContainText(/R\$\s0,00/);
  await tocar(page.getByText("1 receita cancelada (fora da soma)"));
  await expect(page.getByRole("list", { name: "Receitas canceladas" })).toContainText("Motivo: Era Dinheiro, não Pix");

  // Concluir de novo, agora em Dinheiro: uma receita válida e a cancelada continua fora da soma.
  await page.goto(`/agenda?dia=${DIA}`);
  await tocar(mel);
  await tocar(page.getByRole("button", { name: /^Concluir · R\$\s80,00$/ }));
  await tocar(page.getByRole("button", { name: "Dinheiro", exact: true }));
  await expect(statusAtual(page)).toHaveText("Concluído");
  await expect(page.getByRole("region", { name: "Receita" })).toContainText("Dinheiro");

  await page.goto("/financeiro");
  await expect(page.getByRole("region", { name: "Hoje" })).toContainText(VALOR);
  await expect(page.getByRole("region", { name: "Hoje" })).toContainText("1 atendimento concluído");
  const receitas = page.getByRole("list", { name: /^Receitas de / }).getByRole("link");
  await expect(receitas).toHaveCount(1);
  await expect(receitas.first()).toContainText("Dinheiro");
  await expect(page.getByText("1 receita cancelada (fora da soma)")).toBeVisible();
});
