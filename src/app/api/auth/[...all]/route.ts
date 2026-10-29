import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/modules/acesso/auth";

export const { GET, POST } = toNextJsHandler(auth);
