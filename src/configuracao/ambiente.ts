import { isIP } from "node:net";

// Variáveis de ambiente do app, conferidas na subida do servidor (instrumentation.ts), antes de atender
// requisições. Cada variável está descrita em docs/operacao/variaveis.md.
//
// "Produção" aqui é NODE_ENV=production com BETTER_AUTH_URL fora de localhost: o build de produção rodando na
// máquina (npm run test:e2e, docker-compose.prod.yml) fica de fora das regras de homologação e produção.

type Ambiente = Record<string, string | undefined>;

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const VEJA = "veja docs/operacao/variaveis.md";
const CHECKLIST_PROXY = "docs/operacao/checklist-lancamento.md, seção \"Proxy confiável\"";

/** Cookie com Secure quando o app é servido por https (o Safari descarta cookie Secure em http). */
export function urlUsaHttps(url: string | undefined): boolean {
  return Boolean(url?.startsWith("https://"));
}

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Homologação ou produção de verdade: build de produção servido fora de localhost. */
export function ehProducaoPublica(ambiente: Ambiente): boolean {
  const host = ambiente.BETTER_AUTH_URL ? hostDe(ambiente.BETTER_AUTH_URL) : null;
  return ambiente.NODE_ENV === "production" && host !== null && !HOSTS_LOCAIS.has(host);
}

/** Lista de BETTER_AUTH_TRUSTED_PROXIES (separada por vírgulas), sem itens vazios. */
export function listaDeProxies(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Problema de um item de proxy: precisa ser IP ou faixa CIDR, e nunca uma faixa aberta (/0). */
function problemaDoProxy(item: string): string | null {
  const barra = item.lastIndexOf("/");
  const ip = barra === -1 ? item : item.slice(0, barra);
  const familia = isIP(ip);
  if (familia === 0) return `"${item}" não é um IP nem uma faixa CIDR`;
  if (barra === -1) return null;
  const prefixo = item.slice(barra + 1);
  const maximo = familia === 4 ? 32 : 128;
  if (!/^\d{1,3}$/.test(prefixo) || Number(prefixo) > maximo) return `"${item}" tem um prefixo CIDR inválido`;
  if (Number(prefixo) === 0) {
    return `"${item}" confia em qualquer endereço: qualquer pessoa forjaria o IP e escaparia do limite de tentativas`;
  }
  return null;
}

/** Só dígitos, com o código do país e o DDD (ex.: 55 + 11 + número): o formato do link wa.me. */
const FORMATO_WHATSAPP = /^[1-9]\d{9,14}$/;

/**
 * WhatsApp do suporte (SUPORTE_WHATSAPP), mostrado na tela de empresa suspensa. Null sem a variável ou com valor
 * inválido (o servidor já não sobe com valor inválido; ver problemasDoAmbiente).
 */
export function whatsappDoSuporte(ambiente: Ambiente = process.env): string | null {
  const valor = ambiente.SUPORTE_WHATSAPP?.trim();
  return valor && FORMATO_WHATSAPP.test(valor) ? valor : null;
}

function urlDoBanco(ambiente: Ambiente, variavel: string, problemas: string[]) {
  const valor = ambiente[variavel];
  if (!valor) {
    problemas.push(`${variavel} não definida (${VEJA}).`);
    return;
  }
  let protocolo = "";
  try {
    protocolo = new URL(valor).protocol;
  } catch {
    // tratado abaixo
  }
  if (protocolo !== "postgres:" && protocolo !== "postgresql:") {
    problemas.push(`${variavel} precisa ser uma URL postgres://usuario:senha@host:porta/banco (${VEJA}).`);
  }
}

/**
 * Problemas das variáveis de ambiente, um por linha, em português. Vazio quando o app pode subir. Nunca repete o
 * valor de uma variável secreta na mensagem.
 */
export function problemasDoAmbiente(ambiente: Ambiente): string[] {
  const problemas: string[] = [];

  urlDoBanco(ambiente, "DATABASE_URL", problemas);
  urlDoBanco(ambiente, "DATABASE_URL_PLATAFORMA", problemas);

  const url = ambiente.BETTER_AUTH_URL;
  if (!url) {
    problemas.push(`BETTER_AUTH_URL não definida (${VEJA}).`);
  } else if (hostDe(url) === null) {
    problemas.push(`BETTER_AUTH_URL inválida: ${url}`);
  } else if (ehProducaoPublica(ambiente) && !urlUsaHttps(url)) {
    problemas.push(
      `BETTER_AUTH_URL (${url}) precisa ser https em homologação e produção: sem isso, o cookie de sessão sai sem Secure.`,
    );
  }

  if (!ambiente.BETTER_AUTH_SECRET || ambiente.BETTER_AUTH_SECRET.length < 32) {
    problemas.push(`BETTER_AUTH_SECRET precisa ter pelo menos 32 caracteres (${VEJA}).`);
  }

  const proxies = listaDeProxies(ambiente.BETTER_AUTH_TRUSTED_PROXIES);
  for (const item of proxies) {
    const problema = problemaDoProxy(item);
    if (problema) problemas.push(`BETTER_AUTH_TRUSTED_PROXIES: ${problema}. Use a faixa do proxy (${CHECKLIST_PROXY}).`);
  }

  const suporte = ambiente.SUPORTE_WHATSAPP?.trim();
  if (suporte && !FORMATO_WHATSAPP.test(suporte)) {
    problemas.push(
      `SUPORTE_WHATSAPP precisa ter só dígitos, com o código do país e o DDD (por exemplo 55 11 e o número, tudo junto) (${VEJA}).`,
    );
  }

  if (ehProducaoPublica(ambiente)) {
    if (!suporte) {
      problemas.push(
        `SUPORTE_WHATSAPP não definida: a tela de empresa suspensa precisa do WhatsApp do suporte (${VEJA}).`,
      );
    }
    if (proxies.length === 0) {
      problemas.push(
        "BETTER_AUTH_TRUSTED_PROXIES não definida: atrás do proxy do EasyPanel, sem ela cinco senhas erradas de " +
          `qualquer pessoa bloqueiam o login de todas por um minuto. Preencha com a faixa do proxy (${CHECKLIST_PROXY}).`,
      );
    }
    // Regra 1 do CLAUDE.md: o app não lê a credencial do dono das tabelas. O docker-entrypoint.sh a remove do
    // ambiente depois de migrar; se ela chegou até aqui, o servidor foi iniciado por outro caminho.
    if (ambiente.DATABASE_URL_MIGRADOR) {
      problemas.push(
        "DATABASE_URL_MIGRADOR está no ambiente do servidor: o app não pode ter a credencial do migrador. " +
          "Inicie pelo docker-entrypoint.sh, que migra e a remove antes de subir o app.",
      );
    }
  }

  return problemas;
}
