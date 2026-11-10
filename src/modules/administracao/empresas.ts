import { asc, eq } from "drizzle-orm";

import { comPlataforma } from "@/db/com-plataforma";
import { resumoDoErro, textoDoResumo } from "@/db/erro-do-banco";
import { user } from "@/modules/acesso/schema";
import { exigirAdmin } from "@/modules/administracao/guarda";
import {
  criarUsuaria,
  DadosInvalidosError,
  emailEmUso,
  encerrarSessoesDaUsuaria,
  redefinirSenhaDaUsuaria,
  type ResultadoRedefinicao,
  validarNovaUsuaria,
  type NovaUsuaria,
} from "@/modules/administracao/usuarias";
import { empresa } from "@/modules/empresas/schema";

// Operações do painel do administrador. Cada uma confere role = 'admin' no servidor (exigirAdmin)
// e usa a sessão do administrador como autor na auditoria.

export const FUSOS_HORARIOS = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

export const NOMES_DOS_FUSOS: Record<(typeof FUSOS_HORARIOS)[number], string> = {
  "America/Sao_Paulo": "São Paulo, Rio, Minas, Sul (Brasília)",
  "America/Bahia": "Bahia",
  "America/Fortaleza": "Ceará, Maranhão, Piauí, RN, Paraíba",
  "America/Recife": "Pernambuco",
  "America/Belem": "Pará, Amapá",
  "America/Manaus": "Amazonas",
  "America/Cuiaba": "Mato Grosso",
  "America/Campo_Grande": "Mato Grosso do Sul",
  "America/Porto_Velho": "Rondônia",
  "America/Boa_Vista": "Roraima",
  "America/Rio_Branco": "Acre",
  "America/Noronha": "Fernando de Noronha",
};

export type EmpresaDoPainel = {
  id: string;
  nome: string;
  status: string;
  fusoHorario: string;
  usuarias: { id: string; nome: string; email: string }[];
};

export async function listarEmpresas(cabecalhos: Headers): Promise<EmpresaDoPainel[]> {
  const admin = await exigirAdmin(cabecalhos);
  const linhas = await comPlataforma(admin.usuarioId, (tx) =>
    tx
      .select({
        id: empresa.id,
        nome: empresa.nome,
        status: empresa.status,
        fusoHorario: empresa.fusoHorario,
        usuariaId: user.id,
        usuariaNome: user.name,
        usuariaEmail: user.email,
      })
      .from(empresa)
      .leftJoin(user, eq(user.empresaId, empresa.id))
      .orderBy(asc(empresa.nome), asc(user.name)),
  );

  const porId = new Map<string, EmpresaDoPainel>();
  for (const linha of linhas) {
    const item = porId.get(linha.id) ?? {
      id: linha.id,
      nome: linha.nome,
      status: linha.status,
      fusoHorario: linha.fusoHorario,
      usuarias: [],
    };
    if (linha.usuariaId) {
      item.usuarias.push({ id: linha.usuariaId, nome: linha.usuariaNome!, email: linha.usuariaEmail! });
    }
    porId.set(linha.id, item);
  }
  return [...porId.values()];
}

export type NovaEmpresa = { nome: string; fusoHorario: string; dona: NovaUsuaria };

export type ResultadoCriacao =
  | { situacao: "completa"; empresaId: string; donaId: string }
  | { situacao: "sem_dona"; empresaId: string; erro: string };

/**
 * Cria a empresa e depois a dona, em passos separados (a chave de user.empresa_id exige a empresa
 * já gravada). Se a dona falhar, a empresa fica sem usuária e o painel oferece criar a dona.
 */
export async function criarEmpresaComDona(cabecalhos: Headers, dados: NovaEmpresa): Promise<ResultadoCriacao> {
  const admin = await exigirAdmin(cabecalhos);

  const nome = dados.nome.trim();
  if (!nome) throw new DadosInvalidosError("Informe o nome da empresa.");
  if (!(FUSOS_HORARIOS as readonly string[]).includes(dados.fusoHorario)) {
    throw new DadosInvalidosError("Fuso horário inválido.");
  }
  const dona = validarNovaUsuaria(dados.dona);
  if (await emailEmUso(admin.usuarioId, dona.email)) throw new DadosInvalidosError("Este e-mail já está em uso.");

  // A trigger auditar() registra a criação com o administrador como autor.
  const [criada] = await comPlataforma(admin.usuarioId, (tx) =>
    tx.insert(empresa).values({ nome, fusoHorario: dados.fusoHorario }).returning({ id: empresa.id }),
  );
  const empresaId = criada!.id;

  try {
    const donaId = await criarDonaNaEmpresa(admin.usuarioId, cabecalhos, empresaId, dona);
    return { situacao: "completa", empresaId, donaId };
  } catch (erro) {
    // Erro do banco vira só o resumo: a mensagem do Drizzle traria os parâmetros (e-mail, hash da senha).
    const resumo = resumoDoErro(erro);
    const motivo = resumo.mensagem ?? textoDoResumo(resumo);
    return { situacao: "sem_dona", empresaId, erro: `Empresa criada, mas a dona não: ${motivo}` };
  }
}

/** Cria a dona de uma empresa que ainda não tem usuária. */
export async function criarDona(cabecalhos: Headers, empresaId: string, dona: NovaUsuaria): Promise<string> {
  const admin = await exigirAdmin(cabecalhos);
  return criarDonaNaEmpresa(admin.usuarioId, cabecalhos, empresaId, dona);
}

async function criarDonaNaEmpresa(
  autorId: string,
  cabecalhos: Headers,
  empresaId: string,
  dona: NovaUsuaria,
): Promise<string> {
  const [alvo] = await comPlataforma(autorId, (tx) =>
    tx
      .select({ id: empresa.id, usuariaId: user.id })
      .from(empresa)
      .leftJoin(user, eq(user.empresaId, empresa.id))
      .where(eq(empresa.id, empresaId))
      .limit(1),
  );
  if (!alvo) throw new DadosInvalidosError("Empresa não encontrada.");
  if (alvo.usuariaId) throw new DadosInvalidosError("Esta empresa já tem uma usuária.");

  const criada = await criarUsuaria({
    autorId,
    cabecalhos,
    dados: dona,
    role: "user",
    empresaId,
    origem: "painel",
  });
  return criada.id;
}

export async function redefinirSenha(
  cabecalhos: Headers,
  usuarioId: string,
  novaSenha: string,
): Promise<ResultadoRedefinicao> {
  const admin = await exigirAdmin(cabecalhos);
  return redefinirSenhaDaUsuaria(admin, cabecalhos, usuarioId, novaSenha);
}

export async function encerrarSessoes(cabecalhos: Headers, usuarioId: string): Promise<void> {
  const admin = await exigirAdmin(cabecalhos);
  await encerrarSessoesDaUsuaria(admin, cabecalhos, usuarioId);
}
