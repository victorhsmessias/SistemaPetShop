# 0003 — Hospedagem na VPS do Victor com EasyPanel

- Status: aceito
- Contexto: o Victor já tem uma VPS com EasyPanel. O volume é baixo e o custo importa no início do produto.
- Decisão: o app, um Postgres próprio do produto e, no futuro, a Evolution rodam como serviços no EasyPanel dessa VPS. O backup diário vai para o Cloudflare R2.
- Alternativas consideradas:
  - VPS dedicada ao produto.
  - Plataforma gerenciada (Vercel e banco gerenciado).
- Consequências:
  - Positivas: custo marginal perto de zero e um ambiente que o Victor já conhece.
  - Negativas: ponto único de falha, dividido com outros projetos. Exige limites de recursos por serviço, monitor externo e backup fora da VPS. O produto deve ir para uma VPS própria quando a receita das assinaturas cobrir o custo.
