import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Hash de senha barato SÓ para os testes do Vitest (npm test).
 *
 * O Better Auth usa scrypt com N=16384, r=16 (32 MB e ~130 ms por hash). Os testes de integração criam e fazem login
 * com dezenas de usuárias, em vários arquivos ao mesmo tempo; com a máquina carregada, os beforeAll passavam do tempo
 * limite só esperando o hash. Aqui é o mesmo scrypt, no mesmo formato ("sal:chave" em hex), com N=1024 e r=8 (1 MB,
 * ~1 ms).
 *
 * Nunca vale fora do Vitest: só com VITEST=true (o Vitest define) e NODE_ENV=test (o Vitest define; a imagem e o
 * build de produção usam production). O ponta a ponta, o test:imagem e a produção usam o hash padrão do Better Auth.
 */
const PARAMETROS = { N: 1024, r: 8, p: 1 } as const;
const TAMANHO_DA_CHAVE = 64;

export function hashBaratoDosTestesAtivo(env: { VITEST?: string; NODE_ENV?: string } = process.env): boolean {
  return env.VITEST === "true" && env.NODE_ENV === "test";
}

function chaveDe(senha: string, sal: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize("NFKC"), sal, TAMANHO_DA_CHAVE, PARAMETROS, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    );
  });
}

export const senhaDosTestes = {
  async hash(senha: string): Promise<string> {
    const sal = randomBytes(16).toString("hex");
    return `${sal}:${(await chaveDe(senha, sal)).toString("hex")}`;
  },
  async verify({ hash, password }: { hash: string; password: string }): Promise<boolean> {
    const [sal, chave] = hash.split(":");
    if (!sal || !chave) return false;
    const esperada = Buffer.from(chave, "hex");
    const calculada = await chaveDe(password, sal);
    return esperada.length === calculada.length && timingSafeEqual(esperada, calculada);
  },
};
