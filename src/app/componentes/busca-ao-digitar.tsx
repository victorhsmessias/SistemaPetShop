"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icone } from "@/app/componentes/icone";

const PAUSA_MS = 300;

/**
 * Busca que filtra enquanto a dona digita: depois de uma pausa curta, troca o `?busca=` da URL (sem nova entrada no
 * histórico) e o servidor devolve a lista filtrada, com as mesmas regras de sempre (sem acento, por pet e por
 * telefone). Rótulo visível. Sem JavaScript, o Enter envia o formulário normalmente.
 */
export function BuscaAoDigitar({
  rotulo,
  valorInicial,
  placeholder,
  ocultos = {},
}: {
  rotulo: string;
  valorInicial: string;
  placeholder?: string;
  /** Outros parâmetros da URL que a busca mantém (dia e hora do agendamento). */
  ocultos?: Record<string, string>;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [valor, setValor] = useState(valorInicial);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(espera.current), []);

  const buscar = (texto: string) => {
    const parametros = new URLSearchParams(ocultos);
    if (texto.trim()) parametros.set("busca", texto.trim());
    const consulta = parametros.toString();
    router.replace(consulta ? `${caminho}?${consulta}` : caminho, { scroll: false });
  };

  return (
    <form className="busca-ao-digitar" role="search" action={caminho}>
      {Object.entries(ocultos).map(([nome, v]) => (
        <input key={nome} type="hidden" name={nome} value={v} />
      ))}
      <label htmlFor="busca">{rotulo}</label>
      <span className="busca-campo">
        <Icone nome="busca" />
        <input
          id="busca"
          name="busca"
          type="search"
          value={valor}
          onChange={(evento) => {
            const texto = evento.target.value;
            setValor(texto);
            clearTimeout(espera.current);
            espera.current = setTimeout(() => buscar(texto), PAUSA_MS);
          }}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
        />
      </span>
    </form>
  );
}
