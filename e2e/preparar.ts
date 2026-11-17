import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FullConfig } from "@playwright/test";

import { hojeNoFuso, somarDias } from "@/modules/agenda/fuso";

import {
  abrirSessao,
  apagarAdmin,
  apagarEmpresa,
  criarAdmin,
  criarCadastrosDaAgenda,
  criarCadastrosDaBusca,
  criarDadosDaOutraEmpresa,
  criarDadosLongos,
  criarEmpresaEDona,
  criarPalavraLonga,
  empresasComPrefixo,
  encerrarConexoes,
  suspenderEmpresa,
} from "./apoio";
import { PASTA_DAS_SESSOES, PREFIXO_DO_PAINEL, type DonaPreparada } from "./donas";
import { agoraDoRelogio } from "./relogio.mjs";

// Antes dos testes: uma empresa com a dona para cada arquivo de teste e cada perfil (iphone, desktop), como o
// painel faz, para um não depender dos dados do outro (o telefone é único na empresa, e os dois perfis cadastram
// o mesmo tutor). A sessão de cada dona é aberta aqui, no servidor, e salva como storageState em e2e/.sessoes/
// (fora do git). Depois: apaga tudo o que foi criado, inclusive as empresas que o teste do painel criou.
// As credenciais vão para os testes pelo ambiente (o Playwright repassa o process.env aos workers).

const PERFIS = ["iphone", "desktop"] as const;
const IPHONE = ["iphone"] as const;
const DESKTOP = ["desktop"] as const;

/** Dia a `dias` de hoje (fuso da empresa, relógio do teste), para os dados criados aqui. */
const diaDaqui = (dias: number) => somarDias(hojeNoFuso("America/Sao_Paulo", agoraDoRelogio()), dias);

type Contexto = {
  /** Cria outra empresa (com dona), apagada no fim junto com as outras. */
  novaEmpresa: (nome: string) => Promise<string>;
};

type Pedido = {
  /** Nome do arquivo sem `.spec.ts`. */
  arquivo: string;
  perfis: readonly (typeof PERFIS)[number][];
  /** Dois serviços e a tutora Rita com a pet Mel (criarCadastrosDaAgenda). */
  cadastrosDaAgenda?: boolean;
  /** Quantas donas (cada uma com a própria empresa): a 2ª fica em "<arquivo>-<perfil>-2", e assim por diante. */
  donas?: number;
  /**
   * Dados próprios do arquivo, depois de a sessão estar aberta (a suspensão, por exemplo, barra a sessão nova).
   * O que devolver chega ao teste em `dona.dados`. `ordem` é 1 para a 1ª dona, 2 para a 2ª.
   */
  preparar?: (empresaId: string, ordem: number, contexto: Contexto) => Promise<Record<string, string> | void>;
};

const PEDIDOS: Pedido[] = [
  { arquivo: "clientes", perfis: PERFIS },
  { arquivo: "servicos", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "agenda", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "financeiro", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "atendimento", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "login", perfis: PERFIS },
  { arquivo: "agendamento", perfis: IPHONE, cadastrosDaAgenda: true },
  { arquivo: "navegacao", perfis: IPHONE },
  { arquivo: "busca", perfis: IPHONE, preparar: (empresaId) => criarCadastrosDaBusca(empresaId) },
  {
    arquivo: "isolamento",
    perfis: IPHONE,
    preparar: async (_empresaId, _ordem, { novaEmpresa }) =>
      criarDadosDaOutraEmpresa(await novaEmpresa("Outra empresa"), diaDaqui(40)),
  },
  {
    arquivo: "dados-longos",
    perfis: PERFIS,
    donas: 2,
    preparar: async (empresaId, ordem) => {
      if (ordem === 2) return criarPalavraLonga(empresaId);
      const dia = diaDaqui(45);
      await criarDadosLongos(empresaId, dia);
      return { dia };
    },
  },
  { arquivo: "empresa-suspensa", perfis: IPHONE, preparar: (empresaId) => suspenderEmpresa(empresaId) },
  // A 1ª dona tem as sessões encerradas pelo painel; a 2ª tem a senha redefinida.
  { arquivo: "admin", perfis: DESKTOP, donas: 2 },
];

function novasCredenciais(prefixo: string) {
  return {
    email: `${prefixo}-e2e-${randomUUID().slice(0, 8)}@teste.banho-e-tosa.local`,
    senha: `e2e-${randomBytes(9).toString("hex")}`,
  };
}

async function novaDona(nome: string) {
  const { email, senha } = novasCredenciais("dona");
  return criarEmpresaEDona(nome, email, senha);
}

async function salvarSessao(arquivo: string, email: string, senha: string, baseURL: string): Promise<string> {
  const caminho = path.join(PASTA_DAS_SESSOES, `${arquivo}.json`);
  writeFileSync(caminho, JSON.stringify(await abrirSessao(email, senha, baseURL)));
  return caminho;
}

export default async function preparar(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  rmSync(PASTA_DAS_SESSOES, { recursive: true, force: true });
  mkdirSync(PASTA_DAS_SESSOES, { recursive: true });

  const empresas: string[] = [];
  const donas: Record<string, DonaPreparada> = {};
  const admin: DonaPreparada = { empresaId: "", ...novasCredenciais("admin") };
  const contexto: Contexto = {
    novaEmpresa: async (nome) => {
      const { empresaId } = await novaDona(nome);
      empresas.push(empresaId);
      return empresaId;
    },
  };
  const apagarTudo = async () => {
    for (const empresaId of [...empresas, ...(await empresasComPrefixo(PREFIXO_DO_PAINEL))]) {
      await apagarEmpresa(empresaId);
    }
    await apagarAdmin(admin.email);
    rmSync(PASTA_DAS_SESSOES, { recursive: true, force: true });
  };

  try {
    await criarAdmin(admin.email, admin.senha);
    admin.sessao = await salvarSessao("admin", admin.email, admin.senha, baseURL);

    for (const pedido of PEDIDOS) {
      for (const perfil of pedido.perfis) {
        for (let ordem = 1; ordem <= (pedido.donas ?? 1); ordem++) {
          const chave = `${pedido.arquivo}-${perfil}${ordem > 1 ? `-${ordem}` : ""}`;
          const dona = await novaDona(`Ponta a ponta ${chave}`);
          empresas.push(dona.empresaId);
          if (pedido.cadastrosDaAgenda) await criarCadastrosDaAgenda(dona.empresaId);
          const sessao = await salvarSessao(chave, dona.email, dona.senha, baseURL);
          const dados = (await pedido.preparar?.(dona.empresaId, ordem, contexto)) ?? undefined;
          donas[chave] = { ...dona, sessao, ...(dados ? { dados } : {}) };
        }
      }
    }
  } catch (erro) {
    await encerrarConexoes();
    await apagarTudo();
    throw erro;
  }
  await encerrarConexoes();
  process.env.E2E_DONAS = JSON.stringify(donas);
  process.env.E2E_ADMIN = JSON.stringify(admin);

  return apagarTudo;
}
