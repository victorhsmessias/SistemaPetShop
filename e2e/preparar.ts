import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FullConfig } from "@playwright/test";

import {
  abrirSessao,
  apagarAdmin,
  apagarEmpresa,
  criarAdmin,
  criarCadastrosDaAgenda,
  criarEmpresaEDona,
  encerrarConexoes,
} from "./apoio";
import { PASTA_DAS_SESSOES, type DonaPreparada } from "./donas";

// Antes dos testes: uma empresa com a dona para cada arquivo de teste e cada perfil (iphone, desktop), como o
// painel faz, para um não depender dos dados do outro (o telefone é único na empresa, e os dois perfis cadastram
// o mesmo tutor). A sessão de cada dona é aberta aqui, no servidor, e salva como storageState em e2e/.sessoes/
// (fora do git). Depois: apaga tudo o que foi criado.
// As credenciais vão para os testes pelo ambiente (o Playwright repassa o process.env aos workers).

const PERFIS = ["iphone", "desktop"] as const;

type Pedido = {
  /** Nome do arquivo sem `.spec.ts`. */
  arquivo: string;
  perfis: readonly (typeof PERFIS)[number][];
  /** Dois serviços e a tutora Rita com a pet Mel (criarCadastrosDaAgenda). */
  cadastrosDaAgenda?: boolean;
  /** Sem sessão aberta: o próprio teste entra pela tela (login, saída). */
  semSessao?: boolean;
};

const PEDIDOS: Pedido[] = [
  { arquivo: "clientes", perfis: PERFIS },
  { arquivo: "servicos", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "agenda", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "financeiro", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "atendimento", perfis: PERFIS, cadastrosDaAgenda: true },
  { arquivo: "login", perfis: PERFIS },
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

export default async function preparar(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  rmSync(PASTA_DAS_SESSOES, { recursive: true, force: true });
  mkdirSync(PASTA_DAS_SESSOES, { recursive: true });

  const empresas: string[] = [];
  const donas: Record<string, DonaPreparada> = {};
  const admin: DonaPreparada = { empresaId: "", ...novasCredenciais("admin") };
  const apagarTudo = async () => {
    for (const empresaId of empresas) await apagarEmpresa(empresaId);
    await apagarAdmin(admin.email);
    rmSync(PASTA_DAS_SESSOES, { recursive: true, force: true });
  };
  try {
    await criarAdmin(admin.email, admin.senha);
    admin.sessao = path.join(PASTA_DAS_SESSOES, "admin.json");
    writeFileSync(admin.sessao, JSON.stringify(await abrirSessao(admin.email, admin.senha, baseURL)));

    for (const pedido of PEDIDOS) {
      for (const perfil of pedido.perfis) {
        const chave = `${pedido.arquivo}-${perfil}`;
        const dona = await novaDona(`Ponta a ponta ${chave}`);
        empresas.push(dona.empresaId);
        if (pedido.cadastrosDaAgenda) await criarCadastrosDaAgenda(dona.empresaId);
        let sessao: string | undefined;
        if (!pedido.semSessao) {
          sessao = path.join(PASTA_DAS_SESSOES, `${chave}.json`);
          writeFileSync(sessao, JSON.stringify(await abrirSessao(dona.email, dona.senha, baseURL)));
        }
        donas[chave] = { ...dona, sessao };
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
