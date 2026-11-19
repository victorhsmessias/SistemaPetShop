"use client";

import { useEffect } from "react";

/** No dia de hoje, abre a grade já na linha "agora" (sem animação, uma vez, ao abrir a página). */
export function RolarParaAgora() {
  useEffect(() => {
    document.querySelector(".grade .agora")?.scrollIntoView({ block: "center" });
  }, []);
  return null;
}
