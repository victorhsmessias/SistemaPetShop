// Teste automatizado do backup e da restauração (ADR 0013), em Docker (Windows com Docker Desktop e Linux).
//   npm run test:backup
// Sobe um Postgres de origem, um de destino e um S3 local (rclone serve s3), gera um par de chaves age descartável,
// cria dados de duas empresas pelas operações do app e então prova que:
//   1. o backup que falha (S3 recusando, banco recusando) sai com erro, não apaga nada e só chama o heartbeat /fail;
//   2. o backup bem-sucedido envia o arquivo criptografado, apaga só o que passou de 31 dias e chama o heartbeat;
//   3. a restauração num banco separado e vazio traz as mesmas linhas, tabela por tabela e empresa por empresa, e
//      recusa um banco que não está vazio;
//   4. depois de restaurar, RLS, políticas, triggers, funções e permissões são as mesmas, a empresa A só vê os
//      próprios dados, e os testes de isolamento e de estrutura passam contra o banco restaurado.
// No fim apaga tudo. Projeto do compose: <COMPOSE_PROJECT_NAME ou banho-e-tosa>-backup. Portas: PORTA_BACKUP_ORIGEM
// (padrão 5437) e PORTA_BACKUP_DESTINO (padrão 5438).

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "pg";

if (existsSync(".env")) process.loadEnvFile(".env");

const projeto = `${process.env.COMPOSE_PROJECT_NAME || "banho-e-tosa"}-backup`;
const portaOrigem = Number(process.env.PORTA_BACKUP_ORIGEM || 5437);
const portaDestino = Number(process.env.PORTA_BACKUP_DESTINO || 5438);

const urls = (porta: number) => ({
  app: `postgres://app:teste-app@localhost:${porta}/banho_e_tosa`,
  plataforma: `postgres://plataforma:teste-plataforma@localhost:${porta}/banho_e_tosa`,
  migrador: `postgres://migrador:teste-migrador@localhost:${porta}/banho_e_tosa`,
  backup: `postgres://backup:teste-backup@localhost:${porta}/banho_e_tosa`,
});
const origem = urls(portaOrigem);
const destino = urls(portaDestino);

/** O app (módulos de src/) passa a falar com este banco. */
function usarBanco(banco: ReturnType<typeof urls>) {
  process.env.DATABASE_URL = banco.app;
  process.env.DATABASE_URL_PLATAFORMA = banco.plataforma;
  process.env.DATABASE_URL_MIGRADOR = banco.migrador;
  process.env.DATABASE_URL_BACKUP = banco.backup;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = "segredo-descartavel-do-teste-de-backup-000000000000";
}

type Saida = { codigo: number; texto: string };

function compose(args: string[], opcoes: { podeFalhar?: boolean } = {}): Saida {
  const r = spawnSync("docker", ["compose", "-f", "docker-compose.backup-teste.yml", "-p", projeto, ...args], {
    encoding: "utf8",
    env: { ...process.env, PORTA_BACKUP_ORIGEM: String(portaOrigem), PORTA_BACKUP_DESTINO: String(portaDestino) },
    maxBuffer: 64 * 1024 * 1024,
  });
  const saida = { codigo: r.status ?? 1, texto: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  if (saida.codigo !== 0 && !opcoes.podeFalhar) {
    throw new Error(`docker compose ${args.join(" ")} falhou (${saida.codigo}):\n${saida.texto}`);
  }
  return saida;
}

/**
 * Roda a imagem de backup sem bloquear este processo (spawn, e não spawnSync): enquanto o container roda, o
 * servidor de heartbeat daqui precisa responder.
 */
function ferramenta(args: string[], env: Record<string, string> = {}, podeFalhar = false): Promise<Saida> {
  const completos = [
    "compose", "-f", "docker-compose.backup-teste.yml", "-p", projeto,
    "run", "--rm", ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), "ferramenta", ...args,
  ];
  return new Promise((resolve, reject) => {
    const filho = spawn("docker", completos, { env: process.env });
    let texto = "";
    filho.stdout.on("data", (parte) => (texto += parte));
    filho.stderr.on("data", (parte) => (texto += parte));
    filho.on("error", reject);
    filho.on("close", (codigo) => {
      const saida = { codigo: codigo ?? 1, texto };
      if (saida.codigo !== 0 && !podeFalhar) reject(new Error(`ferramenta ${args.join(" ")} falhou:
${texto}`));
      else resolve(saida);
    });
  });
}

