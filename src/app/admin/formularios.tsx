"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  criarDonaAcao,
  criarEmpresaAcao,
  redefinirSenhaAcao,
  type EstadoFormulario,
} from "@/app/admin/acoes";

const inicial: EstadoFormulario = { tipo: "inicial" };

function Mensagem({ estado }: { estado: EstadoFormulario }) {
  if (estado.tipo === "inicial") return null;
  return (
    <p className={`mensagem ${estado.tipo === "ok" ? "mensagem-sucesso" : "mensagem-erro"}`} role="status">
      {estado.mensagem}
    </p>
  );
}

/** Limpa o formulário depois de um envio bem-sucedido (senhas não ficam na tela). */
function useLimparAoConcluir(estado: EstadoFormulario) {
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.tipo === "ok") formulario.current?.reset();
  }, [estado]);
  return formulario;
}

function CamposDona({ prefixo }: { prefixo: string }) {
  return (
    <>
      <div className="campo">
        <label htmlFor={`${prefixo}-dona-nome`}>Nome da dona</label>
        <input id={`${prefixo}-dona-nome`} name="donaNome" autoComplete="off" required />
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
          required
        />
      </div>
      <div className="campo">
        <label htmlFor={`${prefixo}-dona-senha`}>Senha provisória</label>
        <input
          id={`${prefixo}-dona-senha`}
          name="donaSenha"
          type="text"
          autoComplete="new-password"
          autoCapitalize="none"
          minLength={8}
          required
        />
        <span className="dica">Mínimo de 8 caracteres. Passe para a dona por um canal seguro.</span>
      </div>
    </>
  );
}

export function FormularioNovaEmpresa({ fusos }: { fusos: { valor: string; nome: string }[] }) {
  const [estado, acao, enviando] = useActionState(criarEmpresaAcao, inicial);
  const formulario = useLimparAoConcluir(estado);

  return (
    <form ref={formulario} action={acao} className="formulario">
      <div className="campo">
        <label htmlFor="empresa-nome">Nome da empresa</label>
        <input id="empresa-nome" name="nome" autoComplete="off" required />
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
      <CamposDona prefixo="nova" />
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
    <form ref={formulario} action={acao} className="formulario">
      <input type="hidden" name="empresaId" value={empresaId} />
      <CamposDona prefixo={empresaId} />
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
    <form ref={formulario} action={acao} className="formulario">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <div className="campo">
        <label htmlFor={`senha-${usuarioId}`}>Nova senha</label>
        <input
          id={`senha-${usuarioId}`}
          name="novaSenha"
          type="text"
          autoComplete="new-password"
          autoCapitalize="none"
          minLength={8}
          required
        />
      </div>
      <Mensagem estado={estado} />
      <button type="submit" className="botao-primario" disabled={enviando}>
        {enviando ? "Redefinindo…" : "Redefinir senha"}
      </button>
    </form>
  );
}
