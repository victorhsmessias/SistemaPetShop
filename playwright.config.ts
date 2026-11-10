import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta com tela de iPhone e WebKit (o motor do Safari), contra o build de produção.
// Localmente as conexões vêm do .env; no CI, das variáveis do workflow.
if (existsSync(".env")) process.loadEnvFile(".env");

// PORTA_E2E: para rodar com outro app ocupando a 3000 (localmente, um servidor já no ar é reaproveitado).
const porta = Number(process.env.PORTA_E2E ?? 3000);
const baseURL = `http://localhost:${porta}`;
const ci = Boolean(process.env.CI);

// Relógio do servidor (e2e/relogio.mjs): hora de hoje em São Paulo, 12:00 por padrão, para nenhum teste depender
// da hora da máquina. `npm run test:e2e:meia-noite` roda com 23:50 e 00:10. O servidor roda em UTC, como no CI.
// Os testes leem E2E_RELOGIO para calcular a data esperada; só o servidor tem o Date deslocado.
process.env.E2E_RELOGIO ??= "12:00";

// E2E_SEM_BUILD: reaproveita o build já feito (as rodadas do relógio, depois do test:e2e).
const iniciar = `npm run start -- -p ${porta}`;
const comando = process.env.E2E_SEM_BUILD ? iniciar : `npm run build && ${iniciar}`;

export default defineConfig({
  testDir: "./e2e",
  // Uma dona e uma empresa por execução: os testes rodam em sequência.
  workers: 1,
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
  projects: [{ name: "iphone", use: { ...devices["iPhone 15"] } }],
  webServer: {
    command: comando,
    url: `${baseURL}/login`,
    // Localmente reaproveita um servidor já no ar na porta (por exemplo, o npm run dev). Atenção: um servidor
    // reaproveitado não tem o relógio do teste; feche-o para rodar o test:e2e:meia-noite.
    reuseExistingServer: !ci,
    timeout: 240_000,
    env: {
      BETTER_AUTH_URL: baseURL,
      TZ: "UTC",
      E2E_RELOGIO_SERVIDOR: process.env.E2E_RELOGIO,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import ./e2e/relogio.mjs"].filter(Boolean).join(" "),
    },
  },
});
