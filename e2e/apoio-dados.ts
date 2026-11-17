// Textos dos dados preparados que os testes também conferem na tela. Fora de e2e/apoio.ts para o teste não carregar
// o servidor (banco e Better Auth) só para ler uma constante.

/** Nome com 120 caracteres e espaços (o máximo do cadastro), como uma dona digitaria um nome completo comprido. */
export const NOME_LONGO = "Maria Aparecida dos Santos Pereira de Albuquerque Cavalcanti Figueiredo Nascimento Rodrigues Oliveira Souza Lima Castro"
  .padEnd(120, " x")
  .slice(0, 120);
export const SERVICO_LONGO = "Banho completo com hidratação profunda, tosa na tesoura, corte de unhas, limpeza de ouvidos e perfume especial da casa"
  .padEnd(120, " x")
  .slice(0, 120);
