import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "banho-e-tosa",
  description: "Agenda, pacotes e financeiro para banho e tosa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
