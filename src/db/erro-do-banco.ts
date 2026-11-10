// Erros do banco sem dados pessoais nos logs (planejamento, seção 5: "logs: sem nome nem telefone").
//
// O DrizzleQueryError põe a consulta e os PARÂMETROS na `message` ("Failed query: ... params: ..."), e o erro do
// pg traz valores no `detail` ("Key (empresa_id, telefone)=(..., +55...) already exists"). Parâmetros podem ser o
// nome e o telefone do tutor ou o hash de uma senha. Daqui para os logs só saem o código do erro, o nome da
// restrição, a tabela e a coluna: nunca a mensagem, os parâmetros, a consulta, o detalhe ou a causa.

const SQLSTATE = /^[0-9A-Z]{5}$/;

export type ResumoDoErro = {
  nome: string;
  codigo?: string;
  restricao?: string;
  tabela?: string;
  coluna?: string;
  /** Só em erros que não vêm do banco (os nossos e os do Better Auth), que não carregam dados digitados. */
  mensagem?: string;
};

function* cadeia(erro: unknown): Generator<Error> {
  let atual: unknown = erro;
  for (let i = 0; i < 10 && atual instanceof Error; i++) {
    yield atual;
    atual = atual.cause;
  }
}

function campo(erro: Error, nome: string): string | undefined {
  const valor = (erro as unknown as Record<string, unknown>)[nome];
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}

/** Erro que passou pelo banco: o do Drizzle (com os parâmetros), o do pg (SQLSTATE) ou o da conexão. */
export function ehErroDoBanco(erro: unknown): boolean {
  for (const e of cadeia(erro)) {
    if (e instanceof ErroDoBancoError) return true;
    if (e.name === "DrizzleQueryError" || "params" in e) return true;
    const codigo = campo(e, "code");
    if (codigo && SQLSTATE.test(codigo)) return true;
  }
  return false;
}

/** O que pode ir para o log sobre um erro qualquer. */
export function resumoDoErro(erro: unknown): ResumoDoErro {
  if (!(erro instanceof Error)) return { nome: typeof erro };
  if (erro instanceof ErroDoBancoError) return { ...erro.resumo };
  if (!ehErroDoBanco(erro)) return { nome: erro.name, mensagem: erro.message.slice(0, 300) };

  const resumo: ResumoDoErro = { nome: "ErroDoBanco" };
  for (const e of cadeia(erro)) {
    resumo.codigo ??= campo(e, "code");
    resumo.restricao ??= campo(e, "constraint");
    resumo.tabela ??= campo(e, "table");
    resumo.coluna ??= campo(e, "column");
  }
  return resumo;
}

/** Texto de uma linha para o log, a partir do resumo. */
export function textoDoResumo(resumo: ResumoDoErro): string {
  const partes = [
    resumo.codigo && `código ${resumo.codigo}`,
    resumo.restricao && `restrição ${resumo.restricao}`,
    resumo.tabela && `tabela ${resumo.tabela}`,
    resumo.coluna && `coluna ${resumo.coluna}`,
    resumo.mensagem,
  ].filter(Boolean);
  return partes.length > 0 ? `${resumo.nome} (${partes.join(", ")})` : resumo.nome;
}

/**
 * Erro do banco já limpo: só código, restrição, tabela e coluna, mais o contexto (empresa ou autor). Sem `cause`,
 * para o Next não registrar o erro original. Mantém o `code` para `codigoPgDe` continuar funcionando.
 */
export class ErroDoBancoError extends Error {
  readonly code?: string;
  readonly constraint?: string;
  readonly table?: string;
  readonly resumo: ResumoDoErro;

  constructor(resumo: ResumoDoErro, contexto: string) {
    super(`${textoDoResumo(resumo)} ${contexto}`);
    this.name = "ErroDoBancoError";
    this.resumo = resumo;
    this.code = resumo.codigo;
    this.constraint = resumo.restricao;
    this.table = resumo.tabela;
  }
}

/** Troca um erro do banco por um ErroDoBancoError limpo; os outros erros passam intactos (redirect, validação). */
export function limparErroDoBanco(erro: unknown, contexto: string): unknown {
  if (erro instanceof ErroDoBancoError || !ehErroDoBanco(erro)) return erro;
  return new ErroDoBancoError(resumoDoErro(erro), contexto);
}

/**
 * Argumentos seguros para o log do Better Auth: erros viram o resumo; textos e objetos (que podem trazer e-mail,
 * corpo da requisição ou linha do banco) ficam de fora.
 */
export function argumentosSegurosDoLog(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) return textoDoResumo(resumoDoErro(arg));
    if (typeof arg === "number" || typeof arg === "boolean") return arg;
    return "[omitido]";
  });
}
