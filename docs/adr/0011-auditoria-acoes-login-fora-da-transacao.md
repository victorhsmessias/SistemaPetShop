# 0011 — Auditoria das ações de login fora da transação

- Status: proposto
- Contexto: o ADR 0008 manda gravar a auditoria na mesma transação da alteração. O Better Auth grava usuárias e senhas pela própria conexão, então criar usuária e redefinir senha não cabem numa transação junto com o registro na auditoria.
- Decisão:
  - Para ações feitas pelo Better Auth, a auditoria é gravada fora da transação da ação.
  - A redefinição de senha grava um evento antes da ação e outro com o resultado (concluída ou falhou).
  - A criação de usuária grava o evento logo depois. Se essa gravação falhar, a usuária é removida.
  - Nenhum evento leva dado de senha.
  - O resto do ADR 0008 continua valendo.
- Alternativas consideradas:
  - Gravar só depois da ação, com erro no log se a auditoria falhar.
  - Trigger nas tabelas do Better Auth: grava na mesma transação, mas não sabe quem fez a ação, porque a conexão do Better Auth não carrega o autor.
  - Gravar usuárias e senhas direto no banco, sem o Better Auth.
- Consequências:
  - Positivas: nenhuma ação de login concluída fica sem registro, e o Better Auth continua cuidando do hash das senhas e das sessões.
  - Negativas: quando a ação falha, fica um evento de início seguido do evento de falha. O painel do administrador ganha um pouco mais de código.
