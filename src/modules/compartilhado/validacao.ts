// Validação dos formulários no servidor, sem biblioteca: os formulários do M1 são curtos.
// Se começar a se repetir nas próximas sessões, reavaliar uma biblioteca (combinado na sessão 03).

export type Erros = Record<string, string>;

/** Resultado de uma operação de formulário: ok, ou erros por campo (chave "geral" para o formulário todo). */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erros: Erros };

const formatoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids chegam da URL ou de campos ocultos: confere o formato antes de ir ao banco. */
export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && formatoUuid.test(valor);
}

export class Campos {
  readonly erros: Erros = {};

  get validos(): boolean {
    return Object.keys(this.erros).length === 0;
  }

  erro(campo: string, mensagem: string): void {
    this.erros[campo] ??= mensagem;
  }

  /** Texto obrigatório, sem espaços nas pontas. */
  obrigatorio(campo: string, valor: string | undefined, rotulo: string, maximo: number): string {
    const texto = (valor ?? "").trim();
    if (!texto) this.erro(campo, `Informe ${rotulo}.`);
    else if (texto.length > maximo) this.erro(campo, `Use no máximo ${maximo} caracteres.`);
    return texto;
  }

  /** Texto opcional: vazio vira null. */
  opcional(campo: string, valor: string | undefined, maximo: number): string | null {
    const texto = (valor ?? "").trim();
    if (texto.length > maximo) this.erro(campo, `Use no máximo ${maximo} caracteres.`);
    return texto || null;
  }

  /** Um valor de uma lista fechada (status e tipos em text com check). */
  umDe<T extends string>(campo: string, valor: string | undefined, opcoes: readonly T[], mensagem: string): T {
    if (!opcoes.includes(valor as T)) this.erro(campo, mensagem);
    return valor as T;
  }

  /** Inteiro dentro de uma faixa. */
  inteiro(campo: string, valor: string | undefined, minimo: number, maximo: number, mensagem: string): number {
    const texto = (valor ?? "").trim();
    const numero = Number(texto);
    if (!/^\d+$/.test(texto) || numero < minimo || numero > maximo) this.erro(campo, mensagem);
    return numero;
  }

  resultado<T>(valor: T): Resultado<T> {
    return this.validos ? { ok: true, valor } : { ok: false, erros: this.erros };
  }
}

/** Erro de um campo só, ou do formulário todo. */
export function falhou(campo: string, mensagem: string): { ok: false; erros: Erros } {
  return { ok: false, erros: { [campo]: mensagem } };
}

/** Escapa %, _ e \ para usar o texto digitado num LIKE (o escape padrão do Postgres é a barra). */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}
