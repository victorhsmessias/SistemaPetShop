"use client";

import { useEffect, useState } from "react";

import { Icone } from "@/app/componentes/icone";

const VISIVEL_MS = 6000;

/**
 * Aviso curto de sucesso (role="status": o leitor de tela anuncia). Ao aparecer, tira da URL os parâmetros que o
 * trouxeram (sem nova entrada no histórico): recarregar não repete o aviso. Some sozinho depois de alguns segundos,
 * ou com o ×.
 */
export function AvisoDeSucesso({ mensagem, parametros }: { mensagem: string; parametros: string[] }) {
  const [visivel, setVisivel] = useState(true);
  const nomes = parametros.join(",");

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const nome of nomes.split(",")) url.searchParams.delete(nome);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const tempo = setTimeout(() => setVisivel(false), VISIVEL_MS);
    return () => clearTimeout(tempo);
  }, [nomes]);

  if (!visivel) return null;
  return (
    <div className="aviso-de-sucesso" role="status">
      <Icone nome="checkcirc" />
      <span>{mensagem}</span>
      <button type="button" className="botao-texto" aria-label="Fechar o aviso" onClick={() => setVisivel(false)}>
        <Icone nome="x" />
      </button>
    </div>
  );
}
