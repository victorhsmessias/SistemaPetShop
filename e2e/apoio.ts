import { randomUUID } from "node:crypto";

import { eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { comPlataforma } from "@/db/com-plataforma";
import { auth } from "@/modules/acesso/auth";
import { user } from "@/modules/acesso/schema";
import { agendar } from "@/modules/agenda/atendimentos";
import { atendimento, atendimentoItem } from "@/modules/agenda/schema";
import { auditoria } from "@/modules/auditoria/schema";
import { criarUsuaria } from "@/modules/administracao/usuarias";
import { criarPet } from "@/modules/cadastros/pets";
import { pet, tutor } from "@/modules/cadastros/schema";
import { criarTutor } from "@/modules/cadastros/tutores";
import { servico } from "@/modules/catalogo/schema";
import { criarServico } from "@/modules/catalogo/servicos";
import { empresa } from "@/modules/empresas/schema";
import { categoria, formaPagamento, lancamento } from "@/modules/financeiro/schema";

import { NOME_LONGO, SERVICO_LONGO } from "./apoio-dados";

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

/** Administrador da plataforma, criado como o comando criar-admin faz. */
export async function criarAdmin(email: string, senha: string): Promise<void> {
  await criarUsuaria({
    autorId: null,
    dados: { nome: "Admin de teste", email, senha },
    role: "admin",
    empresaId: null,
    origem: "criar-admin",
  });
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

type Transacao = Parameters<Parameters<typeof comEmpresa>[2]>[0];

/** Falha o preparo com os erros da operação (só nomes de campos e mensagens, sem dados pessoais). */
function exigir<T>(resultado: { ok: true; valor: T } | { ok: false; erros: Record<string, string | undefined> }): T {
  if (!resultado.ok) throw new Error(`Preparação do ponta a ponta falhou: ${JSON.stringify(resultado.erros)}`);
  return resultado.valor;
}

async function naEmpresa<T>(empresaId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
  return comEmpresa(empresaId, randomUUID(), fn);
}

/** Agenda pelas regras do app; com horário ocupado, confirma o aviso (como "Agendar mesmo assim"). */
async function agendarConfirmando(tx: Transacao, entrada: Parameters<typeof agendar>[1]): Promise<{ id: string }> {
  let resultado = await agendar(tx, entrada);
  if (!resultado.ok && "horarioAvisado" in resultado) resultado = await agendar(tx, entrada, resultado.horarioAvisado);
  return exigir(resultado);
}

/**
 * Outra empresa, com tutor, pet, serviço e atendimento, para o teste de isolamento pela URL. Devolve os ids:
 * a dona do teste tenta abri-los e precisa receber "não encontrado".
 */
export async function criarDadosDaOutraEmpresa(empresaId: string, dia: string): Promise<Record<string, string>> {
  return naEmpresa(empresaId, async (tx) => {
    const servicoId = exigir(await criarServico(tx, { nome: "Banho da outra", preco: "70,00", duracao: "60" })).id;
    const tutorId = exigir(await criarTutor(tx, { nome: "Otávio Externo", telefone: "(41) 99555-1234" })).id;
    const petId = exigir(await criarPet(tx, tutorId, { nome: "Biscoito", especie: "cao", porte: "M" })).id;
    const atendimentoId = (
      await agendarConfirmando(tx, { petId, dia, hora: "10:00", itens: [{ servicoId, preco: "70,00", duracao: "60" }] })
    ).id;
    return { servicoId, tutorId, petId, atendimentoId };
  });
}

/** Tutores para a busca: acento, pet, telefone e um "%" no nome (que não pode virar curinga). */
export async function criarCadastrosDaBusca(empresaId: string): Promise<void> {
  await naEmpresa(empresaId, async (tx) => {
    const edson = exigir(await criarTutor(tx, { nome: "Édson Araújo", telefone: "(11) 98765-4321" })).id;
    exigir(await criarPet(tx, edson, { nome: "Pipoca", especie: "cao", porte: "P" }));
    const renata = exigir(await criarTutor(tx, { nome: "Renata Lopes", telefone: "(21) 97000-1111" })).id;
    exigir(await criarPet(tx, renata, { nome: "Mingau", especie: "gato", porte: "P" }));
    exigir(await criarTutor(tx, { nome: "Loja 100% Pet", telefone: "(31) 3222-4444" }));
  });
}

/** Dados longos: tutor com nome de 120 caracteres e 12 pets, serviço com nome de 120 e 4 atendimentos no mesmo horário. */
export async function criarDadosLongos(empresaId: string, dia: string): Promise<void> {
  await naEmpresa(empresaId, async (tx) => {
    const servicoId = exigir(await criarServico(tx, { nome: SERVICO_LONGO, preco: "1.250,00", duracao: "90" })).id;
    const tutorId = exigir(await criarTutor(tx, { nome: NOME_LONGO, telefone: "(51) 99888-7766" })).id;
    for (let i = 1; i <= 12; i++) {
      const petId = exigir(
        await criarPet(tx, tutorId, {
          nome: `Pet número ${i} com nome comprido`,
          especie: "cao",
          porte: "G",
          observacoes: "Cuidados longos: não gosta de secador, é alérgico a xampu de aveia e precisa de focinheira.",
        }),
      ).id;
      if (i <= 4) {
        await agendarConfirmando(tx, { petId, dia, hora: "09:00", itens: [{ servicoId, preco: "1.250,00", duracao: "90" }] });
      }
    }
  });
}

/** Tutor com uma palavra longa sem espaço (bug B4 do QA, visual): numa empresa só dele, para não afetar os outros. */
export async function criarPalavraLonga(empresaId: string): Promise<void> {
  await naEmpresa(empresaId, async (tx) => {
    exigir(await criarTutor(tx, { nome: `iP${"W".repeat(100)}`, telefone: "(51) 99777-6655" }));
  });
}

/** Suspende a empresa pelo papel plataforma, como o suporte faria (o painel ainda não suspende: H13, M4). */
export async function suspenderEmpresa(empresaId: string): Promise<void> {
  await comPlataforma(null, (tx) => tx.update(empresa).set({ status: "suspensa" }).where(eq(empresa.id, empresaId)));
}

/** Ids das empresas cujo nome começa com o prefixo (as criadas pelo painel no teste do administrador). */
export async function empresasComPrefixo(prefixo: string): Promise<string[]> {
  const url = process.env.DATABASE_URL_MIGRADOR;
  if (!url) throw new Error("DATABASE_URL_MIGRADOR não definida.");
  const pool = new Pool({ connectionString: url });
  try {
    const linhas = await drizzle({ client: pool })
      .select({ id: empresa.id })
      .from(empresa)
      .where(like(empresa.nome, `${prefixo}%`));
    return linhas.map((l) => l.id);
  } finally {
    await pool.end();
  }
}

/** Formato do `storageState` do Playwright, só com o cookie de sessão. */
export type SessaoSalva = {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "Strict" | "None";
  }[];
  origins: never[];
};

/**
 * Abre a sessão da usuária pelo Better Auth no servidor (`auth.api`), sem passar pela tela: o limite de 5 logins
 * por minuto vale só para a rota HTTP, e com dois perfis e vários arquivos a tela bateria nele. Devolve o cookie
 * no formato do `storageState`, para o navegador do teste já começar com a sessão.
 */
export async function abrirSessao(email: string, senha: string, baseURL: string): Promise<SessaoSalva> {
  const { headers } = await auth.api.signInEmail({ body: { email, password: senha }, returnHeaders: true });
  const host = new URL(baseURL).hostname;
  const cookies = headers.getSetCookie().map((linha) => {
    const [par, ...atributos] = linha.split(";").map((parte) => parte.trim());
    const igual = par!.indexOf("=");
    const atributo = (nome: string) =>
      atributos.find((a) => a.toLowerCase().startsWith(`${nome.toLowerCase()}=`))?.split("=")[1];
    const maxAge = Number(atributo("Max-Age") ?? 0);
    return {
      name: par!.slice(0, igual),
      value: par!.slice(igual + 1),
      domain: host,
      path: atributo("Path") ?? "/",
      expires: maxAge > 0 ? Math.floor(Date.now() / 1000) + maxAge : -1,
      httpOnly: atributos.some((a) => a.toLowerCase() === "httponly"),
      secure: atributos.some((a) => a.toLowerCase() === "secure"),
      sameSite: (atributo("SameSite") ?? "Lax") as "Lax" | "Strict" | "None",
    };
  });
  if (cookies.length === 0) throw new Error("O Better Auth não devolveu o cookie de sessão.");
  return { cookies, origins: [] };
}

/**
 * Fecha as conexões abertas na preparação. Uma vez só, no fim: o Better Auth guarda o pool do app
 * criado ao carregar, e criar outra dona depois de fechar daria "Cannot use a pool after calling end".
 */
export { encerrarConexoes };

/** Apaga, como migrador, o administrador de teste e os registros dele na auditoria. */
export async function apagarAdmin(email: string): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRADOR;
  if (!url) throw new Error("DATABASE_URL_MIGRADOR não definida.");
  const pool = new Pool({ connectionString: url });
  const banco = drizzle({ client: pool });
  try {
    await banco.transaction(async (tx) => {
      const apagados = await tx.delete(user).where(eq(user.email, email)).returning({ id: user.id });
      const ids = apagados.map((u) => u.id);
      if (ids.length > 0) await tx.delete(auditoria).where(inArray(auditoria.registroId, ids));
    });
  } finally {
    await pool.end();
  }
}

