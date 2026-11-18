"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Campo } from "@/app/(dona)/campos";
import { Aviso } from "@/app/componentes/aviso";
import { conferirLogin, type ErrosDoLogin } from "@/app/login/acoes";
import { authClient } from "@/modules/acesso/cliente";

type Falha = { tipo: "erro" | "suspensa"; mensagem: string };

function falhaDoLogin(erro: { status?: number; code?: string; message?: string }): Falha {
  // Empresa suspensa não é erro de digitação: aparece como aviso, com o caminho (o suporte).
  if (erro.code === "EMPRESA_SUSPENSA" && erro.message) return { tipo: "suspensa", mensagem: erro.message };
  if (erro.status === 429) return { tipo: "erro", mensagem: "Muitas tentativas. Aguarde um minuto e tente de novo." };
  if (erro.status === 401) return { tipo: "erro", mensagem: "E-mail ou senha incorretos." };
  return { tipo: "erro", mensagem: "Não foi possível entrar agora. Tente de novo." };
}

/**
 * Login com noValidate (regra 13): os campos são conferidos no servidor (conferirLogin) e as mensagens aparecem em
 * português, no campo; só então o Better Auth recebe a tentativa. O que foi digitado continua nos campos.
 */
export function FormularioLogin() {
  const router = useRouter();
  const [erros, setErros] = useState<ErrosDoLogin>({});
  const [falha, setFalha] = useState<Falha | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const email = String(dados.get("email") ?? "").trim();
    const senha = String(dados.get("senha") ?? "");
    setEnviando(true);
    setFalha(null);

    const conferidos = await conferirLogin(email, senha);
    setErros(conferidos);
    if (conferidos.email || conferidos.senha) {
      setEnviando(false);
      return;
    }

    const { error } = await authClient.signIn.email({ email, password: senha });
    if (error) {
      setFalha(falhaDoLogin(error));
      setEnviando(false);
      return;
    }
    // A página inicial manda o administrador para /admin e a dona para a empresa dela.
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="formulario" onSubmit={entrar} noValidate>
      <Campo nome="email" rotulo="E-mail" erro={erros.email}>
        {(props) => (
          <input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        )}
      </Campo>
      <Campo nome="senha" rotulo="Senha" erro={erros.senha}>
        {(props) => <input {...props} type="password" autoComplete="current-password" />}
      </Campo>
      {falha && (
        <Aviso tipo={falha.tipo === "suspensa" ? "aviso" : "erro"} role="alert">
          {falha.mensagem}
        </Aviso>
      )}
      <button type="submit" className="botao-primario botao-grande" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
