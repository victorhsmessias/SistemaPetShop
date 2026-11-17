import type { ReactNode } from "react";

// Ícones SVG desenhados à mão (traço de 2 px, grade de 24), da proposta visual da sessão 07. Sem biblioteca.
// Decorativos: aria-hidden. O nome acessível fica no texto ou no aria-label do botão ou link que os contém.

const DESENHOS = {
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>
    </>
  ),
  semana: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M9 10v11M15 10v11M8 3v4M16 3v4"/>
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.8 14.1c2.8.3 4.7 2.5 4.7 5.4"/>
    </>
  ),
  servicos: (
    <>
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>
    </>
  ),
  financeiro: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10.5h18M7 3.5h10"/><circle cx="16.5" cy="15" r="1.3" fill="currentColor" stroke="none"/>
    </>
  ),
  mais: (
    <>
      <path d="M12 5v14M5 12h14"/>
    </>
  ),
  esq: (
    <>
      <path d="M15 5l-7 7 7 7"/>
    </>
  ),
  dir: (
    <>
      <path d="M9 5l7 7-7 7"/>
    </>
  ),
  baixo: (
    <>
      <path d="M5 9l7 7 7-7"/>
    </>
  ),
  check: (
    <>
      <path d="M5 12.5l4.5 4.5L19 7.5"/>
    </>
  ),
  alerta: (
    <>
      <path d="M12 3.5 2.8 19.5h18.4Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/>
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12M18 6 6 18"/>
    </>
  ),
  pontos: (
    <>
      <circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>
    </>
  ),
  conversa: (
    <>
      <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5Z"/><path d="M7.5 10h9M7.5 13h6"/>
    </>
  ),
  fone: (
    <>
      <path d="M6.6 3.5h3l1.5 4.2-2.1 1.5a12 12 0 0 0 5.8 5.8l1.5-2.1 4.2 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"/>
    </>
  ),
  sair: (
    <>
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M15 8l4 4-4 4M19 12H9"/>
    </>
  ),
  busca: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>
    </>
  ),
  pata: (
    <>
      <ellipse cx="12" cy="16" rx="4.6" ry="3.9" fill="currentColor" stroke="none"/><circle cx="6.3" cy="10.6" r="2.1" fill="currentColor" stroke="none"/><circle cx="9.8" cy="6.7" r="2.1" fill="currentColor" stroke="none"/><circle cx="14.2" cy="6.7" r="2.1" fill="currentColor" stroke="none"/><circle cx="17.7" cy="10.6" r="2.1" fill="currentColor" stroke="none"/>
    </>
  ),
  pix: (
    <>
      <path d="M12 3l9 9-9 9-9-9Z"/><path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12Z"/>
    </>
  ),
  dinheiro: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>
    </>
  ),
  cartao: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6 15h4"/>
    </>
  ),
  desfazer: (
    <>
      <path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-3"/>
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>
    </>
  ),
  calcheck: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M8.5 15.2l2.5 2.5 4.5-4.5"/>
    </>
  ),
  sino: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 21a2 2 0 0 0 4 0"/>
    </>
  ),
  gota: (
    <>
      <path d="M12 3.5c3.5 4.2 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 2.5-6.3 6-10.5Z"/>
    </>
  ),
  checkcirc: (
    <>
      <circle cx="12" cy="12" r="9"/><path d="M7.8 12.3l2.9 2.9 5.5-5.6"/>
    </>
  ),
  xcirc: (
    <>
      <circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>
    </>
  ),
  proibido: (
    <>
      <circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>
    </>
  ),
  lapis: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M13.5 6.5l4 4"/>
    </>
  ),
  casa: (
    <>
      <path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NomeDoIcone = keyof typeof DESENHOS;

export function Icone({ nome, className }: { nome: NomeDoIcone; className?: string }) {
  return (
    <svg className={className ? `ic ${className}` : "ic"} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {DESENHOS[nome]}
    </svg>
  );
}