function confirmar(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(`FALHOU: ${mensagem}`);
  console.log(`  ok: ${mensagem}`);
}

async function consultar<T extends Record<string, unknown>>(url: string, sql: string, params: unknown[] = []) {
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    return (await cliente.query<T>(sql, params)).rows;
  } finally {
    await cliente.end();
  }
}

/** Objetos do bucket de teste (pasta banho-e-tosa), em ordem. */
function objetosDoBucket(): string[] {
  const { texto } = compose(["exec", "-T", "s3", "sh", "-c", "ls -1 /dados/backups/banho-e-tosa 2>/dev/null || true"]);
  return texto.split(/\r?\n/).filter((l) => l.endsWith(".dump.age")).sort();
}

/** Nome no padrão do backup para um instante, como o backup.sh gera (UTC). */
const nomeDoBackup = (data: Date) => `banho-e-tosa-${data.toISOString().slice(0, 19).replace(/:/g, "")}Z.dump.age`;

/** Planta um arquivo com a data de modificação de `diasAtras` dias. */
function plantar(nome: string, diasAtras: number) {
  const segundos = Math.floor(Date.now() / 1000) - diasAtras * 86400;
  compose([
    "exec",
    "-T",
    "s3",
    "sh",
    "-c",
    `mkdir -p /dados/backups/banho-e-tosa && echo antigo > /dados/backups/banho-e-tosa/${nome} && touch -d @${segundos} /dados/backups/banho-e-tosa/${nome}`,
  ]);
}

const TABELAS_POR_EMPRESA = ["tutor", "pet", "servico", "atendimento", "atendimento_item", "lancamento", "auditoria"];

async function contagens(url: string) {
  const tabelas = await consultar<{ tabela: string }>(
    url,
    `select n.nspname || '.' || c.relname as tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'drizzle') and c.relkind = 'r' order by 1`,
  );
  const resultado: Record<string, number> = {};
  for (const { tabela } of tabelas) {
    const [schema, nome] = tabela.split(".");
    const [linha] = await consultar<{ n: number }>(url, `select count(*)::int as n from "${schema}"."${nome}"`);
    resultado[tabela] = linha!.n;
  }
  return resultado;
}

async function contagensPorEmpresa(url: string, empresas: string[]) {
  const resultado: Record<string, number> = {};
  for (const tabela of TABELAS_POR_EMPRESA) {
    for (const empresa of empresas) {
      const [linha] = await consultar<{ n: number }>(
        url,
        `select count(*)::int as n from "${tabela}" where empresa_id = $1`,
        [empresa],
      );
      resultado[`${tabela}@${empresa.slice(0, 8)}`] = linha!.n;
    }
  }
  return resultado;
}

/** O que precisa sobreviver à restauração além dos dados: RLS, políticas, triggers, funções e permissões. */
async function estrutura(url: string) {
  const consultas = {
    rls: `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1`,
    politicas: `select tablename || ':' || policyname || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '')
                  as v from pg_policies where schemaname = 'public' order by 1`,
    triggers: `select c.relname || ':' || t.tgname as v from pg_trigger t join pg_class c on c.oid = t.tgrelid
                where not t.tgisinternal order by 1`,
    funcoes: `select p.proname || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') as v
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prokind = 'f'
                 and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1`,
    permissoes: `select grantee || ':' || table_name || ':' || privilege_type as v from information_schema.role_table_grants
                  where table_schema = 'public' and grantee in ('app', 'plataforma', 'backup') order by 1`,
    donos: `select distinct pg_get_userbyid(c.relowner) as v from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname in ('public', 'drizzle') and c.relkind = 'r' order by 1`,
  };
  const resultado: Record<string, string[]> = {};
  for (const [nome, sql] of Object.entries(consultas)) {
    resultado[nome] = (await consultar<Record<string, string>>(url, sql)).map((linha) => Object.values(linha)[0]!);
  }
  return resultado;
}

