// Teste de ponta a ponta da imagem de produção (docker-compose.prod.yml), no Windows (Docker Desktop) e no Linux.
//   npm run test:imagem
// Prova que a imagem:
//   1. não sobe o app quando a migration falha (senha do migrador errada): sai com erro e não migra nada;
//   2. sobe com dois containers ao mesmo tempo num banco vazio: a trava faz um esperar o outro, e cada migration é
//      aplicada uma vez;
//   3. sobe, migra e responde 200 no /api/health, sem DATABASE_URL_MIGRADOR no processo do servidor;
//   4. cria o administrador com dist/criar-admin.mjs dentro do container, e ele faz login e abre o /admin;
//   5. responde 503 no /api/health com o banco parado.
// No fim apaga tudo (containers e volume). Projeto do compose: <COMPOSE_PROJECT_NAME ou banho-e-tosa>-imagem.
// Porta do app: PORTA_IMAGEM (padrão 3006).

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const projeto = `${process.env.COMPOSE_PROJECT_NAME || "banho-e-tosa"}-imagem`;
const porta = Number(process.env.PORTA_IMAGEM || 3006);
const base = `http://localhost:${porta}`;
const ambienteDoCompose = { ...process.env, PORTA_IMAGEM: String(porta) };

type Saida = { codigo: number; texto: string };

