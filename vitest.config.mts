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
    // Além do terminal, um relatório JUnit com as falhas e a saída de cada teste: uma falha que não se repete fica
    // registrada (qual arquivo, qual teste, a mensagem). O CI anexa o arquivo quando falha.
    reporters: ["default", ["junit", { outputFile: "vitest-report/junit.xml" }]],
    // Workers no padrão (núcleos - 1). O papel app tem CONNECTION LIMIT 30 e cada arquivo abre o próprio pool, mas usa
    // poucas conexões: medido em 17/11/2026 (pg_stat_activity a cada 50 ms), o pico foi 11 com 11 workers. Se um dia
    // passar de 20, limite aqui (maxWorkers) antes de mexer no limite do papel.
  },
});
