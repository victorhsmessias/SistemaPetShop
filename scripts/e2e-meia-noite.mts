// Prova que o ponta a ponta passa a qualquer hora: roda os testes com a etiqueta @meia-noite (agendar e acompanhar;
// concluir e ver no Financeiro), no iPhone, com o relógio do servidor às 23:50 e às 00:10 de São Paulo (servidor em
// UTC, como no CI). Só esses 2, para a rodada das 23:50 caber antes da meia-noite (playwright.config.ts, timeout).
// Reaproveita o build de `npm run build` ou do test:e2e.
//   npm run test:e2e:meia-noite
// Funciona no cmd do Windows: as variáveis vão pelo ambiente do processo filho, não pela linha de comando.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".next/BUILD_ID")) {
  console.error("Sem build do Next: rode `npm run build` (ou `npm run test:e2e`) antes.");
  process.exit(1);
}

for (const hora of ["23:50", "00:10"]) {
  console.log(`\n== Ponta a ponta com o relógio do servidor às ${hora} (America/Sao_Paulo) ==`);
  const resultado = spawnSync("npx", ["playwright", "test", "--project=iphone", "--grep", "@meia-noite"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, E2E_RELOGIO: hora, E2E_SEM_BUILD: "1" },
  });
  if (resultado.status !== 0) {
    console.error(`\nFalhou com o relógio às ${hora}.`);
    process.exit(resultado.status ?? 1);
  }
}
console.log("\nPassou às 23:50 e às 00:10.");
