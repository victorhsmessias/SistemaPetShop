import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Acesso ao banco (docs/planejamento/modelo-de-dados.md, regra 5, e CLAUDE.md):
// - tabelas de negócio só por comEmpresa, chamada pelo módulo de sessão (src/modules/acesso)
//   com o empresaId da sessão;
// - cliente plataforma só por comPlataforma, no módulo de administração e no comando criar-admin;
// - bancoApp só em src/db e no Better Auth.
// Cada arquivo cai em UM bloco abaixo (no flat config, o último bloco que casa substitui a regra).

const conexaoDireta = [
  { name: "pg", message: "Acesse o banco por comEmpresaDaSessao (@/modules/acesso/sessao)." },
  { name: "drizzle-orm/node-postgres", message: "Acesse o banco por comEmpresaDaSessao (@/modules/acesso/sessao)." },
];
const proibir = {
  bancoApp: {
    group: ["@/db/clientes", "**/db/clientes"],
    importNames: ["bancoApp"],
    message: "Tabelas de negócio só por comEmpresaDaSessao (@/modules/acesso/sessao).",
  },
  bancoPlataforma: {
    group: ["@/db/clientes", "**/db/clientes"],
    importNames: ["bancoPlataforma"],
    message: "Use comPlataforma (@/db/com-plataforma), que grava o autor para a auditoria.",
  },
  comPlataforma: {
    group: ["@/db/com-plataforma", "**/db/com-plataforma"],
    message: "O cliente plataforma é reservado ao módulo de administração e ao comando criar-admin.",
  },
  // Exceção prevista: as tarefas agendadas do M3 (pg-boss) vão chamar comEmpresa por empresa, sem
  // sessão. Quando entrarem, ganham um bloco próprio aqui, restrito ao módulo delas.
  comEmpresa: {
    group: ["@/db/com-empresa", "**/db/com-empresa"],
    importNames: ["comEmpresa"],
    message: "O empresaId vem só da sessão: use comEmpresaDaSessao (@/modules/acesso/sessao).",
  },
};
const restringir = (...padroes) => ({
  "no-restricted-imports": ["error", { paths: conexaoDireta, patterns: padroes }],
});

// Os testes de Docker (npm run test:imagem e test:backup) preparam bancos descartáveis como os testes de integração.
const testes = ["**/*.test.ts", "src/db/**", "scripts/testar-*.mts"];
const administracao = ["src/modules/administracao/**/*.{ts,tsx}", "scripts/criar-admin.mts"];
const acesso = "src/modules/acesso/**/*.{ts,tsx}";
const betterAuth = "src/modules/acesso/auth.ts";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,mts}"],
    ignores: [...testes, ...administracao, acesso],
    rules: restringir(proibir.bancoApp, proibir.bancoPlataforma, proibir.comPlataforma, proibir.comEmpresa),
  },
  {
    files: administracao,
    ignores: testes,
    rules: restringir(proibir.bancoApp, proibir.bancoPlataforma, proibir.comEmpresa),
  },
  {
    files: [acesso],
    ignores: [...testes, betterAuth],
    rules: restringir(proibir.bancoApp, proibir.bancoPlataforma, proibir.comPlataforma),
  },
  {
    // O Better Auth usa o papel app nas próprias tabelas (user, session, account, verification), fora do RLS.
    files: [betterAuth],
    rules: restringir(proibir.bancoPlataforma, proibir.comPlataforma),
  },
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts"]),
]);

export default eslintConfig;
