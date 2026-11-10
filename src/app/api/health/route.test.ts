import { afterEach, describe, expect, it } from "vitest";

import { GET, HEAD } from "@/app/api/health/route";

// /api/health (docs/operacao/README.md): 200 com o banco no ar, 503 com o banco fora, sempre sem cache e sem
// nenhum detalhe além do estado. Chama a rota direto, sem sessão: ela não exige autenticação.

const urlOriginal = process.env.DATABASE_URL;

afterEach(() => {
  process.env.DATABASE_URL = urlOriginal;
});

/** Mesma URL do app, mas numa porta onde nada escuta: o banco "fora do ar". */
function bancoForaDoAr() {
  const url = new URL(urlOriginal!);
  url.port = "1";
  process.env.DATABASE_URL = url.toString();
}

describe("/api/health", () => {
  it("com o banco no ar: 200, {status: ok}, sem cache", async () => {
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toContain("no-store");
    expect(await resposta.json()).toEqual({ status: "ok" });
  });

  it("com o banco fora: 503 rápido, só o estado, sem mensagem de erro nem dado da conexão", async () => {
    bancoForaDoAr();
    const inicio = Date.now();
    const resposta = await GET();
    expect(Date.now() - inicio).toBeLessThan(5000);
    expect(resposta.status).toBe(503);
    expect(resposta.headers.get("cache-control")).toContain("no-store");
    const corpo = await resposta.text();
    expect(JSON.parse(corpo)).toEqual({ status: "indisponivel" });
    expect(corpo).not.toMatch(/ECONNREFUSED|localhost|app|5432|erro/i);
  });

  it("com a senha errada também é 503", async () => {
    const url = new URL(urlOriginal!);
    url.password = "senha-errada";
    process.env.DATABASE_URL = url.toString();
    expect((await GET()).status).toBe(503);
  });

  it("HEAD responde o mesmo código, sem corpo", async () => {
    expect((await HEAD()).status).toBe(200);
    bancoForaDoAr();
    const resposta = await HEAD();
    expect(resposta.status).toBe(503);
    expect(await resposta.text()).toBe("");
  });
});
