"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  criarDonaAcao,
  criarEmpresaAcao,
  encerrarSessoesAcao,
  redefinirSenhaAcao,
  type EstadoFormulario,
} from "@/app/admin/acoes";
import { enviarSemLimpar } from "@/app/envio-sem-limpar";

const inicial: EstadoFormulario = { tipo: "inicial" };

const CLASSES = { erro: "mensagem-erro", ok: "mensagem-sucesso", parcial: "mensagem-aviso" } as const;

// Formulários do painel com noValidate (regra 13, QA B6): sem a validação do navegador, as mensagens em português
// vêm do servidor (módulo administracao), e o que foi digitado continua nos campos (enviarSemLimpar).

/** Erro de um campo só (a senha): aparece no campo, não na mensagem do formulário. */
function erroDaSenha(estado: EstadoFormulario): string | undefined {
  return estado.tipo === "erro" && estado.campo === "senha" ? estado.mensagem : undefined;
}

/** Atributos do campo de senha com o erro dele (o leitor de tela lê o erro junto com o campo). */
function atributosDaSenha(id: string, erro: string | undefined, dica?: string) {
  const descricoes = [erro ? `${id}-erro` : null, dica].filter(Boolean).join(" ");
  return { ...(erro ? { "aria-invalid": true as const } : {}), ...(descricoes ? { "aria-describedby": descricoes } : {}) };
}

function ErroDoCampo({ id, erro }: { id: string; erro: string | undefined }) {
  if (!erro) return null;
  return (
    <p id={`${id}-erro`} className="erro-campo">
      {erro}
    </p>
  );
}

function Mensagem({ estado }: { estado: EstadoFormulario }) {
  if (estado.tipo === "inicial" || erroDaSenha(estado)) return null;
  return (
    <p className={`mensagem ${CLASSES[estado.tipo]}`} role="status">
      {estado.mensagem}
      {estado.tipo === "parcial" && (
        <>
          {" "}
          <a href={`#empresa-${estado.empresaId}`}>Ir para {estado.empresaNome}</a>
        </>
      )}
    </p>
  );
}

/**
 * Limpa o formulário depois de um envio bem-sucedido (senhas não ficam na tela) e depois da criação parcial (a
 * empresa já existe: reenviar criaria outra). Com erro, o que foi digitado fica (enviarSemLimpar), inclusive a senha,
 * que não volta do servidor.
 */
function useLimparAoConcluir(estado: EstadoFormulario) {
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.tipo === "ok" || estado.tipo === "parcial") formulario.current?.reset();
  }, [estado]);
  return formulario;
}

function CamposDona({ prefixo, estado }: { prefixo: string; estado: EstadoFormulario }) {
  const senha = `${prefixo}-dona-senha`;
  const erro = erroDaSenha(estado);
  return (
    <>
      <div className="campo">
        <label htmlFor={`${prefixo}-dona-nome`}>Nome da dona</label>
        <input id={`${prefixo}-dona-nome`} name="donaNome" autoComplete="off" />
      </div>
      <div className="campo">
        <label htmlFor={`${prefixo}-dona-email`}>E-mail da dona</label>
        <input
          id={`${prefixo}-dona-email`}
          name="donaEmail"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="off"
        />
      </div>
      <div className="campo">
        <label htmlFor={senha}>Senha provisória</label>
        <input
          id={senha}
          name="donaSenha"
          type="text"
          autoComplete="new-password"
          autoCapitalize="none"
          {...atributosDaSenha(senha, erro, `${senha}-dica`)}
        />
        <span id={`${senha}-dica`} className="dica">
          De 8 a 128 caracteres. Passe para a dona por um canal seguro.
        </span>
        <ErroDoCampo id={senha} erro={erro} />
      </div>
    </>
  );
}

export function FormularioNovaEmpresa({ fusos }: { fusos: { valor: string; nome: string }[] }) {
  const [estado, acao, enviando] = useActionState(criarEmpresaAcao, inicial);
  const formulario = useLimparAoConcluir(estado);

  return (
    <form ref={formulario} action={acao} onSubmit={enviarSemLimpar(acao)} className="formulario" noValidate>
      <div className="campo">
        <label htmlFor="empresa-nome">Nome da empresa</label>
        <input id="empresa-nome" name="nome" autoComplete="off" />
      </div>
      <div className="campo">
        <label htmlFor="empresa-fuso">Fuso horário</label>
        <select id="empresa-fuso" name="fusoHorario" defaultValue="America/Sao_Paulo">
          {fusos.map((fuso) => (
            <option key={fuso.valor} value={fuso.valor}>
              {fuso.nome}
            </option>
          ))}
        </select>
      </div>
      <CamposDona prefixo="nova" estado={estado} />
      <Mensagem estado={estado} />
      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Criando…" : "Criar empresa e dona"}
      </button>
    </form>
  );
}

export function FormularioCriarDona({ empresaId }: { empresaId: string }) {
  const [estado, acao, enviando] = useActionState(criarDonaAcao, inicial);
  const formulario = useLimparAoConcluir(estado);

  return (
    <form ref={formulario} action={acao} onSubmit={enviarSemLimpar(acao)} className="formulario" noValidate>
      <input type="hidden" name="empresaId" value={empresaId} />
      <CamposDona prefixo={empresaId} estado={estado} />
      <Mensagem estado={estado} />
      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Criando…" : "Criar dona"}
      </button>
    </form>
  );
}

export function FormularioRedefinirSenha({ usuarioId }: { usuarioId: string }) {
  const [estado, acao, enviando] = useActionState(redefinirSenhaAcao, inicial);
  const formulario = useLimparAoConcluir(estado);

  return (
    <form ref={formulario} action={acao} onSubmit={enviarSemLimpar(acao)} className="formulario" noValidate>
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <div className="campo">
        <label htmlFor={`senha-${usuarioId}`}>Nova senha</label>
        <input
          id={`senha-${usuarioId}`}
          name="novaSenha"
          type="text"
          autoComplete="new-password"
          autoCapitalize="none"
          {...atributosDaSenha(`senha-${usuarioId}`, erroDaSenha(estado))}
        />
        <ErroDoCampo id={`senha-${usuarioId}`} erro={erroDaSenha(estado)} />
      </div>
      <Mensagem estado={estado} />
      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Redefinindo…" : "Redefinir senha"}
      </button>
    </form>
  );
}

export function FormularioEncerrarSessoes({ usuarioId }: { usuarioId: string }) {
  const [estado, acao, enviando] = useActionState(encerrarSessoesAcao, inicial);

  return (
    <form action={acao} className="formulario">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <p className="dica">Desconecta a usuária de todos os aparelhos. Ela continua com a mesma senha.</p>
      <Mensagem estado={estado} />
      <button type="submit" className="botao-secundario" disabled={enviando}>
        {enviando ? "Encerrando…" : "Encerrar sessões"}
      </button>
    </form>
  );
}
