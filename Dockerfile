# syntax=docker/dockerfile:1
# Imagem de produção do app (ADR 0014). Etapas: dependências -> build -> execução enxuta, sem root.
# A versão do Node é a mesma do desenvolvimento (.nvmrc) e do CI.
#   docker build -t banho-e-tosa .
# Na subida, o docker-entrypoint.sh migra como migrador e só então inicia o servidor.

ARG NODE_IMAGE=node:26.13.0-alpine3.24

# --- dependências (com as de desenvolvimento, para o build) ---------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Mesmo npm que gera o package-lock.json (packageManager no package.json).
RUN npm install -g npm@11.6.2 --no-audit --no-fund
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- build do Next (saída standalone) e dos comandos empacotados -----------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Valores falsos só para o build carregar os módulos (o Better Auth e os pools são criados na importação, sem
# conectar). Ficam nesta etapa: a imagem final não os leva, e os de verdade vêm do EasyPanel na execução.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build \
    DATABASE_URL_PLATAFORMA=postgres://build:build@127.0.0.1:1/build \
    BETTER_AUTH_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET=valor-falso-so-para-o-build-0000000000000000 \
    sh -c "npm run build && npm run empacotar"

# --- execução -------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS execucao
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000

# Só confere se o servidor responde (qualquer código, inclusive o 503 de banco fora): uma queda do banco não deve
# derrubar o container em laço. O start-period cobre as migrations.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(()=>process.exit(0),()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
