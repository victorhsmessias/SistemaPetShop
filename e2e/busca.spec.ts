import type { Page } from "@playwright/test";

import { expect, test } from "./tela";

// Busca de clientes (iPhone). A empresa tem Édson Araújo (pet Pipoca, (11) 98765-4321), Renata Lopes (pet Mingau,
// (21) 97000-1111) e "Loja 100% Pet" ((31) 3222-4444), criados em e2e/preparar.ts.

async function buscar(page: Page, termo: string) {
  await page.goto(`/clientes?busca=${encodeURIComponent(termo)}`);
  return page.getByRole("list", { name: "Tutores" }).getByRole("listitem");
}

test("a busca ignora acentos e maiúsculas, acha pelo pet e pelo telefone em qualquer formato", {
  tag: "@um-perfil",
}, async ({ page }) => {
  const casos: [termo: string, tutor: string][] = [
    ["edson", "Édson Araújo"], // sem acento
    ["ARAUJO", "Édson Araújo"], // maiúsculas, sem acento
    ["pipoca", "Édson Araújo"], // pelo pet
    ["míngau", "Renata Lopes"], // acento a mais na busca
    ["98765-43", "Édson Araújo"], // telefone com máscara parcial
    ["(11) 9876", "Édson Araújo"], // DDD com parênteses
    ["+55 11 98765", "Édson Araújo"], // com +55
  ];
  for (const [termo, tutor] of casos) {
    const resultados = await buscar(page, termo);
    await expect(resultados, termo).toHaveCount(1);
    await expect(resultados.first(), termo).toContainText(tutor);
  }
});

test("texto com dígitos procura só no texto: o nome de um tutor com o telefone de outro não acha ninguém (B7)", {
  tag: "@um-perfil",
}, async ({ page }) => {
  // "4321" é o fim do telefone do Édson; misturado com o nome da Renata, não é uma busca por telefone.
  await buscar(page, "renata 4321");
  await expect(page.getByText('Nada encontrado para "renata 4321".')).toBeVisible();
  // Só dígitos e sinais de telefone continuam buscando pelo telefone.
  const porTelefone = await buscar(page, "4321");
  await expect(porTelefone).toHaveCount(1);
  await expect(porTelefone.first()).toContainText("Édson Araújo");
});

test("sem resultado, a busca diz o que procurou; o % é literal, não curinga", { tag: "@um-perfil" }, async ({ page, tocar }) => {
  await buscar(page, "xyz");
  await expect(page.getByText('Nada encontrado para "xyz".')).toBeVisible();

  const comPorcento = await buscar(page, "%");
  await expect(comPorcento).toHaveCount(1);
  await expect(comPorcento.first()).toContainText("Loja 100% Pet");

  // A busca pela tela (campo e botão) leva ao mesmo resultado.
  await page.goto("/clientes");
  await page.getByLabel("Buscar por tutor, pet ou telefone").fill("renata");
  await tocar(page.getByRole("button", { name: "Buscar" }));
  await expect(page).toHaveURL(/busca=renata/);
  await expect(page.getByRole("list", { name: "Tutores" }).getByRole("listitem")).toHaveCount(1);
});