/** Duas empresas com dados de verdade, gravados pelas mesmas operações das telas. B tem mais cadastros que A. */
async function criarDados(): Promise<string[]> {
  const { comPlataforma } = await import("@/db/com-plataforma");
  const { comEmpresa } = await import("@/db/com-empresa");
  const { empresa } = await import("@/modules/empresas/schema");
  const { criarServico } = await import("@/modules/catalogo/servicos");
  const { criarTutor } = await import("@/modules/cadastros/tutores");
  const { criarPet } = await import("@/modules/cadastros/pets");
  const { agendar } = await import("@/modules/agenda/atendimentos");
  const { concluir } = await import("@/modules/agenda/conclusao");
  const { formaPagamento } = await import("@/modules/financeiro/schema");
  const { criarUsuaria } = await import("@/modules/administracao/usuarias");

  const empresas: string[] = [];
  for (const [nome, tutores] of [
    ["Backup A", 1],
    ["Backup B", 2],
  ] as const) {
    const [criada] = await comPlataforma(null, (tx) =>
      tx.insert(empresa).values({ nome: `[teste] ${nome}` }).returning({ id: empresa.id }),
    );
    const empresaId = criada!.id;
    empresas.push(empresaId);
    await criarUsuaria({
      autorId: null,
      dados: { nome: `Dona ${nome}`, email: `dona-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`, senha: "senha-de-teste-123" },
      role: "user",
      empresaId,
      origem: "painel",
    });
    await comEmpresa(empresaId, randomUUID(), async (tx) => {
      const banho = await criarServico(tx, { nome: "Banho M", preco: "50,00", duracao: "60" });
      if (!banho.ok) throw new Error(JSON.stringify(banho.erros));
      for (let i = 0; i < tutores; i++) {
        const tutor = await criarTutor(tx, { nome: `Tutora ${nome} ${i}`, telefone: `(31) 9888${i}-77${10 + i}` });
        if (!tutor.ok) throw new Error(JSON.stringify(tutor.erros));
        const pet = await criarPet(tx, tutor.valor.id, { nome: `Pet ${i}`, especie: "cao", porte: "P" });
        if (!pet.ok) throw new Error(JSON.stringify(pet.erros));
        const agendado = await agendar(tx, {
          petId: pet.valor.id,
          dia: "2026-12-03",
          hora: `${10 + i * 2}:00`,
          itens: [{ servicoId: banho.valor.id, preco: "50,00", duracao: "60" }],
        });
        if (!agendado.ok) throw new Error(JSON.stringify(agendado));
        const [pix] = await tx.select({ id: formaPagamento.id }).from(formaPagamento).limit(1);
        const concluido = await concluir(tx, agendado.valor.id, { de: "agendado", formaPagamentoId: pix!.id });
        if (!concluido.ok) throw new Error(JSON.stringify(concluido.erros));
      }
    });
  }
  return empresas;
}

async function conferirIsolamentoNoDestino(empresas: string[], porEmpresa: Record<string, number>) {
  const { encerrarConexoes } = await import("@/db/clientes");
  await encerrarConexoes();
  usarBanco(destino);
  const { comEmpresa } = await import("@/db/com-empresa");
  const { tutor, pet } = await import("@/modules/cadastros/schema");
  const { lancamento } = await import("@/modules/financeiro/schema");

  for (const empresaId of empresas) {
    const vistos = await comEmpresa(empresaId, randomUUID(), async (tx) => ({
      tutores: await tx.select({ empresaId: tutor.empresaId }).from(tutor),
      pets: await tx.select({ empresaId: pet.empresaId }).from(pet),
      lancamentos: await tx.select({ empresaId: lancamento.empresaId }).from(lancamento),
    }));
    const todas = [...vistos.tutores, ...vistos.pets, ...vistos.lancamentos];
    confirmar(
      todas.length > 0 && todas.every((linha) => linha.empresaId === empresaId),
      `no banco restaurado, a empresa ${empresaId.slice(0, 8)} só vê as próprias linhas`,
    );
    confirmar(
      vistos.tutores.length === porEmpresa[`tutor@${empresaId.slice(0, 8)}`],
      `e vê todos os seus ${vistos.tutores.length} tutor(es)`,
    );
  }
  await encerrarConexoes();

  const semEmpresa = await consultar<{ n: number }>(destino.app, "select count(*)::int as n from tutor");
  confirmar(semEmpresa[0]?.n === 0, "o app sem empresa na transação não vê nenhuma linha");
  const plataforma = await consultar(destino.plataforma, "select count(*) from tutor").then(
    () => "leu",
    (erro: { code?: string }) => erro.code,
  );
  confirmar(plataforma === "42501", "a plataforma recebe erro de permissão nas tabelas de negócio");
}

