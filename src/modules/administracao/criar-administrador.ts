import { criarUsuaria } from "@/modules/administracao/usuarias";

/**
 * Cria o administrador da plataforma. Usado só pelo comando `npm run criar-admin`, rodado no
 * servidor: não há rota pública para isso. Passa pelo mesmo createUser do plugin admin que o
 * gancho de cadastro aceita, e grava o evento na auditoria sem empresa e sem autor.
 */
export async function criarAdministrador(dados: { nome: string; email: string; senha: string }) {
  return criarUsuaria({ autorId: null, dados, role: "admin", empresaId: null, origem: "criar-admin" });
}
