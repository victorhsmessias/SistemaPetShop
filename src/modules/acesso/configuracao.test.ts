import { describe, expect, it } from "vitest";

import { problemasDaConfiguracaoDeLogin, urlUsaHttps } from "@/modules/acesso/configuracao";

const SEGREDO = "x".repeat(64);

describe("configuração do login", () => {
  it("cookie seguro só com https", () => {
    expect(urlUsaHttps("https://app.exemplo.com.br")).toBe(true);
    expect(urlUsaHttps("http://localhost:3000")).toBe(false);
    expect(urlUsaHttps(undefined)).toBe(false);
  });

  it("produção com https está certa", () => {
    expect(
      problemasDaConfiguracaoDeLogin({
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://app.exemplo.com.br",
        BETTER_AUTH_SECRET: SEGREDO,
      }),
    ).toEqual([]);
  });

  it("produção em http num domínio de verdade não sobe", () => {
    const problemas = problemasDaConfiguracaoDeLogin({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "http://app.exemplo.com.br",
      BETTER_AUTH_SECRET: SEGREDO,
    });
    expect(problemas.join(" ")).toContain("precisa ser https");
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])("produção em %s é aceita (testes locais)", (url) => {
    expect(
      problemasDaConfiguracaoDeLogin({ NODE_ENV: "production", BETTER_AUTH_URL: url, BETTER_AUTH_SECRET: SEGREDO }),
    ).toEqual([]);
  });

  it("sem URL ou com segredo curto não sobe", () => {
    expect(problemasDaConfiguracaoDeLogin({ BETTER_AUTH_SECRET: SEGREDO }).join(" ")).toContain("não definida");
    expect(
      problemasDaConfiguracaoDeLogin({ BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "curto" }).join(" "),
    ).toContain("32 caracteres");
  });
});
