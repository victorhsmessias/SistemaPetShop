import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import { eq } from "drizzle-orm";

import { urlUsaHttps } from "@/configuracao/ambiente";
import { bancoApp } from "@/db/clientes";
import { comEmpresa, EmpresaIndisponivelError } from "@/db/com-empresa";
import { argumentosSegurosDoLog } from "@/db/erro-do-banco";
import { account, session, user, verification } from "@/modules/acesso/schema";
import { hashBaratoDosTestesAtivo, senhaDosTestes } from "@/modules/acesso/senha-dos-testes";

/** Único caminho que cria usuárias: o createUser do plugin admin (painel e comando criar-admin). */
const CAMINHO_CRIAR_USUARIA = "/admin/create-user";

export const CODIGO_EMPRESA_SUSPENSA = "EMPRESA_SUSPENSA";
export const MENSAGEM_EMPRESA_SUSPENSA =
  "O acesso desta empresa está suspenso. Fale com o suporte para reativar.";

/** Recusa abrir sessão para a dona de empresa suspensa (ou inexistente). O administrador não tem empresa. */
async function conferirEmpresaAtiva(usuarioId: string): Promise<void> {
  const [usuaria] = await bancoApp()
    .select({ empresaId: user.empresaId })
    .from(user)
    .where(eq(user.id, usuarioId));
  if (!usuaria?.empresaId) return;
  try {
    await comEmpresa(usuaria.empresaId, usuarioId, async () => undefined);
  } catch (erro) {
    if (erro instanceof EmpresaIndisponivelError) {
      throw new APIError("FORBIDDEN", { code: CODIGO_EMPRESA_SUSPENSA, message: MENSAGEM_EMPRESA_SUSPENSA });
    }
    throw erro;
  }
}

/**
 * Log do Better Auth sem dados pessoais nem de senha: erros viram só o resumo (código, restrição, tabela) e os
 * outros argumentos (linhas do banco, corpo da requisição) ficam de fora. Exportado para o teste.
 */
export function registrarLogDoLogin(nivel: "debug" | "info" | "warn" | "error", mensagem: string, ...args: unknown[]) {
  const saida = nivel === "error" ? console.error : nivel === "warn" ? console.warn : console.log;
  saida(`[login] ${mensagem}`, ...argumentosSegurosDoLog(args));
}

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
    // Só no Vitest um scrypt mais barato (senha-dos-testes.ts); fora dele, o hash padrão do Better Auth.
    password: hashBaratoDosTestesAtivo() ? senhaDosTestes : undefined,
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
    session: {
      create: {
        // Empresa suspensa: a dona não entra. Sessões já abertas são barradas em comEmpresaDaSessao.
        before: async (novaSessao) => {
          await conferirEmpresaAtiva(novaSessao.userId);
        },
      },
    },
  },
  logger: { log: registrarLogDoLogin },
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
    // Secure quando o app é servido por https. Em produção, instrumentation.ts exige https
    // (só localhost fica de fora, para testar o build de produção na máquina).
    useSecureCookies: urlUsaHttps(process.env.BETTER_AUTH_URL),
    // Atrás do proxy do EasyPanel: sem isso, todos os clientes dividem o mesmo limite de tentativas.
    ipAddress: { trustedProxies: proxiesConfiaveis() },
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    nextCookies(), // precisa ser o último
  ],
});
