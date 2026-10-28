import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Acesso ao banco (docs/planejamento/modelo-de-dados.md, regra 5):
// tabelas de negócio só por comEmpresa; o cliente plataforma só no módulo de administração.
const conexaoDireta = [
  { name: "pg", message: "Acesse o banco por comEmpresa (@/db/com-empresa)." },
  { name: "drizzle-orm/node-postgres", message: "Acesse o banco por comEmpresa (@/db/com-empresa)." },
];
const restricaoBancoApp = {
  group: ["@/db/clientes", "**/db/clientes"],
  importNames: ["bancoApp"],
  message: "Tabelas de negócio só por comEmpresa (@/db/com-empresa).",
};
const restricaoBancoPlataforma = {
  group: ["@/db/clientes", "**/db/clientes"],
  importNames: ["bancoPlataforma"],
  message: "O cliente plataforma é reservado ao módulo de administração (src/modules/administracao).",
};
const testes = ["**/*.test.ts", "src/db/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...testes, "src/modules/administracao/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: conexaoDireta, patterns: [restricaoBancoApp, restricaoBancoPlataforma] },
      ],
    },
  },
  {
    files: ["src/modules/administracao/**/*.{ts,tsx}"],
    ignores: testes,
    rules: {
      "no-restricted-imports": ["error", { paths: conexaoDireta, patterns: [restricaoBancoApp] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
