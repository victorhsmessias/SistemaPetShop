import { describe, expect, it } from "vitest";

import { ehProducaoPublica, listaDeProxies, problemasDoAmbiente, urlUsaHttps } from "@/configuracao/ambiente";

// Validação das variáveis de ambiente na subida do servidor (docs/operacao/variaveis.md).

const SEGREDO = "x".repeat(64);
const BANCO = {
  DATABASE_URL: "postgres://app:senha@db:5432/banho_e_tosa",
  DATABASE_URL_PLATAFORMA: "postgres://plataforma:senha@db:5432/banho_e_tosa",
};
const DESENVOLVIMENTO = { ...BANCO, BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: SEGREDO };
const PRODUCAO = {
  ...BANCO,
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://app.exemplo.com.br",
  BETTER_AUTH_SECRET: SEGREDO,
  BETTER_AUTH_TRUSTED_PROXIES: "10.0.1.0/24",
};

const texto = (ambiente: Record<string, string | undefined>) => problemasDoAmbiente(ambiente).join("\n");

describe("problemasDoAmbiente", () => {
  it("desenvolvimento completo e produção completa estão certos", () => {
    expect(problemasDoAmbiente(DESENVOLVIMENTO)).toEqual([]);
    expect(problemasDoAmbiente(PRODUCAO)).toEqual([]);
  });

  it("aponta cada variável que falta, sem parar na primeira", () => {
    const problemas = problemasDoAmbiente({});
    expect(problemas.join("\n")).toContain("DATABASE_URL não definida");
    expect(problemas.join("\n")).toContain("DATABASE_URL_PLATAFORMA não definida");
    expect(problemas.join("\n")).toContain("BETTER_AUTH_URL não definida");
    expect(problemas.join("\n")).toContain("BETTER_AUTH_SECRET precisa ter pelo menos 32 caracteres");
    expect(problemas.join("\n")).toContain("docs/operacao/variaveis.md");
  });

  it("URL do banco que não é postgres é recusada, sem repetir o valor (que tem senha)", () => {
    const resultado = texto({ ...DESENVOLVIMENTO, DATABASE_URL: "mysql://app:segredo123@db/x" });
    expect(resultado).toContain("DATABASE_URL precisa ser uma URL postgres://");
    expect(resultado).not.toContain("segredo123");
  });

  it("segredo curto não sobe", () => {
    expect(texto({ ...DESENVOLVIMENTO, BETTER_AUTH_SECRET: "curto" })).toContain("32 caracteres");
  });

  describe("homologação e produção", () => {
    it("BETTER_AUTH_URL em http num domínio de verdade não sobe", () => {
      expect(texto({ ...PRODUCAO, BETTER_AUTH_URL: "http://app.exemplo.com.br" })).toContain("precisa ser https");
    });

    it("sem BETTER_AUTH_TRUSTED_PROXIES não sobe, e a mensagem aponta o checklist", () => {
      const resultado = texto({ ...PRODUCAO, BETTER_AUTH_TRUSTED_PROXIES: "" });
      expect(resultado).toContain("BETTER_AUTH_TRUSTED_PROXIES não definida");
      expect(resultado).toContain("checklist-lancamento.md");
    });

    it.each(["0.0.0.0/0", "::/0", "10.0.0.0/8, 0.0.0.0/0"])("faixa aberta %s é recusada", (proxies) => {
      const resultado = texto({ ...PRODUCAO, BETTER_AUTH_TRUSTED_PROXIES: proxies });
      expect(resultado).toContain("confia em qualquer endereço");
      expect(resultado).toContain("checklist-lancamento.md");
    });

    it.each(["proxy.easypanel", "10.0.1.0/33", "10.0.1.0/x", "::1/129"])("item inválido %s é recusado", (proxies) => {
      expect(texto({ ...PRODUCAO, BETTER_AUTH_TRUSTED_PROXIES: proxies })).toContain("BETTER_AUTH_TRUSTED_PROXIES:");
    });

    it.each(["10.0.1.5", "10.0.1.0/24, 172.18.0.0/16", "fd00::/8", "2001:db8::1"])("aceita %s", (proxies) => {
      expect(problemasDoAmbiente({ ...PRODUCAO, BETTER_AUTH_TRUSTED_PROXIES: proxies })).toEqual([]);
    });

    it("com DATABASE_URL_MIGRADOR no ambiente do servidor não sobe (regra 1)", () => {
      const resultado = texto({ ...PRODUCAO, DATABASE_URL_MIGRADOR: "postgres://migrador:segredo@db/banho_e_tosa" });
      expect(resultado).toContain("DATABASE_URL_MIGRADOR está no ambiente do servidor");
      expect(resultado).not.toContain("segredo");
    });
  });

  it.each(["http://localhost:3005", "http://127.0.0.1:3006"])(
    "build de produção em %s (teste local) fica fora das regras de produção",
    (url) => {
      expect(
        problemasDoAmbiente({
          ...DESENVOLVIMENTO,
          NODE_ENV: "production",
          BETTER_AUTH_URL: url,
          DATABASE_URL_MIGRADOR: "postgres://migrador:x@localhost/banho_e_tosa",
        }),
      ).toEqual([]);
    },
  );

  it("proxy inválido é recusado também fora de produção", () => {
    expect(texto({ ...DESENVOLVIMENTO, BETTER_AUTH_TRUSTED_PROXIES: "0.0.0.0/0" })).toContain("qualquer endereço");
  });
});

describe("apoios", () => {
  it("cookie seguro só com https", () => {
    expect(urlUsaHttps("https://app.exemplo.com.br")).toBe(true);
    expect(urlUsaHttps("http://localhost:3000")).toBe(false);
    expect(urlUsaHttps(undefined)).toBe(false);
  });

  it("produção pública só com NODE_ENV=production fora de localhost", () => {
    expect(ehProducaoPublica(PRODUCAO)).toBe(true);
    expect(ehProducaoPublica({ ...PRODUCAO, NODE_ENV: "development" })).toBe(false);
    expect(ehProducaoPublica({ ...PRODUCAO, BETTER_AUTH_URL: "http://localhost:3005" })).toBe(false);
  });

  it("lista de proxies ignora espaços e itens vazios", () => {
    expect(listaDeProxies(" 10.0.0.1 , ,fd00::/8,")).toEqual(["10.0.0.1", "fd00::/8"]);
    expect(listaDeProxies(undefined)).toEqual([]);
  });
});
