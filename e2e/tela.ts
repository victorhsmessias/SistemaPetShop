import path from "node:path";

import { test as base, expect, type Locator, type Page } from "@playwright/test";

import { hojeNoFuso, somarDias } from "@/modules/agenda/fuso";

import { donasPreparadas, type DonaPreparada } from "./donas";
import { agoraDoRelogio } from "./relogio.mjs";

// Peças comuns dos testes de ponta a ponta. Os seletores são por papel e nome acessível (getByRole, getByLabel),
// nunca por classe: o visual vai mudar, e os nomes acessíveis, os rótulos e os fluxos ficam.
//
// O erro de um campo está no aria-describedby dele: confira com expect(campo).toHaveAccessibleDescription(/…/).
//
// Perfis (playwright.config.ts): "iphone" (WebKit) e "desktop" (Chromium, 1440x900). Um teste roda nos dois, a
// menos que tenha a etiqueta @um-perfil (só iphone) ou @desktop (só desktop).

export const FUSO_DA_EMPRESA = "America/Sao_Paulo";

type Fixtures = {
  /** A dona deste arquivo e deste perfil, preparada em e2e/preparar.ts. */
  dona: DonaPreparada;
  /** Toque no iPhone, clique no desktop. */
  tocar: (alvo: Locator) => Promise<void>;
};

// O segundo argumento de cada fixture se chama `usar` (e não `use`), para o ESLint não confundir com o hook do React.
export const test = base.extend<Fixtures>({
  dona: async ({}, usar, testInfo) => {
    const chave = `${path.basename(testInfo.file, ".spec.ts")}-${testInfo.project.name}`;
    const dona = donasPreparadas()[chave];
    if (!dona) throw new Error(`Nenhuma dona preparada para "${chave}": inclua o arquivo em e2e/preparar.ts.`);
    await usar(dona);
  },
  // O navegador já começa com a sessão da dona (aberta no globalSetup), sem passar pelo limite de logins.
  storageState: async ({ dona }, usar) => {
    await usar(dona.sessao);
  },
  tocar: async ({ isMobile }, usar) => {
    await usar((alvo) => (isMobile ? alvo.tap() : alvo.click()));
  },
});

export { expect };

/** Hoje no fuso da empresa, pelo relógio do servidor do teste (e2e/relogio.mjs). */
export function hoje(): string {
  return hojeNoFuso(FUSO_DA_EMPRESA, agoraDoRelogio());
}

/** Um dia a `dias` de hoje, para abrir a agenda por ?dia= sem depender de uma data fixa que vira passado. */
export function diaDaqui(dias: number): string {
  return somarDias(hoje(), dias);
}

/**
 * Agenda um pet pela tela (busca, pet, hora, serviços) e volta para a agenda do dia. Escolha horários livres: com
 * horário ocupado aparece o aviso, que é assunto do teste da agenda.
 */
export async function agendar(
  page: Page,
  tocar: (alvo: Locator) => Promise<void>,
  { dia, hora, servicos, busca = "mel", pet = "Mel" }: { dia: string; hora: string; servicos: string[]; busca?: string; pet?: string },
): Promise<void> {
  await page.goto(`/agenda/novo?dia=${dia}`);
  await page.getByLabel("Buscar pelo nome do pet ou do tutor").fill(busca);
  await tocar(page.getByRole("button", { name: "Buscar" }));
  await tocar(page.getByRole("list", { name: "Pets" }).getByRole("link", { name: new RegExp(`^${pet}`) }));
  await page.getByLabel("Hora").fill(hora);
  for (const servico of servicos) await page.getByRole("checkbox", { name: new RegExp(servico) }).check();
  await tocar(page.getByRole("button", { name: "Agendar", exact: true }));
  await expect(page).toHaveURL(new RegExp(`/agenda\\?dia=${dia}$`));
}

/** O bloco do atendimento na grade do dia (o nome acessível começa por "Pet · Tutor"). */
export function blocoNaGrade(page: Page, pet: string): Locator {
  return page.getByRole("link", { name: new RegExp(`^${pet} · `) });
}

/** Status do atendimento na página dele (a etiqueta tem o nome acessível "Status atual"). */
export function statusAtual(page: Page): Locator {
  return page.getByRole("status", { name: "Status atual" });
}

/** Mensagem de erro geral do formulário (role="alert"), sem pegar o anunciador de rota do Next. */
export function erroGeral(page: Page, texto: string | RegExp): Locator {
  return page.getByRole("alert").filter({ hasText: texto });
}
