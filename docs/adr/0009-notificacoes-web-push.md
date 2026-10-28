# 0009 — Notificações da dona por Web Push no app instalado

- Status: aceito
- Contexto: sem integração com o WhatsApp, o resumo do dia precisa de outro canal. A piloto usa iPhone.
- Decisão: app instalável (PWA) com Web Push, usando chaves VAPID. No iPhone isso exige iOS 16.4 ou mais novo, o app adicionado à tela de início e a permissão concedida depois de um toque dela ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- Alternativas consideradas:
  - E-mail.
  - WhatsApp enviado pelo número da loja, que exige integração.
  - App nativo.
- Consequências:
  - Positivas: grátis e sem loja de aplicativos.
  - Negativas: depende da instalação na tela de início e da permissão. A entrega não é garantida, por isso o resumo também aparece ao abrir o app.
