import type { Page } from "@playwright/test";

import { NOME_LONGO, SERVICO_LONGO } from "./apoio-dados";
import { donaDoArquivo, expect, test } from "./tela";

// Dados longos, no iPhone e no desktop: tutor com nome de 120 caracteres e 12 pets, serviço com nome de 120 e
// 4 atendimentos no mesmo horário (e2e/preparar.ts). Nenhuma tela pode rolar para o lado.

async function semRolagemHorizontal(page: Page, tela: string) {
  const { largura, conteudo } = await page.evaluate(() => ({
    largura: window.innerWidth,
    conteudo: document.documentElement.scrollWidth,
  }));
  expect(conteudo, `rolagem horizontal em ${tela}`).toBeLessThanOrEqual(largura);
}

test("nome de 120 caracteres, 12 pets, serviço longo e 4 atendimentos no mesmo horário cabem na tela", async ({
  page,
  tocar,
  dona,
}) => {
  const dia = dona.dados!.dia!;

  await page.goto("/clientes");
  await expect(page.getByRole("list", { name: "Tutores" })).toContainText(NOME_LONGO);
  await semRolagemHorizontal(page, "Clientes");

  await tocar(page.getByRole("list", { name: "Tutores" }).getByRole("link"));
  await expect(page.getByRole("heading", { level: 1, name: NOME_LONGO })).toBeVisible();
  await expect(page.getByRole("list", { name: "Pets" }).getByRole("listitem")).toHaveCount(12);
  await semRolagemHorizontal(page, "página do tutor");

  await page.goto("/servicos");
  await expect(page.getByRole("list", { name: "Serviços" })).toContainText(SERVICO_LONGO);
  await semRolagemHorizontal(page, "Serviços");

  // Os 4 atendimentos das 9h ficam lado a lado, sem se cobrir.
  await page.goto(`/agenda?dia=${dia}`);
  const blocos = page.getByRole("link", { name: /^Pet número \d+ com nome comprido · / });
  await expect(blocos).toHaveCount(4);
  const caixas = await Promise.all((await blocos.all()).map((bloco) => bloco.boundingBox()));
  const ordenadas = caixas.map((c) => c!).sort((a, b) => a.x - b.x);
  for (let i = 1; i < ordenadas.length; i++) {
    expect(ordenadas[i]!.x).toBeGreaterThanOrEqual(ordenadas[i - 1]!.x + ordenadas[i - 1]!.width - 1);
  }
  await semRolagemHorizontal(page, "agenda do dia");

  await page.goto(`/agenda/semana?dia=${dia}`);
  await semRolagemHorizontal(page, "semana");

  await tocar(page.getByRole("link", { name: /: 4 atendimentos$/ }));
  await tocar(blocos.first());
  await expect(page.getByRole("list", { name: "Serviços do atendimento" })).toContainText(SERVICO_LONGO);
  await semRolagemHorizontal(page, "atendimento");
});

// B4 do QA (visual, fora desta fase): uma palavra longa sem espaço no nome do tutor faz a tela rolar para o lado.
// Fica marcado como falha esperada: quando o visual novo corrigir, o Playwright acusa "passou inesperadamente" e o
// `test.fail` deve ser retirado. O tutor fica na 2ª empresa do arquivo, para não afetar o teste acima.
test.describe("palavra longa", () => {
  test.use({
    dona: async ({}, usar, testInfo) => {
      await usar(donaDoArquivo(testInfo, 2));
    },
  });

  test("palavra longa sem espaço no nome do tutor não cria rolagem horizontal (B4)", async ({ page, tocar }) => {
    test.fail(true, "B4: palavra longa sem espaço ainda cria rolagem horizontal (correção visual pendente).");
    // Na lista, o cartão corta o nome (overflow: hidden); a página do tutor rola para o lado.
    await page.goto("/clientes");
    await tocar(page.getByRole("list", { name: "Tutores" }).getByRole("link"));
    await expect(page.getByRole("heading", { level: 1, name: /^iPW+$/ })).toBeVisible();
    await semRolagemHorizontal(page, "página do tutor");
  });
});
