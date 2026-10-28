# 0006 — Evolution API para a integração futura com o WhatsApp

- Status: aceito, adiado para depois do MVP (ADR 0005)
- Contexto: lembretes automáticos exigem uma API. A oficial cobra mensagens de serviço desde 01/10/2026 e exige templates. A Z-API custa R$ 99,99 por instância por mês.
- Decisão: quando houver integração, usar a Evolution API hospedada na própria VPS, com uma instância por empresa. O tutor confirma respondendo "1 ou 2", no lugar de botões. O envio passa pela fila (ADR 0007), com chave de idempotência por lembrete.
- Alternativas consideradas:
  - API oficial (Cloud API) com coexistência.
  - Z-API.
- Consequências:
  - Positivas: sem mensalidade e sem custo por mensagem.
  - Negativas: não é oficial, então há risco de banimento do número, e isso precisa constar nos termos de uso. O Victor vira o suporte da conexão (QR code, quedas e atualizações).
