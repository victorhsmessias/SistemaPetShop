// Relógio do ponta a ponta. Carregado SÓ no servidor do teste (playwright.config.ts: NODE_OPTIONS=--import),
// nunca no app de produção. Com E2E_RELOGIO="HH:MM", o Date do processo passa a marcar essa hora de hoje em
// America/Sao_Paulo e segue andando a partir dela. Assim o teste não depende do relógio da máquina (nem falha
// perto da meia-noite) e prova o comportamento às 23:50 e às 00:10 com o servidor em UTC.
//
// É um deslocamento, e não uma data fixa: a hora de hoje mantém o cookie de sessão válido para o navegador, que
// usa o relógio de verdade. Toda a lógica de "hoje" do servidor usa o Date do JavaScript (hojeNoFuso, concluir,
// concluido_em), sem now() do banco, então deslocar o Date basta.

const FUSO = "America/Sao_Paulo";
// São Paulo não tem horário de verão desde 2019: o deslocamento é fixo.
const DESLOCAMENTO_SP = "-03:00";

/** Instante (ms) de hoje em São Paulo na hora "HH:MM", a partir do relógio real. */
export function instanteDoRelogio(hora, agoraReal = Date.now()) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error(`E2E_RELOGIO inválido: "${hora}" (use HH:MM).`);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(agoraReal));
  return Date.parse(`${dia}T${hora}:00${DESLOCAMENTO_SP}`);
}

/** "Agora" do relógio do teste, para o próprio teste calcular a data esperada como o servidor. */
export function agoraDoRelogio(hora = process.env.E2E_RELOGIO) {
  return hora ? new Date(instanteDoRelogio(hora)) : new Date();
}

const hora = process.env.E2E_RELOGIO_SERVIDOR;
if (hora) {
  const DataReal = globalThis.Date;
  const desvio = instanteDoRelogio(hora, DataReal.now()) - DataReal.now();

  class DataDoTeste extends DataReal {
    constructor(...args) {
      if (args.length === 0) super(DataReal.now() + desvio);
      else super(...args);
    }

    static now() {
      return DataReal.now() + desvio;
    }
  }

  // Copia os estáticos (UTC, parse) como próprios: o Next embrulha o Date copiando só as propriedades próprias.
  for (const nome of Object.getOwnPropertyNames(DataReal)) {
    if (!Object.hasOwn(DataDoTeste, nome)) {
      Object.defineProperty(DataDoTeste, nome, Object.getOwnPropertyDescriptor(DataReal, nome));
    }
  }

  globalThis.Date = DataDoTeste;
  // No stderr, que o Playwright mostra como [WebServer]: a prova de que o processo do servidor pegou o relógio.
  console.error(`[relógio do teste] pid ${process.pid}: ${new DataDoTeste().toISOString()} (${hora} em ${FUSO})`);
}
