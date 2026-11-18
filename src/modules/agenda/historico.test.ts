import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { apagarEmpresas, criarEmpresaComDados, usuarioTeste, type DadosEmpresa } from "@/db/testes/apoio";
import { agendar, mudarStatus, proximoEUltimoPorPet } from "@/modules/agenda/atendimentos";
import { concluir } from "@/modules/agenda/conclusao";
import { criarPet } from "@/modules/cadastros/pets";
import { criarTutor } from "@/modules/cadastros/tutores";
import { criarServico } from "@/modules/catalogo/servicos";

// Próximo e último atendimento de cada pet, para a ficha do cliente. O "agora" é fixo: 17/11/2026, 12:00 em São
// Paulo (15:00 UTC).

const AGORA = new Date("2026-11-17T15:00:00Z");

let a: DadosEmpresa;
let b: DadosEmpresa;
let tutorId: string;
let rexId: string;
let melId: string;
const ids: Record<string, string> = {};

const emA = <T,>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(a.empresaId, usuarioTeste, fn);
const emB = <T,>(fn: Parameters<typeof comEmpresa<T>>[2]) => comEmpresa(b.empresaId, usuarioTeste, fn);

function valorDe<T>(resultado: { ok: boolean; valor?: T }): T {
  if (!resultado.ok || !resultado.valor) throw new Error(`esperava ok: ${JSON.stringify(resultado)}`);
  return resultado.valor;
}

beforeAll(async () => {
  a = await criarEmpresaComDados("Histórico A");
  b = await criarEmpresaComDados("Histórico B");
  tutorId = valorDe(await emA((tx) => criarTutor(tx, { nome: "[teste] Lúcia", telefone: "(92) 98877-1122" }))).id;
  rexId = valorDe(await emA((tx) => criarPet(tx, tutorId, { nome: "Rex", especie: "cao", porte: "G" }))).id;
  melId = valorDe(await emA((tx) => criarPet(tx, tutorId, { nome: "Mel", especie: "cao", porte: "P" }))).id;
  const banho = valorDe(await emA((tx) => criarServico(tx, { nome: "Banho", preco: "50,00", duracao: "60" }))).id;
  const itens = [{ servicoId: banho, preco: "50,00", duracao: "60" }];
  const marcar = async (chave: string, dia: string) => {
    ids[chave] = valorDe(await emA((tx) => agendar(tx, { petId: rexId, dia, hora: "10:00", itens }))).id;
  };

  await marcar("concluidoAntigo", "2026-10-01");
  await marcar("concluidoRecente", "2026-10-15");
  await marcar("canceladoFuturo", "2026-12-05");
  await marcar("proximo", "2026-12-10");
  await marcar("depois", "2026-12-20");
  for (const chave of ["concluidoAntigo", "concluidoRecente"]) {
    valorDe(
      await emA((tx) => concluir(tx, ids[chave]!, { de: "agendado", formaPagamentoId: a.formaPagamentoId, totalVisto: 5000 })),
    );
  }
  valorDe(await emA((tx) => mudarStatus(tx, ids.canceladoFuturo!, "agendado", "cancelado")));
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

describe("proximoEUltimoPorPet", () => {
  it("dá o próximo por terminar (sem cancelados) e o último concluído de cada pet", async () => {
    const historico = await emA((tx) => proximoEUltimoPorPet(tx, tutorId, AGORA));
    const rex = historico.get(rexId);
    expect(rex?.proximo?.id).toBe(ids.proximo);
    expect(rex?.proximo?.status).toBe("agendado");
    expect(rex?.ultimo?.id).toBe(ids.concluidoRecente);
    expect(historico.has(melId)).toBe(false);
  });

  it("o atendimento em andamento agora ainda é o próximo; depois de terminado, não", async () => {
    const durante = new Date("2026-12-10T13:30:00Z"); // 10:30 em São Paulo, no meio do das 10:00 às 11:00
    expect((await emA((tx) => proximoEUltimoPorPet(tx, tutorId, durante))).get(rexId)?.proximo?.id).toBe(ids.proximo);
    const depois = new Date("2026-12-10T14:30:00Z");
    expect((await emA((tx) => proximoEUltimoPorPet(tx, tutorId, depois))).get(rexId)?.proximo?.id).toBe(ids.depois);
  });

  it("outra empresa não vê o histórico (RLS), e id inválido não consulta", async () => {
    expect((await emB((tx) => proximoEUltimoPorPet(tx, tutorId, AGORA))).size).toBe(0);
    expect((await emA((tx) => proximoEUltimoPorPet(tx, "não-é-uuid", AGORA))).size).toBe(0);
  });
});
