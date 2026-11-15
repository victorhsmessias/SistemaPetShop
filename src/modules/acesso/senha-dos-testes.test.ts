import { describe, expect, it } from "vitest";

import { auth } from "@/modules/acesso/auth";
import { hashBaratoDosTestesAtivo, senhaDosTestes } from "@/modules/acesso/senha-dos-testes";

describe("hash de senha barato dos testes", () => {
  it("só vale com VITEST=true e NODE_ENV=test", () => {
    expect(hashBaratoDosTestesAtivo({ VITEST: "true", NODE_ENV: "test" })).toBe(true);
    expect(hashBaratoDosTestesAtivo({ VITEST: "true", NODE_ENV: "production" })).toBe(false);
    expect(hashBaratoDosTestesAtivo({ VITEST: "true", NODE_ENV: "development" })).toBe(false);
    expect(hashBaratoDosTestesAtivo({ NODE_ENV: "test" })).toBe(false);
    expect(hashBaratoDosTestesAtivo({ NODE_ENV: "production" })).toBe(false);
    expect(hashBaratoDosTestesAtivo({})).toBe(false);
  });

  it("está ligado no Vitest, e o Better Auth o usa", () => {
    expect(hashBaratoDosTestesAtivo()).toBe(true);
    expect(auth.options.emailAndPassword.password).toBe(senhaDosTestes);
  });

  it("confere a senha certa e recusa a errada e um hash malformado", async () => {
    const hash = await senhaDosTestes.hash("senha-de-teste-123");
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await senhaDosTestes.verify({ hash, password: "senha-de-teste-123" })).toBe(true);
    expect(await senhaDosTestes.verify({ hash, password: "senha-de-teste-124" })).toBe(false);
    expect(await senhaDosTestes.verify({ hash: "sem-dois-pontos", password: "x" })).toBe(false);
    expect(await senhaDosTestes.hash("senha-de-teste-123")).not.toBe(hash);
  });
});
