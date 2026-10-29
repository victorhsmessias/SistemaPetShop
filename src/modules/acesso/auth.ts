import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import { bancoApp } from "@/db/clientes";
import { account, session, user, verification } from "@/modules/acesso/schema";

/** Único caminho que cria usuárias: o createUser do plugin admin (painel e comando criar-admin). */
const CAMINHO_CRIAR_USUARIA = "/admin/create-user";

function proxiesConfiaveis(): string[] | undefined {
  const lista = process.env.BETTER_AUTH_TRUSTED_PROXIES?.split(",").map((ip) => ip.trim()).filter(Boolean);
  return lista && lista.length > 0 ? lista : undefined;
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(bancoApp(), { provider: "pg", schema: { user, session, account, verification } }),
  emailAndPassword: {
    enabled: true,
    // Cadastro público bloqueado: usuárias só nascem pelo painel do administrador.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // Gravado só no servidor, na criação da dona (createUser aceita o campo em `data`).
      empresaId: {
        type: "string",
        required: false,
        input: false,
        // A chave estrangeira para empresa fica no schema do Drizzle (acesso/schema.ts).
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Segunda barreira do cadastro público: só aceita a criação vinda do plugin admin.
        before: async (_usuaria, ctx) => {
          if (ctx?.path !== CAMINHO_CRIAR_USUARIA) {
            throw new APIError("FORBIDDEN", { message: "Cadastro público desativado." });
          }
        },
      },
    },
  },
  rateLimit: {
    // Ligado também em desenvolvimento. Só vale para a rota HTTP: chamadas auth.api no servidor não contam.
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: process.env.NODE_ENV === "production",
    // Atrás do proxy do EasyPanel: sem isso, todos os clientes dividem o mesmo limite de tentativas.
    ipAddress: { trustedProxies: proxiesConfiaveis() },
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    nextCookies(), // precisa ser o último
  ],
});
