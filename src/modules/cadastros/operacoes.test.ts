import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarConexoes } from "@/db/clientes";
import { comEmpresa } from "@/db/com-empresa";
import { apagarEmpresas, criarEmpresaComDados, usuarioTeste, type DadosEmpresa } from "@/db/testes/apoio";
import { criarPet, definirPetAtivo, editarPet, listarPetsDoTutor, obterPet } from "@/modules/cadastros/pets";
import { buscarTutores, criarTutor, editarTutor, obterTutor } from "@/modules/cadastros/tutores";
import {
  criarServico,
  definirServicoAtivo,
  editarServico,
  listarServicos,
  obterServico,
} from "@/modules/catalogo/servicos";

// Operações de tutores, pets e serviços contra o Postgres de verdade.

let a: DadosEmpresa;
let b: DadosEmpresa;
let joaoId: string;
let rexId: string;

const naEmpresa =
  (empresa: () => DadosEmpresa) =>
  <T>(fn: Parameters<typeof comEmpresa<T>>[2]) =>
    comEmpresa(empresa().empresaId, usuarioTeste, fn);
const emA = naEmpresa(() => a);
const emB = naEmpresa(() => b);

function idDe(resultado: { ok: boolean; valor?: { id: string } }) {
  if (!resultado.ok || !resultado.valor) throw new Error(`esperava ok: ${JSON.stringify(resultado)}`);
  return resultado.valor.id;
}

beforeAll(async () => {
  a = await criarEmpresaComDados("Operações A");
  b = await criarEmpresaComDados("Operações B");

  joaoId = idDe(
    await emA((tx) => criarTutor(tx, { nome: "João Conceição", telefone: "(11) 98888-1111", observacoes: "" })),
  );
  rexId = idDe(
    await emA((tx) => criarPet(tx, joaoId, { nome: "Rex", especie: "cao", porte: "G", observacoes: "Morde se assustado" })),
  );
  idDe(await emA((tx) => criarPet(tx, joaoId, { nome: "Pérola", especie: "gato", porte: "P" })));
  idDe(await emA((tx) => criarTutor(tx, { nome: "Ana Lúcia", telefone: "11 3456-7890" })));
});

afterAll(async () => {
  await apagarEmpresas([a?.empresaId, b?.empresaId].filter((id): id is string => Boolean(id)));
  await encerrarConexoes();
});

const nomes = (lista: { nome: string }[]) => lista.map((t) => t.nome);

describe("busca de tutores", () => {
  it.each([
    ["joão", "nome com acento, minúsculo"],
    ["JOAO", "nome sem acento, maiúsculo"],
    ["conceicao", "sobrenome sem cedilha nem til"],
    ["rex", "nome do pet"],
    ["PEROLA", "pet sem acento"],
    ["98888", "parte do telefone"],
    ["(11) 98888-1111", "telefone com máscara"],
    ["+55 11 98888 1111", "telefone com o 55"],
  ])("%j encontra João (%s)", async (busca) => {
    expect(nomes(await emA((tx) => buscarTutores(tx, busca)))).toEqual(["João Conceição"]);
  });

  it("acha pelo telefone fixo e lista com os pets ativos", async () => {
    expect(nomes(await emA((tx) => buscarTutores(tx, "3456-7890")))).toEqual(["Ana Lúcia"]);
    const [joao] = await emA((tx) => buscarTutores(tx, "joao"));
    expect(joao!.pets).toEqual(["Pérola", "Rex"]);
  });

  it("sem busca lista todos em ordem de nome, sem diferenciar acento", async () => {
    expect(nomes(await emA((tx) => buscarTutores(tx, "")))).toEqual(["Ana Lúcia", "João Conceição", "Tutor Operações A"]);
  });

  it("% e _ digitados não viram curinga", async () => {
    expect(await emA((tx) => buscarTutores(tx, "%"))).toEqual([]);
    expect(await emA((tx) => buscarTutores(tx, "_"))).toEqual([]);
  });

  it("não encontra nada da outra empresa", async () => {
    expect(await emB((tx) => buscarTutores(tx, "joao"))).toEqual([]);
    expect(await emB((tx) => buscarTutores(tx, "98888"))).toEqual([]);
  });
});

