import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saída enxuta para a imagem Docker: .next/standalone traz o server.js e só os arquivos de node_modules que o
  // app usa (Dockerfile). O `next start` do ponta a ponta continua funcionando.
  output: "standalone",
};

export default nextConfig;
