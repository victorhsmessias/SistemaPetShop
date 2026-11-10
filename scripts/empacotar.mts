// Empacota os comandos que rodam dentro da imagem de produção, cada um num arquivo só, com as dependências:
//   dist/migrar.mjs       migrations como migrador (docker-entrypoint.sh)
//   dist/criar-admin.mjs  cria o administrador (console do EasyPanel)
// A imagem não leva tsx nem o código-fonte (ADR 0014). Roda depois do `next build`, no Dockerfile.
//   npm run empacotar

import { rmSync } from "node:fs";

import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });

await build({
  entryPoints: { migrar: "scripts/migrar.mts", "criar-admin": "scripts/criar-admin.mts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  // O alias @/ vem do tsconfig.json. pg-native é opcional no pg e não é usado.
  tsconfig: "tsconfig.json",
  external: ["pg-native"],
  // Dependências em CommonJS (pg) chamam require(); num pacote ESM ele precisa existir.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: "none",
  logLevel: "info",
});
