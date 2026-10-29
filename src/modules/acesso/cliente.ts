import { createAuthClient } from "better-auth/react";

// Cliente do navegador. O login passa por aqui (rota HTTP /api/auth) para valer o limite de
// tentativas: chamadas auth.api feitas no servidor não contam no limite.
export const authClient = createAuthClient();
