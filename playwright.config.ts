import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta contra o build de produção, em dois perfis: iPhone 15 com WebKit (o motor do Safari, o aparelho da
// piloto) e desktop 1440x900 com Chromium (o navegador mais comum no computador). Um teste roda nos dois, a menos que
// tenha a etiqueta @um-perfil (só no iPhone) ou @desktop (só no desktop).
// Localmente as conexões vêm do .env; no CI, das variáveis do workflow.
if (existsSync(".env")) process.loadEnvFile(".env");

// PORTA_E2E: para rodar com outro app ocupando a 3000 (localmente, um servidor já no ar é reaproveitado).
const porta = Number(process.env.PORTA_E2E || 3000);
const baseURL = `http://localhost:${porta}`;
const ci = Boolean(process.env.CI);

// Relógio do servidor (e2e/relogio.mjs): hora de hoje em São Paulo, 12:00 por padrão, para nenhum teste depender
// da hora da máquina. `npm run test:e2e:meia-noite` roda com 23:50 e 00:10. O servidor roda em UTC, como no CI.
// Os testes leem E2E_RELOGIO para calcular a data esperada; só o servidor tem o Date deslocado.
process.env.E2E_RELOGIO ||= "12:00";

// E2E_SEM_BUILD: reaproveita o build já feito (as rodadas do relógio, depois do test:e2e).
const iniciar = `npm run start -- -p ${porta}`;
const comando = process.env.E2E_SEM_BUILD ? iniciar : `npm run build && ${iniciar}`;

export default defineConfig({
  testDir: "./e2e",
  // Um servidor e um banco: os testes rodam em sequência (cada arquivo e perfil tem a própria empresa e dona).
  workers: 1,
  // Cada teste percorre um fluxo inteiro (agendar, concluir, desfazer...) e leva de 20 a 30 s; com o padrão de 30 s,
  // a máquina carregada derrubava um teste por tempo. A margem da meia-noite continua valendo: no
  // test:e2e:meia-noite, o relógio do servidor começa às 23:50 quando o servidor sobe, o globalSetup roda depois (o
  // Playwright sobe o webServer antes) e a rodada tem só os 2 testes com a etiqueta @meia-noite, no iPhone. No pior
  // caso: 240 s de subida (webServer.timeout) + até 60 s de globalSetup (24 donas e o administrador; 5 s medidos aqui,
  // em 17/11/2026, e ele imprime o tempo) + 2 x 60 s = 7 min, antes das 00:00.
  timeout: 60_000,
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/preparar.ts",
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"] }, grepInvert: /@desktop/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: /@um-perfil/,
    },
  ],
  webServer: {
    command: comando,
    url: `${baseURL}/login`,
    // Localmente reaproveita um servidor já no ar na porta (por exemplo, o npm run dev). Atenção: um servidor
    // reaproveitado não tem o relógio do teste; feche-o para rodar o test:e2e:meia-noite.
    reuseExistingServer: !ci,
    timeout: 240_000,
    env: {
      BETTER_AUTH_URL: baseURL,
      // WhatsApp do suporte fictício (nenhum número real no repositório): o teste da empresa suspensa confere o link.
      SUPORTE_WHATSAPP: "5511900000000",
      TZ: "UTC",
      E2E_RELOGIO_SERVIDOR: process.env.E2E_RELOGIO,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import ./e2e/relogio.mjs"].filter(Boolean).join(" "),
    },
  },
});
