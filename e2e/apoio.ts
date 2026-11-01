import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { comPlataforma } from "@/db/com-plataforma";
import { user } from "@/modules/acesso/schema";
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import { auditoria } from "@/modules/auditoria/schema";
import { criarUsuaria } from "@/modules/administracao/usuarias";
import { criarPet } from "@/modules/cadastros/pets";
import { pet, tutor } from "@/modules/cadastros/schema";
import { criarTutor } from "@/modules/cadastros/tutores";
import { servico } from "@/modules/catalogo/schema";
import { criarServico } from "@/modules/catalogo/servicos";
import { empresa } from "@/modules/empresas/schema";

// Dados do teste de ponta a ponta: uma empresa com a dona, criadas como o painel faz, e apagadas no fim
// pelo migrador (dono das tabelas). Prefixo [teste] e e-mail @teste.banho-e-tosa.local, como os outros testes.

export type DonaDeTeste = { empresaId: string; email: string; senha: string };

export async function criarEmpresaEDona(nome: string, email: string, senha: string): Promise<DonaDeTeste> {
  const [criada] = await comPlataforma(null, (tx) =>
    tx.insert(empresa).values({ nome: `[teste] ${nome}` }).returning({ id: empresa.id }),
  );
  await criarUsuaria({
    autorId: null,
    dados: { nome: "Dona de teste", email, senha },
    role: "user",
    empresaId: criada!.id,
    origem: "painel",
  });
  return { empresaId: criada!.id, email, senha };
}

/**
 * Cadastros prontos para o teste da agenda: dois serviços e uma tutora com uma pet, gravados pelas mesmas
 * operações das telas. O pet agendado primeiro é cadastrado pela tela, pelo atalho do agendamento.
 */
export async function criarCadastrosDaAgenda(empresaId: string): Promise<void> {
  const autor = randomUUID();
  await comEmpresa(empresaId, autor, async (tx) => {
    for (const s of [
      { nome: "Banho M", preco: "50,00", duracao: "60" },
      { nome: "Hidratação", preco: "30,00", duracao: "30" },
    ]) {
      const criado = await criarServico(tx, s);
      if (!criado.ok) throw new Error(JSON.stringify(criado.erros));
    }
    const rita = await criarTutor(tx, { nome: "Rita Moreira", telefone: "(31) 98888-7777" });
    if (!rita.ok) throw new Error(JSON.stringify(rita.erros));
    const mel = await criarPet(tx, rita.valor.id, { nome: "Mel", especie: "cao", porte: "P" });
    if (!mel.ok) throw new Error(JSON.stringify(mel.erros));
  });
}

/**
 * Fecha as conexões abertas na preparação. Uma vez só, no fim: o Better Auth guarda o pool do app
 * criado ao carregar, e criar outra dona depois de fechar daria "Cannot use a pool after calling end".
 */
export { encerrarConexoes };

export async function apagarEmpresa(empresaId: string): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRADOR;
  if (!url) throw new Error("DATABASE_URL_MIGRADOR não definida.");
  const pool = new Pool({ connectionString: url });
  const banco = drizzle({ client: pool });
  const ids = [empresaId];
  try {
    await banco.transaction(async (tx) => {
      // A trigger grava a remoção dos itens na auditoria, que é apagada logo antes da empresa.
      await tx.delete(atendimentoItem).where(inArray(atendimentoItem.empresaId, ids));
      await tx.delete(atendimento).where(inArray(atendimento.empresaId, ids));
      await tx.delete(pet).where(inArray(pet.empresaId, ids));
      await tx.delete(tutor).where(inArray(tutor.empresaId, ids));
      await tx.delete(servico).where(inArray(servico.empresaId, ids));
      await tx.delete(user).where(inArray(user.empresaId, ids));
      await tx.delete(auditoria).where(inArray(auditoria.empresaId, ids));
      await tx.delete(empresa).where(inArray(empresa.id, ids));
    });
  } finally {
    await pool.end();
  }
}