describe("telefone do tutor", () => {
  it("é guardado como +55 + DDD + número", async () => {
    expect((await emA((tx) => obterTutor(tx, joaoId)))!.telefone).toBe("+5511988881111");
  });

  it("repetido na mesma empresa é recusado, com o tutor já cadastrado", async () => {
    const resultado = await emA((tx) => criarTutor(tx, { nome: "Outro", telefone: "11988881111" }));
    expect(resultado).toMatchObject({ ok: false, tutorExistenteId: joaoId });
    if (!resultado.ok) expect(resultado.erros.telefone).toContain("João Conceição");
  });

  it("repetido ao editar outro tutor também é recusado; manter o próprio é aceito", async () => {
    const [ana] = await emA((tx) => buscarTutores(tx, "ana"));
    const trocar = await emA((tx) => editarTutor(tx, ana!.id, { nome: "Ana Lúcia", telefone: "(11) 98888-1111" }));
    expect(trocar).toMatchObject({ ok: false, tutorExistenteId: joaoId });

    const manter = await emA((tx) =>
      editarTutor(tx, joaoId, { nome: "João Conceição", telefone: "+55 11 98888-1111", observacoes: "Prefere manhã" }),
    );
    expect(manter).toEqual({ ok: true, valor: { id: joaoId } });
  });

  it("duas gravações simultâneas com o mesmo telefone: uma passa, a outra recebe o tutor já cadastrado", async () => {
    const [primeiro, segundo] = await Promise.all([
      emA((tx) => criarTutor(tx, { nome: "Toque 1", telefone: "(31) 97777-2222" })),
      emA((tx) => criarTutor(tx, { nome: "Toque 2", telefone: "(31) 97777-2222" })),
    ]);
    const resultados = [primeiro, segundo];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const recusado = resultados.find((r) => !r.ok);
    expect(recusado).toMatchObject({ ok: false, tutorExistenteId: expect.any(String) });
  });

  it("o mesmo telefone em outra empresa é aceito", async () => {
    const resultado = await emB((tx) => criarTutor(tx, { nome: "Homônimo", telefone: "(11) 98888-1111" }));
    expect(resultado.ok).toBe(true);
  });

  it("formato inválido volta com a mensagem do campo", async () => {
    const resultado = await emA((tx) => criarTutor(tx, { nome: "", telefone: "123" }));
    expect(resultado).toMatchObject({ ok: false, erros: { nome: "Informe o nome.", telefone: expect.stringContaining("DDD") } });
  });
});

describe("pets", () => {
  it("valida espécie e porte", async () => {
    const resultado = await emA((tx) => criarPet(tx, joaoId, { nome: "Bidu", especie: "dragao", porte: "XL" }));
    expect(resultado).toMatchObject({ ok: false, erros: { especie: "Escolha a espécie.", porte: "Escolha o porte." } });
  });

  it("desativado sai da lista do tutor e da busca; com inativos, aparece; reativado volta", async () => {
    await emA((tx) => definirPetAtivo(tx, rexId, false));

    expect(nomes(await emA((tx) => listarPetsDoTutor(tx, joaoId)))).toEqual(["Pérola"]);
    expect(nomes(await emA((tx) => listarPetsDoTutor(tx, joaoId, true)))).toEqual(["Pérola", "Rex"]);
    expect(await emA((tx) => buscarTutores(tx, "rex"))).toEqual([]);
    expect((await emA((tx) => buscarTutores(tx, "joao")))[0]!.pets).toEqual(["Pérola"]);

    await emA((tx) => definirPetAtivo(tx, rexId, true));
    expect(nomes(await emA((tx) => buscarTutores(tx, "rex")))).toEqual(["João Conceição"]);
  });
});