export async function apagarEmpresa(empresaId: string): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRADOR;
  if (!url) throw new Error("DATABASE_URL_MIGRADOR não definida.");
  const pool = new Pool({ connectionString: url });
  const banco = drizzle({ client: pool });
  const ids = [empresaId];
  try {
    await banco.transaction(async (tx) => {
      // A trigger grava a remoção dos itens na auditoria, que é apagada logo antes da empresa.
      await tx.delete(lancamento).where(inArray(lancamento.empresaId, ids));
      await tx.delete(atendimentoItem).where(inArray(atendimentoItem.empresaId, ids));
      await tx.delete(atendimento).where(inArray(atendimento.empresaId, ids));
      await tx.delete(pet).where(inArray(pet.empresaId, ids));
      await tx.delete(tutor).where(inArray(tutor.empresaId, ids));
      await tx.delete(servico).where(inArray(servico.empresaId, ids));
      await tx.delete(formaPagamento).where(inArray(formaPagamento.empresaId, ids));
      await tx.delete(categoria).where(inArray(categoria.empresaId, ids));
      await tx.delete(user).where(inArray(user.empresaId, ids));
      await tx.delete(auditoria).where(inArray(auditoria.empresaId, ids));
      await tx.delete(empresa).where(inArray(empresa.id, ids));
    });
  } finally {
    await pool.end();
  }
}
