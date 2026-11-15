// Aplica as migrations como o papel migrador, com a trava consultiva.
//   npm run db:migrate                       (desenvolvimento e CI; DATABASE_URL_MIGRADOR do .env)
//   node dist/migrar.mjs <arquivo com a URL> (imagem de produção; chamado pelo docker-entrypoint.sh como root, com
//                                             o arquivo legível só pelo root: a credencial não vira variável, ADR 0015)
// Sai com código diferente de zero se falhar: na imagem, o app novo não sobe.

import { existsSync, readFileSync } from "node:fs";

import { resumoDoErro, textoDoResumo } from "@/db/erro-do-banco";
import { aplicarMigracoes } from "@/db/migracao";

if (existsSync(".env")) process.loadEnvFile(".env");

const arquivo = process.argv[2];
const url = arquivo ? lerUrlDoArquivo(arquivo) : process.env.DATABASE_URL_MIGRADOR;
if (!url) {
  console.error(
    arquivo
      ? `Migrations: o arquivo ${arquivo} está vazio (veja docs/operacao/variaveis.md).`
      : "Migrations: DATABASE_URL_MIGRADOR não definida (veja docs/operacao/variaveis.md).",
  );
  process.exit(1);
}

function lerUrlDoArquivo(caminho: string): string {
  try {
    return readFileSync(caminho, "utf8").trim();
  } catch (erro) {
    // Só o código do erro (ENOENT, EACCES): o conteúdo do arquivo nunca vai para o log.
    console.error(`Migrations: não foi possível ler ${caminho} (${(erro as NodeJS.ErrnoException).code ?? "erro"}).`);
    process.exit(1);
  }
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
