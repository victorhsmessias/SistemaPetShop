/** Instante (ms) de hoje em São Paulo na hora "HH:MM", a partir do relógio real. */
export function instanteDoRelogio(hora: string, agoraReal?: number): number;

/** "Agora" do relógio do teste (E2E_RELOGIO), para calcular a data esperada como o servidor. */
export function agoraDoRelogio(hora?: string): Date;
