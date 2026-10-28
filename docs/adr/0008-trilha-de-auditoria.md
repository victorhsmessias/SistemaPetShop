# 0008 — Trilha de auditoria: saldo calculado e lançamentos sem exclusão

- Status: aceito
- Contexto: saldo de pacote e dinheiro geram contestação ("eu tinha mais uma sessão"). Com várias empresas, também é preciso rastrear o que o suporte fez.
- Decisão:
  - O saldo do pacote é calculado a partir dos atendimentos.
  - Lançamentos são cancelados com motivo, nunca apagados.
  - Alterações no financeiro, nos pacotes e no status dos atendimentos, e as ações do administrador, vão para uma tabela de auditoria na mesma transação.
- Alternativas consideradas:
  - Contador de saldo editável.
  - Exclusão física, com registro só no log da aplicação.
- Consequências:
  - Positivas: há histórico para mostrar ao tutor e para o suporte. Um erro de saldo se corrige recalculando.
  - Negativas: a consulta de saldo fica um pouco mais cara, o que é irrelevante nesse volume. A tabela de auditoria cresce e precisa de índice por empresa e data.
