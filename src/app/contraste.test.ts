import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Contraste dos tokens de cor do globals.css, nos temas claro e escuro (WCAG 2.2): texto >= 4,5:1 (1.4.3) e
// componentes de interface >= 3:1 (1.4.11). A direção "Aconchego" é a de menor folga: qualquer ajuste de cor que
// reprove um par aparece aqui. A --borda (divisores e contorno de cartão) é decorativa e fica de fora.

const TEXTO = 4.5;
const INTERFACE = 3;

type Par = { uso: string; frente: string; fundo: string; minimo: number };

const STATUS = ["agendado", "confirmado", "em-atendimento", "pronto", "concluido", "cancelado", "faltou"];

const PARES: Par[] = [
  { uso: "Texto", frente: "texto", fundo: "fundo", minimo: TEXTO },
  { uso: "Texto", frente: "texto", fundo: "superficie", minimo: TEXTO },
  { uso: "Texto", frente: "texto", fundo: "superficie2", minimo: TEXTO },
  { uso: "Texto secundário", frente: "suave", fundo: "fundo", minimo: TEXTO },
  { uso: "Texto secundário", frente: "suave", fundo: "superficie", minimo: TEXTO },
  { uso: "Texto secundário", frente: "suave", fundo: "superficie2", minimo: TEXTO },
  { uso: "Botão principal", frente: "primaria-texto", fundo: "primaria", minimo: TEXTO },
  { uso: "Botão principal (passando o mouse)", frente: "primaria-texto", fundo: "primaria-hover", minimo: TEXTO },
  { uso: "Link e aba ativa", frente: "primaria", fundo: "superficie", minimo: TEXTO },
  { uso: "Link", frente: "primaria", fundo: "fundo", minimo: TEXTO },
  { uso: "Texto na primária suave", frente: "primaria", fundo: "primaria-suave", minimo: TEXTO },
  { uso: "Perigo (texto)", frente: "perigo", fundo: "superficie", minimo: TEXTO },
  { uso: "Erro em aviso", frente: "perigo", fundo: "perigo-fundo", minimo: TEXTO },
  { uso: "Sucesso em aviso", frente: "sucesso", fundo: "sucesso-fundo", minimo: TEXTO },
  { uso: "Sucesso (valor)", frente: "sucesso", fundo: "superficie", minimo: TEXTO },
  { uso: "Aviso", frente: "aviso", fundo: "aviso-fundo", minimo: TEXTO },
  { uso: "Informação", frente: "info", fundo: "info-fundo", minimo: TEXTO },
  { uso: "Cuidados", frente: "cuidado-texto", fundo: "cuidado-fundo", minimo: TEXTO },
  { uso: "Texto em aviso", frente: "texto", fundo: "aviso-fundo", minimo: TEXTO },
  { uso: "Borda de campo e botão", frente: "borda-controle", fundo: "superficie", minimo: INTERFACE },
  { uso: "Borda de campo e botão", frente: "borda-controle", fundo: "fundo", minimo: INTERFACE },
  { uso: "Botão principal × superfície", frente: "primaria", fundo: "superficie", minimo: INTERFACE },
  { uso: "Botão principal × fundo", frente: "primaria", fundo: "fundo", minimo: INTERFACE },
  { uso: "Anel de foco", frente: "foco", fundo: "fundo", minimo: INTERFACE },
  { uso: "Anel de foco", frente: "foco", fundo: "superficie", minimo: INTERFACE },
  { uso: "Faixa de cuidados", frente: "cuidado-faixa", fundo: "cuidado-fundo", minimo: INTERFACE },
  { uso: "Ícone de perigo", frente: "perigo", fundo: "superficie", minimo: INTERFACE },
  ...STATUS.flatMap((s) => [
    { uso: `Selo ${s}`, frente: `st-${s}-texto`, fundo: `st-${s}-fundo`, minimo: TEXTO },
    { uso: `Faixa ${s} na grade`, frente: `st-${s}-faixa`, fundo: "superficie", minimo: INTERFACE },
  ]),
];

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** Os tokens `--nome: #rrggbb` do primeiro bloco que começa com `abertura`. */
function tokensDoBloco(abertura: string): Map<string, string> {
  const inicio = css.indexOf(abertura);
  if (inicio === -1) throw new Error(`Bloco não encontrado: ${abertura}`);
  const fim = css.indexOf("\n}", inicio);
  const bloco = css.slice(inicio, fim);
  return new Map([...bloco.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

const TEMAS = {
  claro: tokensDoBloco(":root {"),
  escuro: tokensDoBloco("@media (prefers-color-scheme: dark) {\n  :root {"),
};

function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function razaoDeContraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}

describe("razaoDeContraste", () => {
  it("bate com os valores de referência do WCAG", () => {
    expect(razaoDeContraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(razaoDeContraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(razaoDeContraste("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe.each(Object.entries(TEMAS))("contraste dos tokens, tema %s", (_tema, tokens) => {
  it("define todas as cores usadas nos pares", () => {
    const faltando = PARES.flatMap((p) => [p.frente, p.fundo]).filter((nome) => !tokens.has(nome));
    expect([...new Set(faltando)]).toEqual([]);
  });

  it.each(PARES)("$uso: --$frente sobre --$fundo", ({ frente, fundo, minimo }) => {
    const razao = razaoDeContraste(tokens.get(frente)!, tokens.get(fundo)!);
    expect(razao, `${tokens.get(frente)} sobre ${tokens.get(fundo)}: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimo);
  });
});
