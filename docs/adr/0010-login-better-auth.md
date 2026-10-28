# 0010 — Login com e-mail e senha usando Better Auth

- Status: aceito
- Contexto: um produto com várias empresas precisa de login seguro, sem autenticação feita à mão. Não há e-mail transacional no MVP.
- Decisão:
  - Better Auth com e-mail e senha, sessão em cookie httpOnly e limite de tentativas de login.
  - Cada usuária pertence a uma empresa.
  - O administrador redefine senhas até existir e-mail transacional.
- Alternativas consideradas:
  - Auth.js, mantido pela equipe do Better Auth desde setembro de 2025, que recomenda o Better Auth para projetos novos ([anúncio](https://www.better-auth.com/blog/authjs-joins-better-auth)).
  - Autenticação própria.
  - Login sem senha, por link no e-mail.
- Consequências:
  - Positivas: biblioteca ativa e de código aberto, com sessão e limite de tentativas prontos.
  - Negativas: dependência de terceiro, e a redefinição de senha é manual até haver e-mail.
