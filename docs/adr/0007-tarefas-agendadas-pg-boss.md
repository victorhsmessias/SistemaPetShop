# 0007 — Tarefas agendadas no Postgres com pg-boss, sem n8n

- Status: aceito
- Contexto: o produto precisa de tarefas com hora marcada: resumo do dia, despesas fixas, vencimento de pacotes e, no futuro, lembretes. Essas tarefas leem e alteram os dados do próprio app.
- Decisão: usar o pg-boss dentro do app, com nova tentativa automática, histórico e reprocessamento manual pelo painel do administrador.
- Alternativas consideradas:
  - n8n.
  - Cron do sistema operacional.
  - Redis com BullMQ.
- Consequências:
  - Positivas: nada novo para operar. A regra fica no mesmo repositório que o resto do código, com testes, e as tarefas podem alterar dados na mesma transação.
  - Negativas: o processamento roda junto com o app ou num segundo serviço com o mesmo código. Não há a interface visual do n8n.
