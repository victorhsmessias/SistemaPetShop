import { expect, test } from "./tela";

// Isolamento pela URL (iPhone): com os ids de outra empresa (tutor, pet, serviço e atendimento, criados em
// e2e/preparar.ts), as telas da dona respondem "não encontrado" e não mostram nenhum dado. O RLS faz o registro de
// outra empresa voltar como inexistente; os testes de isolamento do banco cobrem as tabelas, este cobre as telas.

test("os registros de outra empresa não abrem por nenhuma URL e não aparecem nas buscas", {
  tag: "@um-perfil",
}, async ({ page, dona }) => {
  const { tutorId, petId, servicoId, atendimentoId } = dona.dados!;
  const urls = [
    `/clientes/${tutorId}`,
    `/clientes/${tutorId}/editar`,
    `/clientes/${tutorId}/pets/novo`,
    `/clientes/${tutorId}/pets/${petId}/editar`,
    `/servicos/${servicoId}/editar`,
    `/agenda/${atendimentoId}`,
    `/agenda/${atendimentoId}/editar`,
  ];
  for (const url of urls) {
    const resposta = await page.goto(url);
    expect(resposta?.status(), url).toBe(404);
    await expect(page.getByText(/Otávio|Biscoito|Banho da outra/)).toHaveCount(0);
  }

  // O pet de outra empresa no agendamento: a tela segue sem pet escolhido.
  await page.goto(`/agenda/novo?pet=${petId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Novo agendamento" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Biscoito" })).toHaveCount(0);
  await expect(page.getByLabel("Buscar pelo nome do pet ou do tutor")).toBeVisible();

  // As buscas não acham o tutor nem o pet da outra empresa (nem pelo telefone).
  await page.goto("/clientes?busca=otavio");
  await expect(page.getByText('Nada encontrado para "otavio".')).toBeVisible();
  await page.goto("/clientes?busca=99555-1234");
  await expect(page.getByText('Nada encontrado para "99555-1234".')).toBeVisible();
  await page.goto("/agenda/novo?busca=biscoito");
  await expect(page.getByText('Nenhum pet ativo encontrado para "biscoito".')).toBeVisible();
});
