"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/modules/acesso/cliente";

function mensagemDeErro(erro: { status?: number; code?: string; message?: string }): string {
  if (erro.code === "EMPRESA_SUSPENSA" && erro.message) return erro.message;
  if (erro.status === 429) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  if (erro.status === 401) return "E-mail ou senha incorretos.";
  return "Não foi possível entrar agora. Tente de novo.";
}

export function FormularioLogin() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setEnviando(true);
    setErro(null);

    const { error } = await authClient.signIn.email({
      email: String(dados.get("email") ?? "").trim(),
      password: String(dados.get("senha") ?? ""),
    });

    if (error) {
      setErro(mensagemDeErro(error));
      setEnviando(false);
      return;
    }
    // A página inicial manda o administrador para /admin e a dona para a empresa dela.
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="formulario" onSubmit={entrar} noValidate={false}>
      <div className="campo">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required />
      </div>
      {erro && (
        <p className="mensagem mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
