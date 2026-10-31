import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta com tela de iPhone e WebKit (o motor do Safari), contra o build de produção.
// Localmente as conexões vêm do .env; no CI, das variáveis do workflow.
if (existsSync(".env")) process.loadEnvFile(".env");

const porta = 3000;
const baseURL = `http://localhost:${porta}`;
const ci = Boolean(process.env.CI);

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
    command: "npm run build && npm run start",
    url: `${baseURL}/login`,
    // Localmente reaproveita um servidor já no ar na porta 3000 (por exemplo, o npm run dev).
    reuseExistingServer: !ci,
    timeout: 240_000,
    env: { BETTER_AUTH_URL: baseURL },
  },
});
