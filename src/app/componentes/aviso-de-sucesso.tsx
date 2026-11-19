"use client";

import { useEffect, useState } from "react";

import { Icone } from "@/app/componentes/icone";

const VISIVEL_MS = 6000;
/** Espera antes de pôr o texto na região viva, para o leitor de tela já a conhecer vazia. */
const ANUNCIO_MS = 150;

/**
 * Aviso curto de sucesso. Ao aparecer, tira da URL os parâmetros que o trouxeram (sem nova entrada no histórico):
 * recarregar não repete o aviso.
 *
 * Anúncio (U6/T8 da revisão): a região role="status" nasce vazia e o texto entra logo depois. Uma região viva que já
 * aparece preenchida muitas vezes não é lida (no VoiceOver do iOS, principalmente); o que muda dentro dela, sim.
 * Some sozinho depois de alguns segundos, ou com o ×; o tempo para enquanto o × tem o foco ou o mouse (WCAG 2.2.1).
 */
export function AvisoDeSucesso({ mensagem, parametros }: { mensagem: string; parametros: string[] }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [pausado, setPausado] = useState(false);
  const nomes = parametros.join(",");

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const nome of nomes.split(",")) url.searchParams.delete(nome);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    // Um aviso novo sempre começa com o tempo correndo: o componente continua montado quando só os parâmetros da
    // rota mudam (N2 da conferência).
    const anuncio = setTimeout(() => {
      setPausado(false);
      setTexto(mensagem);
    }, ANUNCIO_MS);
    return () => clearTimeout(anuncio);
  }, [nomes, mensagem]);

  useEffect(() => {
    if (!texto || pausado) return;
    const tempo = setTimeout(() => setTexto(null), VISIVEL_MS);
    return () => clearTimeout(tempo);
  }, [texto, pausado]);

  return (
    <div role="status" className="regiao-do-aviso">
      {texto && (
        <div className="aviso-de-sucesso">
          <Icone nome="checkcirc" />
          <span>{texto}</span>
          <button
            type="button"
            className="botao-texto"
            aria-label="Fechar o aviso"
            onClick={() => {
              // Fechar tira o botão antes do blur e do mouseleave: sem isto, a pausa ficaria ligada (N2 da conferência).
              setPausado(false);
              setTexto(null);
            }}
            onFocus={() => setPausado(true)}
            onBlur={() => setPausado(false)}
            onMouseEnter={() => setPausado(true)}
            onMouseLeave={() => setPausado(false)}
          >
            <Icone nome="x" />
          </button>
        </div>
      )}
    </div>
  );
}