describe("serviços", () => {
  it("cadastra com preço em reais e guarda em centavos", async () => {
    const id = idDe(await emA((tx) => criarServico(tx, { nome: "Banho e tosa", preco: "R$ 1.234,50", duracao: "90" })));
    expect(await emA((tx) => obterServico(tx, id))).toMatchObject({ precoCentavos: 123450, duracaoMin: 90, ativo: true });
  });

  it("recusa preço e duração inválidos com mensagens claras", async () => {
    const resultado = await emA((tx) => criarServico(tx, { nome: "Tosa", preco: "45.50", duracao: "0" }));
    expect(resultado).toMatchObject({
      ok: false,
      erros: { preco: expect.stringContaining("vírgula"), duracao: expect.stringContaining("minutos") },
    });
  });

  it("desativado sai da lista principal, aparece com os inativos e continua no banco", async () => {
    const id = idDe(await emA((tx) => criarServico(tx, { nome: "Hidratação", preco: "30", duracao: "20" })));
    await emA((tx) => definirServicoAtivo(tx, id, false));

    expect(nomes(await emA((tx) => listarServicos(tx)))).not.toContain("Hidratação");
    expect(nomes(await emA((tx) => listarServicos(tx, true)))).toContain("Hidratação");
    expect(await emA((tx) => obterServico(tx, id))).toMatchObject({ ativo: false });
  });
});

describe("isolamento pelas operações: a empresa A não lê nem altera registros da B", () => {
  it("não lê tutor, pet nem serviço da B pelo id", async () => {
    expect(await emA((tx) => obterTutor(tx, b.tutorId))).toBeNull();
    expect(await emA((tx) => obterPet(tx, b.petId))).toBeNull();
    expect(await emA((tx) => obterServico(tx, b.servicoId))).toBeNull();
    expect(await emA((tx) => listarPetsDoTutor(tx, b.tutorId, true))).toEqual([]);
  });

  it("não altera, não desativa e não cria pet para tutor da B", async () => {
    const naoEncontrado = { ok: false, erros: { geral: expect.stringContaining("não encontrado") } };
    expect(await emA((tx) => editarTutor(tx, b.tutorId, { nome: "Invadido", telefone: "(21) 99999-0000" }))).toMatchObject(
      naoEncontrado,
    );
    expect(await emA((tx) => editarPet(tx, b.petId, { nome: "Invadido", especie: "cao", porte: "P" }))).toMatchObject(
      naoEncontrado,
    );
    expect(await emA((tx) => definirPetAtivo(tx, b.petId, false))).toMatchObject(naoEncontrado);
    expect(await emA((tx) => criarPet(tx, b.tutorId, { nome: "Intruso", especie: "cao", porte: "P" }))).toMatchObject(
      naoEncontrado,
    );
    expect(await emA((tx) => editarServico(tx, b.servicoId, { nome: "X", preco: "1", duracao: "1" }))).toMatchObject(
      naoEncontrado,
    );
    expect(await emA((tx) => definirServicoAtivo(tx, b.servicoId, false))).toMatchObject(naoEncontrado);

    // Nada mudou na B.
    expect(await emB((tx) => obterTutor(tx, b.tutorId))).toMatchObject({ nome: "Tutor Operações B" });
    expect(await emB((tx) => obterPet(tx, b.petId))).toMatchObject({ nome: "Pet Operações B", ativo: true });
    expect(await emB((tx) => obterServico(tx, b.servicoId))).toMatchObject({ precoCentavos: 5000, ativo: true });
  });

  it("id malformado não chega ao banco", async () => {
    expect(await emA((tx) => obterTutor(tx, "nao-e-uuid"))).toBeNull();
    expect(await emA((tx) => editarServico(tx, "1; drop table servico", { nome: "X", preco: "1", duracao: "1" }))).toMatchObject({
      ok: false,
    });
  });
});