function compose(args: string[], opcoes: { entrada?: string; podeFalhar?: boolean } = {}): Saida {
  const r = spawnSync("docker", ["compose", "-f", "docker-compose.prod.yml", "-p", projeto, ...args], {
    input: opcoes.entrada,
    encoding: "utf8",
    env: ambienteDoCompose,
    maxBuffer: 64 * 1024 * 1024,
  });
  const saida = { codigo: r.status ?? 1, texto: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  if (saida.codigo !== 0 && !opcoes.podeFalhar) {
    throw new Error(`docker compose ${args.join(" ")} falhou (${saida.codigo}):\n${saida.texto}`);
  }
  return saida;
}

function psql(sql: string): string {
  return compose(["exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "banho_e_tosa", "-tAc", sql]).texto.trim();
}

function confirmar(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
  console.log(`  ok: ${mensagem}`);
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function statusDoHealth(): Promise<number | null> {
  try {
    const resposta = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
    return resposta.status;
  } catch {
    return null;
  }
}

async function esperarHealth(esperado: number, limiteMs: number): Promise<void> {
  const fim = Date.now() + limiteMs;
  let ultimo: number | null = null;
  while (Date.now() < fim) {
    ultimo = await statusDoHealth();
    if (ultimo === esperado) return;
    await esperar(1000);
  }
  throw new Error(`/api/health não respondeu ${esperado} em ${limiteMs / 1000} s (último: ${ultimo ?? "sem resposta"}).`);
}

/** Espera o container terminar a subida: o log do servidor pronto, ou o container ter saído. */
async function esperarServidor(nome: string, limiteMs: number): Promise<string> {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const logs = spawnSync("docker", ["logs", nome], { encoding: "utf8" });
    const texto = `${logs.stdout}${logs.stderr}`;
    if (/Ready in|✓ Ready/.test(texto)) return texto;
    const estado = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", nome], { encoding: "utf8" }).stdout.trim();
    if (estado === "false") throw new Error(`O container ${nome} saiu antes de ficar pronto:\n${texto}`);
    if (Date.now() > fim) throw new Error(`O container ${nome} não ficou pronto a tempo:\n${texto}`);
    await esperar(1000);
  }
}

const quantidadeDeMigracoes = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).length;

async function main() {
  console.log(`Projeto ${projeto}, app em ${base}.`);
  compose(["down", "-v", "--remove-orphans"], { podeFalhar: true });

  console.log("\n1. Build da imagem e Postgres vazio");
  compose(["build", "app"]);
  compose(["up", "-d", "--wait", "postgres"]);

  console.log("\n2. Migration falha (senha do migrador errada): o app não sobe");
  const falha = compose(
    [
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "DATABASE_URL_MIGRADOR=postgres://migrador:senha-errada@postgres:5432/banho_e_tosa",
      "app",
    ],
    { podeFalhar: true },
  );
  confirmar(falha.codigo !== 0, `o container saiu com erro (código ${falha.codigo})`);
  confirmar(/Migrations falharam/.test(falha.texto), "o log explica que as migrations falharam");
  confirmar(!/Ready in/.test(falha.texto), "o servidor não chegou a iniciar");
  confirmar(!falha.texto.includes("senha-errada"), "a senha não aparece no log");
  confirmar(psql("select count(*) from pg_tables where schemaname = 'public'") === "0", "nenhuma tabela foi criada");

  console.log("\n3. Dois containers sobem juntos num banco vazio");
  const nomes = [`${projeto}-corrida-1`, `${projeto}-corrida-2`];
  try {
    for (const nome of nomes) compose(["run", "-d", "--no-deps", "--name", nome, "app"]);
    const logs = await Promise.all(nomes.map((nome) => esperarServidor(nome, 180_000)));
    confirmar(
      logs.every((log) => /Migrations: em dia/.test(log)),
      "os dois migraram (ou encontraram tudo aplicado) e subiram",
    );
    confirmar(
      psql("select count(*) from drizzle.__drizzle_migrations") === String(quantidadeDeMigracoes),
      `cada uma das ${quantidadeDeMigracoes} migrations foi aplicada uma vez`,
    );
  } finally {
    spawnSync("docker", ["rm", "-f", ...nomes], { encoding: "utf8" });
  }

  console.log("\n4. O app sobe, migra e responde ao health");
  compose(["up", "-d", "app"]);
  await esperarHealth(200, 180_000);
  confirmar(true, "/api/health respondeu 200");
  const health = await fetch(`${base}/api/health`);
  confirmar(
    (health.headers.get("cache-control") ?? "").includes("no-store") &&
      JSON.stringify(await health.json()) === '{"status":"ok"}',
    "a resposta é mínima e sem cache",
  );
  const ambiente = compose(["exec", "-T", "app", "sh", "-c", "tr '\\0' '\\n' < /proc/1/environ"]).texto;
  confirmar(ambiente.includes("DATABASE_URL="), "o processo do servidor é o PID 1 (ambiente lido)");
  confirmar(!ambiente.includes("DATABASE_URL_MIGRADOR"), "o processo do servidor não tem DATABASE_URL_MIGRADOR");
  const usuario = compose(["exec", "-T", "app", "id", "-u"]).texto.trim();
  confirmar(usuario !== "0", `o container não roda como root (uid ${usuario})`);

  console.log("\n5. criar-admin dentro do container, login e /admin");
  const email = `admin-imagem-${Date.now()}@teste.banho-e-tosa.local`;
  const senha = `imagem-${Math.random().toString(36).slice(2)}-senha`;
  const criado = compose(["exec", "-T", "app", "node", "dist/criar-admin.mjs"], { entrada: `${email}\n${senha}\n${senha}\n` });
  confirmar(criado.texto.includes(`Administrador criado: ${email}`), "o administrador foi criado");
  confirmar(!criado.texto.includes(senha), "a senha não aparece na saída");

  const login = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password: senha }),
  });
  confirmar(login.status === 200, `login respondeu 200 (recebeu ${login.status})`);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  confirmar(cookie.includes("session_token"), "o login devolveu o cookie de sessão");

  const admin = await fetch(`${base}/admin`, { headers: { cookie }, redirect: "manual" });
  confirmar(admin.status === 200 && (await admin.text()).includes("Empresas"), "o /admin abre com a sessão");
  const semSessao = await fetch(`${base}/admin`, { redirect: "manual" });
  confirmar(semSessao.status >= 300 && semSessao.status < 400, "sem sessão, o /admin redireciona");

  console.log("\n6. Banco parado: o health responde 503");
  compose(["stop", "postgres"]);
  await esperarHealth(503, 30_000);
  confirmar(true, "/api/health respondeu 503");
}

let codigo = 0;
try {
  await main();
  console.log("\nImagem aprovada: sobe, migra (com trava e falha segura), cria o administrador, faz login e responde ao health.");
} catch (erro) {
  console.error(`\n${erro instanceof Error ? erro.message : String(erro)}`);
  console.error("\nLogs do app:\n" + compose(["logs", "--no-color", "--tail", "80", "app"], { podeFalhar: true }).texto);
  codigo = 1;
} finally {
  compose(["down", "-v", "--remove-orphans"], { podeFalhar: true });
}
process.exit(codigo);
