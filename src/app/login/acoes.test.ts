import { describe, expect, it } from "vitest";

import { conferirLogin } from "@/app/login/acoes";

// A ação do login é pública (quem está entrando não tem sessão): chamada direto, como um atacante faria, ela só
// devolve as mensagens dos campos, sem ler nem gravar nada.

describe("conferirLogin", () => {
  it("vazio: as duas mensagens em português", async () => {
    expect(await conferirLogin("", "")).toEqual({ email: "Informe o e-mail.", senha: "Informe a senha." });
    expect(await conferirLogin(undefined, null)).toEqual({ email: "Informe o e-mail.", senha: "Informe a senha." });
  });

  it("e-mail sem formato é recusado; com formato e senha, nada a dizer", async () => {
    expect((await conferirLogin("dona", "x")).email).toContain("nome@exemplo.com");
    expect(await conferirLogin("  dona@exemplo.com ", "qualquer")).toEqual({});
  });
});
