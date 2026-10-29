// Cria o administrador da plataforma. Roda no servidor (em produção, dentro do container):
//   npm run criar-admin
// Pede e-mail e senha no terminal. Não existe rota pública para isso.

import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

if (existsSync(".env")) process.loadEnvFile(".env");

const { encerrarConexoes } = await import("@/db/clientes");
const { criarAdministrador } = await import("@/modules/administracao/criar-administrador");

/** Senha sem eco no terminal. */
function lerSenhaOculta(rotulo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    let senha = "";
    const encerrar = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.off("data", aoDigitar);
      process.stdout.write("\n");
    };
    const aoDigitar = (teclas: string) => {
      for (const tecla of teclas) {
        if (tecla === "\r" || tecla === "\n") {
          encerrar();
          return resolve(senha);
        }
        if (tecla === "\u0003") {
          encerrar();
          return reject(new Error("Cancelado."));
        }
        if (tecla === "\u007f" || tecla === "\b") senha = senha.slice(0, -1);
        else senha += tecla;
      }
    };
    process.stdout.write(rotulo);
    entrada.setRawMode(true);
    entrada.setEncoding("utf8");
    entrada.resume();
    entrada.on("data", aoDigitar);
  });
}

/** Sem terminal (entrada por pipe, como nos testes): uma resposta por linha. */
async function lerLinhasDaEntrada(): Promise<string[]> {
  let texto = "";
  for await (const parte of process.stdin) texto += parte;
  return texto.split(/\r?\n/);
}

async function perguntar(): Promise<{ email: string; senha: string; confirmacao: string }> {
  if (!process.stdin.isTTY) {
    const [email = "", senha = "", confirmacao = ""] = await lerLinhasDaEntrada();
    return { email, senha, confirmacao };
  }
  const leitor = createInterface({ input: process.stdin, output: process.stdout });
  const email = await leitor.question("E-mail do administrador: ");
  leitor.close();
  const senha = await lerSenhaOculta("Senha (mínimo 8 caracteres): ");
  const confirmacao = await lerSenhaOculta("Repita a senha: ");
  return { email, senha, confirmacao };
}

try {
  const { email, senha, confirmacao } = await perguntar();
  if (senha !== confirmacao) throw new Error("As senhas não conferem.");
  const admin = await criarAdministrador({ nome: "Administrador", email, senha });
  console.log(`Administrador criado: ${admin.email}`);
  process.exitCode = 0;
} catch (erro) {
  console.error(`Não foi possível criar o administrador: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
} finally {
  await encerrarConexoes();
}
