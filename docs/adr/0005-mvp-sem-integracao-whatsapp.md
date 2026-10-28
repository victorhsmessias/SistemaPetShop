# 0005 — MVP sem integração com o WhatsApp: lembrete com um toque

- Status: aceito
- Contexto: o Victor não quer conectar automação ao WhatsApp da loja no início. Lembretes reduzem faltas, mas não podem depender de uma API agora.
- Decisão: o app monta a mensagem e abre o WhatsApp com um link `wa.me`. A dona envia, e marca a confirmação à mão. O aviso de pet pronto funciona do mesmo jeito.
- Alternativas consideradas:
  - Evolution API já no MVP.
  - API oficial (Cloud API).
- Consequências:
  - Positivas: sem custo, sem risco de banimento e nada novo para operar.
  - Negativas: cada mensagem exige um toque dela, e não há leitura automática da resposta do tutor. Num iPhone com WhatsApp e WhatsApp Business, o link abre primeiro o pessoal, que oferece "Abrir no WhatsApp Business" ([Privyr](https://help.privyr.com/knowledge-base/whatsapp-vs-whatsapp-business/)). Isso precisa ser testado no aparelho dela.
