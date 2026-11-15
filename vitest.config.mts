import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Os testes de integração usam o Postgres de verdade; localmente as conexões vêm do .env.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // Cada teste tem até 15 s. Um beforeAll prepara o arquivo inteiro (empresas, donas, logins) e costuma fazer o
    // trabalho de vários testes, então os ganchos têm o dobro; o padrão do Vitest (10 s) era menor que o de um teste
    // e derrubava o arquivo todo com a máquina carregada. O hash de senha dos testes é barato
    // (src/modules/acesso/senha-dos-testes.ts), o que tira a maior parte do custo desses ganchos.
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