/**
 * O mesmo comando do teste de restauração do runbook (npm run test:banco-restaurado): todos os isolamento.test.ts,
 * o estrutura.test.ts e o papel-backup.test.ts, contra o banco restaurado (as URLs do destino já estão no ambiente).
 */
function testesDeIsolamentoNoDestino() {
  const r = spawnSync("npm", ["run", "test:banco-restaurado"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env },
  });
  confirmar(r.status === 0, "os testes de isolamento, de estrutura e do papel backup passam contra o banco restaurado");
}

async function main() {
  console.log(`Projeto ${projeto}; origem na porta ${portaOrigem}, destino na ${portaDestino}.`);
  compose(["--profile", "ferramenta", "down", "-v", "--remove-orphans"], { podeFalhar: true });

  // Recebe os heartbeats do backup (o container chega pelo host.docker.internal).
  const heartbeats: string[] = [];
  const servidor = createServer((req, res) => {
    heartbeats.push(req.url ?? "");
    res.end("ok");
  });
  await new Promise<void>((resolve) => servidor.listen(0, "0.0.0.0", resolve));
  const heartbeat = `http://host.docker.internal:${(servidor.address() as AddressInfo).port}/hb`;

  try {
    console.log("\n1. Imagem do backup, bancos e S3 local");
    compose(["build", "s3"]);
    compose(["up", "-d", "--wait", "origem", "destino", "s3"]);
    // Root só aqui, para gravar no volume do teste; o backup e a restauração rodam com o usuário da imagem.
    const publica = compose([
      "run",
      "--rm",
      "--user",
      "0",
      "ferramenta",
      "sh",
      "-c",
      "age-keygen -o /chaves/chave.txt >/dev/null 2>&1 && chmod 644 /chaves/chave.txt && age-keygen -y /chaves/chave.txt",
    ])
      .texto.split(/\r?\n/)
      .map((linha) => linha.trim())
      .find((linha) => linha.startsWith("age1")) ?? "";
    confirmar(publica.startsWith("age1"), "par de chaves age descartável gerado (a privada fica só no volume do teste)");
    const comChave = { BACKUP_AGE_DESTINATARIO: publica, BACKUP_HEARTBEAT_URL: heartbeat };

    console.log("\n2. Dados de duas empresas na origem");
    usarBanco(origem);
    const { aplicarMigracoes } = await import("@/db/migracao");
    await aplicarMigracoes({ url: origem.migrador });
    const empresas = await criarDados();
    const { encerrarConexoes } = await import("@/db/clientes");
    await encerrarConexoes();
    const linhasOrigem = await contagens(origem.migrador);
    const porEmpresaOrigem = await contagensPorEmpresa(origem.migrador, empresas);
    confirmar(linhasOrigem["public.lancamento"]! >= 3, `origem com dados (${linhasOrigem["public.tutor"]} tutores, ${linhasOrigem["public.lancamento"]} lançamentos)`);

    const antigo = nomeDoBackup(new Date(Date.now() - 40 * 86400_000));
    const recente = nomeDoBackup(new Date(Date.now() - 10 * 86400_000));
    plantar(antigo, 40);
    plantar(recente, 10);

    console.log("\n3. Backup que falha não apaga nada e não confirma o heartbeat");
    const s3Recusa = await ferramenta(["backup.sh"], { ...comChave, BACKUP_S3_SECRET_ACCESS_KEY: "segredo-errado" }, true);
    confirmar(s3Recusa.codigo !== 0, `com o S3 recusando, sai com erro (código ${s3Recusa.codigo})`);
    confirmar(!s3Recusa.texto.includes("segredo-errado") && !s3Recusa.texto.includes("teste-backup"), "o log não mostra segredos");
    const bancoRecusa = await ferramenta(
      ["backup.sh"],
      { ...comChave, DATABASE_URL_BACKUP: "postgres://backup:senha-errada@origem:5432/banho_e_tosa" },
      true,
    );
    confirmar(bancoRecusa.codigo !== 0, `com o banco recusando, sai com erro (código ${bancoRecusa.codigo})`);
    confirmar(JSON.stringify(objetosDoBucket()) === JSON.stringify([antigo, recente].sort()), "nada foi enviado nem apagado");
    confirmar(heartbeats.length === 2 && heartbeats.every((h) => h === "/hb/fail"), "só o heartbeat de falha foi chamado");

    console.log("\n4. Backup bem-sucedido");
    const ok = await ferramenta(["backup.sh"], comChave, true);
    confirmar(ok.codigo === 0, `o backup termina bem${ok.codigo === 0 ? "" : `:\n${ok.texto}`}`);
    const depois = objetosDoBucket();
    confirmar(depois.length === 2 && depois.includes(recente) && !depois.includes(antigo), "apagou só o de mais de 31 dias");
    const novo = depois.find((nome) => nome !== recente)!;
    const cabecalho = compose(["exec", "-T", "s3", "head", "-c", "21", `/dados/backups/banho-e-tosa/${novo}`]).texto;
    confirmar(cabecalho.startsWith("age-encryption.org/v1"), `o arquivo enviado (${novo}) está criptografado com age`);
    confirmar(String(heartbeats.at(-1)) === "/hb", "o heartbeat de sucesso foi chamado");

    console.log("\n5. Restauração num banco separado");
    const restaurado = await ferramenta(["restaurar.sh", "ultimo"], {}, true);
    confirmar(restaurado.codigo === 0, `restaurou o último backup${restaurado.codigo === 0 ? "" : `:\n${restaurado.texto}`}`);
    const deNovo = await ferramenta(["restaurar.sh", "ultimo"], {}, true);
    confirmar(deNovo.codigo !== 0 && deNovo.texto.includes("não está vazio"), "recusa restaurar num banco que não está vazio");

    const linhasDestino = await contagens(destino.migrador);
    confirmar(
      JSON.stringify(linhasDestino) === JSON.stringify(linhasOrigem),
      `mesmas linhas em todas as ${Object.keys(linhasOrigem).length} tabelas (inclusive auditoria e migrations)`,
    );
    confirmar(
      JSON.stringify(await contagensPorEmpresa(destino.migrador, empresas)) === JSON.stringify(porEmpresaOrigem),
      "mesmas linhas por empresa nas tabelas de negócio",
    );
    const [estruturaOrigem, estruturaDestino] = [await estrutura(origem.migrador), await estrutura(destino.migrador)];
    for (const parte of Object.keys(estruturaOrigem)) {
      confirmar(
        JSON.stringify(estruturaDestino[parte]) === JSON.stringify(estruturaOrigem[parte]) &&
          estruturaOrigem[parte]!.length > 0,
        `${parte} iguais aos da origem (${estruturaOrigem[parte]!.length})`,
      );
    }
    confirmar(JSON.stringify(estruturaDestino.donos) === '["migrador"]', "todas as tabelas pertencem ao migrador");

    console.log("\n6. Isolamento entre empresas depois de restaurar");
    await conferirIsolamentoNoDestino(empresas, porEmpresaOrigem);
    testesDeIsolamentoNoDestino();
  } finally {
    servidor.close();
  }
}

let codigo = 0;
try {
  await main();
  console.log("\nBackup aprovado: criptografado, enviado, com retenção segura e restaurado com o isolamento intacto.");
} catch (erro) {
  console.error(`\n${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}`);
  codigo = 1;
} finally {
  compose(["--profile", "ferramenta", "down", "-v", "--remove-orphans"], { podeFalhar: true });
}
process.exit(codigo);
