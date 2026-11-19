"use server";

// Conferência dos campos do login no servidor, antes de chamar o Better Auth: e-mail e senha vazios ou e-mail sem
// formato voltam com a mensagem em português no campo (regra 13), sem gastar uma das 5 tentativas por minuto do
// limite de login. Não lê nem grava nada, e nada do que foi digitado vai para log. A senha não vem para cá: só se
// foi preenchida (T3 da revisão), para não abrir mais um caminho por onde ela passe (regras 6 e 21).

export type ErrosDoLogin = { email?: string; senha?: string };

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function conferirLogin(email: unknown, temSenha: unknown): Promise<ErrosDoLogin> {
  const erros: ErrosDoLogin = {};
  const textoEmail = typeof email === "string" ? email.trim() : "";
  if (!textoEmail) erros.email = "Informe o e-mail.";
  else if (!FORMATO_EMAIL.test(textoEmail)) erros.email = "Confira o e-mail: ele precisa ter o formato nome@exemplo.com.";
  if (temSenha !== true) erros.senha = "Informe a senha.";
  return erros;
}
