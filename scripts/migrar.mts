// Aplica as migrations como o papel migrador (DATABASE_URL_MIGRADOR), com a trava consultiva.
//   npm run db:migrate              (desenvolvimento e CI; lê o .env)
//   node dist/migrar.mjs            (imagem de produção; chamado pelo docker-entrypoint.sh)
// Sai com código diferente de zero se falhar: na imagem, o app novo não sobe.

import { existsSync } from "node:fs";

import { resumoDoErro, textoDoResumo } from "@/db/erro-do-banco";
import { aplicarMigracoes } from "@/db/migracao";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.DATABASE_URL_MIGRADOR;
if (!url) {
  console.error("Migrations: DATABASE_URL_MIGRADOR não definida (veja docs/operacao/variaveis.md).");
  process.exit(1);
}

const inicio = Date.now();
try {
  console.log("Migrations: aplicando como migrador...");
  await aplicarMigracoes({
    url,
    aoEsperar: () => console.log("Migrations: outra instância está migrando; esperando a trava..."),
  });
  console.log(`Migrations: em dia (${Date.now() - inicio} ms).`);
} catch (erro) {
  // Só o resumo: a mensagem de um erro do banco pode trazer parâmetros da consulta.
  console.error(`Migrations falharam: ${textoDoResumo(resumoDoErro(erro))}`);
  process.exitCode = 1;
}
